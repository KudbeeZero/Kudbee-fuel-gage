// services/agent/town-kilo.js
// ---------------------------------------------------------------------------
// Kilo Gas Town replication — the agent-control engine.
//
// This is the Kudbee port of the Kilo Gas Town v1.2.1 control plane. It
// implements the primitives Kilo uses to drive a town of agents:
//
//   • Beads      — every unit of work has a lifecycle (open → in_progress →
//                  in_review → closed/failed). Beads have priority + parents
//                  (dependencies) forming a DAG.
//   • Reconciler — THE engine. Ticks every RECONCILER_TICK_MS, and on each tick:
//                    1. Drains events (status changes, completions, failures)
//                    2. Evaluates rules (which beads are ready given deps)
//                    3. Emits dispatch actions (assign ready beads to polecats)
//                    4. Enforces invariants (no double-dispatch, no orphaned
//                       in_progress beads, bounded retries)
//   • Witness    — health monitor: detects polecats whose bead has been
//                  in_progress too long (stuck) and nudges/recycles them.
//   • Refinery   — adversarial review gate: a completed bead must pass review
//                  before it can be closed (micro-adversarial loop).
//
// Persistence mirrors Kilo's git-backed hooks + jsonl bead DB: every mutation
// is appended to .kilo/town/beads.jsonl so town state survives restarts.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Town state lives under the repo's .kilo/town (matching where phone-tree/call-log live).
const TOWN_DIR = path.join(__dirname, '..', '..', '.kilo', 'town');
const BEADS_FILE = path.join(TOWN_DIR, 'beads.jsonl');
const CONVOYS_FILE = path.join(TOWN_DIR, 'convoys.jsonl');
const HEARTBEATS_FILE = path.join(TOWN_DIR, 'heartbeats.jsonl');

// Tuning (mirrors Kilo defaults).
const RECONCILER_TICK_MS = 5000;
const STUCK_MS = 30 * 60 * 1000; // Witness: bead in_progress > 30m => stuck
const MAX_RETRIES = 3; // bounded retries (invariant)

export const BEAD_STATUS = ['open', 'in_progress', 'in_review', 'closed', 'failed'];
export const TOWN_ROLES = ['mayor', 'polecat', 'refinery', 'witness', 'dogs'];

// ---------------------------------------------------------------------------
// Persistence (JSONL — append-only, survives restarts)
// ---------------------------------------------------------------------------

function ensureDir() {
  try { fs.mkdirSync(TOWN_DIR, { recursive: true }); } catch {}
}

function appendJsonl(file, obj) {
  ensureDir();
  // Validate path stays under TOWN_DIR.
  if (path.dirname(file) !== TOWN_DIR) return false;
  try {
    fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

function readJsonl(file) {
  ensureDir();
  try {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Rebuild state from disk on boot (mirrors Kilo hooks replay).
export function loadTown() {
  const beads = readJsonl(BEADS_FILE);
  const convoys = readJsonl(CONVOYS_FILE);
  const heartbeats = readJsonl(HEARTBEATS_FILE);
  return { beads, convoys, heartbeats };
}

// ---------------------------------------------------------------------------
// Bead + convoy creation
// ---------------------------------------------------------------------------

export function createBead({
  title,
  body = '',
  priority = 'medium',
  parents = [],
  role = 'polecat',
  convoyId = null,
}) {
  const id = `hd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const bead = {
    id,
    title,
    body,
    priority, // low | medium | high | critical
    parents, // parent bead ids that must be closed before this can dispatch
    role,
    convoyId,
    status: 'open', // open → in_progress → in_review → closed | failed
    retries: 0,
    assignee: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    error: null,
  };
  appendJsonl(BEADS_FILE, bead);
  return bead;
}

export function createConvoy({ title, description = '', beadIds = [] }) {
  const id = `convoy-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const convoy = {
    id,
    title,
    description,
    beadIds,
    status: 'staged', // staged → active → closed
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  appendJsonl(CONVOYS_FILE, convoy);
  return convoy;
}

// ---------------------------------------------------------------------------
// Reconciler — the engine that drives the town
//   Each tick (5s): drain → evaluate → dispatch → enforce
// ---------------------------------------------------------------------------

function dispatchReadyBeads(beads, convoys) {
  const dispatched = [];
  for (const bead of beads) {
    if (bead.status !== 'open') continue;
    // Invariant: dependencies must be satisfied (all parents closed/removed).
    const parentsSatisfied = (bead.parents || []).every((pid) => {
      const p = beads.find((b) => b.id === pid);
      return !p || p.status === 'closed';
    });
    if (!parentsSatisfied) continue;
    // Enforce capacity: no double-dispatch of the same bead.
    if (beads.some((b) => b.id !== bead.id && b.assignee === bead.role && b.status === 'in_progress')) {
      continue; // one in-flight bead per role lane (bounded concurrency)
    }
    bead.status = 'in_progress';
    bead.assignee = bead.role; // role stands in for the polecat id
    bead.updatedAt = new Date().toISOString();
    appendJsonl(BEADS_FILE, bead);
    dispatched.push(bead.id);
  }
  // Activate any convoy whose beads are now running.
  if (convoys && dispatched.length) {
    for (const convoy of convoys) {
      if (convoy.status === 'staged' && (convoy.beadIds || []).some((id) => beads.find((b) => b.id === id)?.status === 'in_progress')) {
        convoy.status = 'active';
        convoy.updatedAt = new Date().toISOString();
        appendJsonl(CONVOYS_FILE, convoy);
      }
    }
  }
  return dispatched;
}

function finalizeBeads(beads) {
  const closedIds = new Set();
  for (const bead of beads) {
    if (bead.status === 'in_review') {
      // Refinery adversarial gate: a bead in review is only closed when a
      // review marker is set. In this engine, review is modeled by the
      // transition in_review → closed via completeReview(); auto-close here
      // is intentionally NOT done (review is the gate).
      continue;
    }
  }
  return closedIds.size;
}

export function tick(beads, convoys) {
  const dispatched = dispatchReadyBeads(beads, convoys);
  finalizeBeads(beads);
  return { dispatched, tickedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Witness — health monitor (detect stuck polecats)
// ---------------------------------------------------------------------------

export function witnessInspect(beads) {
  const stuck = [];
  const now = Date.now();
  for (const bead of beads) {
    if (bead.status === 'in_progress' && bead.updatedAt) {
      const ageMs = now - new Date(bead.updatedAt).getTime();
      if (ageMs > STUCK_MS && bead.retries < MAX_RETRIES) {
        stuck.push({ id: bead.id, assignee: bead.assignee, ageMs });
        bead.retries += 1;
        bead.status = 'open'; // recycle back to open (Witness nudges + recycles)
        bead.updatedAt = new Date().toISOString();
        appendJsonl(BEADS_FILE, bead);
      } else if (ageMs > STUCK_MS) {
        // Exhausted retries: fail the bead (bounded).
        bead.status = 'failed';
        bead.error = 'stuck: retries exhausted';
        bead.updatedAt = new Date().toISOString();
        appendJsonl(BEADS_FILE, bead);
      }
    }
  }
  return stuck;
}

// ---------------------------------------------------------------------------
// Actions used by the Mayor / agents
// ---------------------------------------------------------------------------

export function startBead(beadId, beads) {
  const b = beads.find((x) => x.id === beadId);
  if (!b || b.status !== 'open') return null;
  b.status = 'in_progress';
  b.assignee = b.role;
  b.updatedAt = new Date().toISOString();
  appendJsonl(BEADS_FILE, b);
  return b;
}

export function completeBead(beadId, result, beads) {
  const b = beads.find((x) => x.id === beadId);
  if (!b || b.status !== 'in_progress') return null;
  // Send to Refinery for adversarial review before close.
  b.status = 'in_review';
  b.result = result;
  b.updatedAt = new Date().toISOString();
  appendJsonl(BEADS_FILE, b);
  return b;
}

export function completeReview(beadId, approved, note, beads) {
  const b = beads.find((x) => x.id === beadId);
  if (!b || b.status !== 'in_review') return null;
  if (approved) {
    b.status = 'closed';
    b.closedAt = new Date().toISOString();
    b.reviewNote = note || 'approved';
  } else {
    b.status = 'in_progress'; // send back for revision (micro-adversarial loop)
    b.reviewNote = note || 'needs revision';
    b.updatedAt = new Date().toISOString();
  }
  appendJsonl(BEADS_FILE, b);
  return b;
}

export function heartbeatsSnapshot() {
  return readJsonl(HEARTBEATS_FILE);
}

// In-flight town state (loaded fresh on each call so the dashboard reflects
// persisted reality — mirrors Kilo reading from beads store).
export function getTownState() {
  const { beads, convoys, heartbeats } = loadTown();
  return {
    beads: beads.length,
    convoys: convoys.length,
    byStatus: beads.reduce((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {}),
    openReady: beads.filter((b) => b.status === 'open' && (b.parents || []).every((p) => !beads.find((x) => x.id === p) || beads.find((x) => x.id === p).status === 'closed')).length,
    inReview: beads.filter((b) => b.status === 'in_review').length,
    stuck: witnessInspect(beads).length,
    roles: TOWN_ROLES,
    reconcilerTickMs: RECONCILER_TICK_MS,
    heartbeats: heartbeats.slice(-20),
  };
}

export default { createBead, createConvoy, tick, witnessInspect, startBead, completeBead, completeReview, getTownState, TOWN_ROLES };
