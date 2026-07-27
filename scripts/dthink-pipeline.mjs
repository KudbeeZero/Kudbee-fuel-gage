#!/usr/bin/env node
/**
 * scripts/dthink-pipeline.mjs
 * ---------------------------------------------------------------------------
 * DTHINK — Distributed THINK Pipeline
 *
 * A shared consciousness layer where every command execution, agent action,
 * decision, recall, and bus event is captured and made available to ALL
 * other agents via a lightweight, efficient, TypeScript-contracted stream.
 *
 * Principles:
 *   - Every command feeds into DTHINK automatically
 *   - All agents see the same pipeline — no divergence
 *   - Contracts enforced (TypeScript interfaces)
 *   - Lightweight: file-based, TTL-evicted, no heavy dependencies
 *   - Efficient: append-only stream with periodic compaction
 *
 * Storage:
 *   .kilo/memory/dthink/stream.jsonl       — append-only JSONLines stream
 *   .kilo/memory/dthink/contracts.ts        — TypeScript contracts (canonical)
 *   .kilo/memory/dthink/index.json          — quick lookup index
 *
 * Usage (module):
 *   import { dthink, feed, snapshot, query } from './dthink-pipeline.mjs';
 *
 * Usage (CLI):
 *   node scripts/dthink-pipeline.mjs feed <entry>    Feed an entry
 *   node scripts/dthink-pipeline.mjs tail [n]         Show last n entries
 *   node scripts/dthink-pipeline.mjs stats            Pipeline statistics
 *   node scripts/dthink-pipeline.mjs compact           Compact stream
 *   node scripts/dthink-pipeline.mjs contracts         Show contracts
 * ---------------------------------------------------------------------------
 */

import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const DTHINK_DIR = join(REPO_ROOT, '.kilo', 'memory', 'dthink');
const STREAM_PATH = join(DTHINK_DIR, 'stream.jsonl');
const INDEX_PATH = join(DTHINK_DIR, 'index.json');
const MAX_STREAM_SIZE = 500;       // Max entries before compaction
const COMPACT_THRESHOLD = 300;     // Keep after compaction

mkdirSync(DTHINK_DIR, { recursive: true });

// ─── TypeScript Contracts ───────────────────────────────────────────────────

export const CONTRACTS_TS = `/**
 * DTHINK Pipeline Contracts
 * Canonical TypeScript interfaces for the Distributed THINK pipeline.
 * All agents conform to these types. Violations = contract breach.
 */

/* ── Entry types ─────────────────────────────────── */

export type DThinkEntryType =
  | 'command:exec'      // A slash command was executed
  | 'agent:action'      // A terminal agent performed an action
  | 'agent:decision'    // A terminal agent made a decision
  | 'agent:recall'      // A snippet/pattern was recalled
  | 'agent:call'        // A phone call was made
  | 'agent:voicemail'   // A voicemail was left
  | 'bus:event'         // A serial bus event was published
  | 'cache:invalidate'  // A cache entry was invalidated
  | 'think:inject'      // A think token was injected
  | 'system:health'     // A health check result
  | 'system:sync'       // A terminal↔UI sync was performed
  | 'human:handoff';    // A human-in-the-loop handoff

/* ── Contract severity ────────────────────────────── */

export type DThinkSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

/* ── Entry payload (what gets stored) ─────────────── */

export interface DThinkEntry {
  /** Unique ID — uuid v4 */
  id: string;

  /** Entry type from the enum above */
  type: DThinkEntryType;

  /** Agent that produced this entry */
  agentId: string;

  /** Timestamp in ISO 8601 */
  timestamp: string;

  /** Severity level */
  severity: DThinkSeverity;

  /** The command or action that triggered this */
  trigger: string;

  /** Human-readable summary */
  summary: string;

  /** Optional structured data payload */
  data?: Record<string, unknown>;

  /** Optional contract version */
  contractVersion?: string;
}

/* ── Pipeline snapshot ─────────────────────────────── */

export interface DThinkSnapshot {
  /** Timestamp of snapshot */
  timestamp: string;

  /** Total entries processed */
  totalEntries: number;

  /** Entries by type */
  byType: Record<string, number>;

  /** Entries by agent */
  byAgent: Record<string, number>;

  /** Most recent entries (last 10) */
  recent: DThinkEntry[];

  /** Stream size in bytes */
  streamSizeBytes: number;

  /** Is the stream healthy */
  healthy: boolean;
}

/* ── Contracts (rules all agents must follow) ──────── */

export const DTHINK_CONTRACTS = {
  /** Every command execution MUST produce a DThinkEntry */
  RULE_COMMAND_FEED: 'Every /command execution produces a DThinkEntry with type "command:exec"',

  /** Every agent action MUST produce a DThinkEntry */
  RULE_AGENT_FEED: 'Every agent action (run, decide, recall, call) produces a corresponding entry',

  /** All entries MUST have a valid id, timestamp, and agentId */
  RULE_VALID_ENTRY: 'All entries have: id (uuid), timestamp (ISO 8601), agentId (non-empty)',

  /** Severity MUST match the entry type — no silent errors */
  RULE_SEVERITY: 'CRITICAL entries trigger BUS→CACHE flush. ERROR entries logged to bus. WARN entries logged locally.',

  /** Other agents MUST NOT mutate another agent\'s entries */
  RULE_IMMUTABILITY: 'Entries are append-only and immutable once written',

  /** The stream MUST NOT exceed 500 entries — auto-compact at threshold */
  RULE_COMPACTION: 'Stream limited to 500 entries. Auto-compaction keeps last 300 and writes summary entry.',
} as const;
`;

// ─── Pipeline engine ───────────────────────────────────────────────────────

/** @type {{ entries: Array<{id:string, type:string, agentId:string, timestamp:string}>, totalEntries: number } | null} */
let _index = null;

function loadIndex() {
  try {
    if (existsSync(INDEX_PATH)) _index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    _index = { entries: [], totalEntries: 0 };
  }
  return _index;
}

function saveIndex() {
  if (_index) writeFileSync(INDEX_PATH, JSON.stringify(_index, null, 2), 'utf8');
}

export function feed(entry) {
  const id = crypto.randomUUID();
  const fullEntry = {
    id,
    type: entry.type || 'system:health',
    agentId: entry.agentId || 'system',
    timestamp: new Date().toISOString(),
    severity: entry.severity || 'INFO',
    trigger: entry.trigger || 'manual',
    summary: entry.summary || entry.type,
    data: entry.data || {},
    contractVersion: '1.0.0',
  };

  // Append to stream
  try {
    appendFileSync(STREAM_PATH, JSON.stringify(fullEntry) + '\n', 'utf8');
  } catch (err) {
    // Silent fail — pipeline is non-blocking
  }

  // Update index
  loadIndex();
  _index.entries.push({ id, type: fullEntry.type, agentId: fullEntry.agentId, timestamp: fullEntry.timestamp });
  _index.totalEntries += 1;
  saveIndex();

  // Auto-compact if over threshold
  if (_index.entries.length > MAX_STREAM_SIZE) {
    compact();
  }

  return id;
}

export function tail(n = 20) {
  if (!existsSync(STREAM_PATH)) return [];
  try {
    const lines = readFileSync(STREAM_PATH, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

export function query(filter = {}, limit = 50) {
  if (!existsSync(STREAM_PATH)) return [];
  try {
    const lines = readFileSync(STREAM_PATH, 'utf8').trim().split('\n').filter(Boolean);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let filtered = entries;
    if (filter.type) filtered = filtered.filter(e => e.type === filter.type);
    if (filter.agentId) filtered = filtered.filter(e => e.agentId === filter.agentId);
    if (filter.since) filtered = filtered.filter(e => e.timestamp >= filter.since);
    return filtered.reverse().slice(0, limit);
  } catch {
    return [];
  }
}

export function compact() {
  if (!existsSync(STREAM_PATH)) return 0;
  try {
    const lines = readFileSync(STREAM_PATH, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length <= COMPACT_THRESHOLD) return 0;

    const kept = lines.slice(-COMPACT_THRESHOLD);
    const removed = lines.length - kept.length;

    // Write compaction summary as first entry
    const summary = {
      id: crypto.randomUUID(),
      type: 'system:compact',
      agentId: 'dthink',
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      trigger: 'auto-compact',
      summary: `Compacted ${removed} entries. ${kept.length} retained.`,
      data: { removed, retained: kept.length },
      contractVersion: '1.0.0',
    };

    writeFileSync(STREAM_PATH, JSON.stringify(summary) + '\n' + kept.join('\n') + '\n', 'utf8');

    // Rebuild index
    _index = { entries: kept.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).map(e => ({ id: e.id, type: e.type, agentId: e.agentId, timestamp: e.timestamp })), totalEntries: (loadIndex().totalEntries || 0) };
    _index.entries.unshift({ id: summary.id, type: 'system:compact', agentId: 'dthink', timestamp: summary.timestamp });
    saveIndex();

    return removed;
  } catch {
    return 0;
  }
}

export function snapshot() {
  loadIndex();
  const entries = tail(10);
  const byType = {};
  const byAgent = {};
  for (const e of entries) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    byAgent[e.agentId] = (byAgent[e.agentId] || 0) + 1;
  }

  let streamSizeBytes = 0;
  try { streamSizeBytes = statSync(STREAM_PATH).size; } catch {}

  return {
    timestamp: new Date().toISOString(),
    totalEntries: _index?.totalEntries || 0,
    byType,
    byAgent,
    recent: entries,
    streamSizeBytes,
    healthy: (_index?.totalEntries || 0) > 0,
  };
}

// ─── Auto-feed wrapper for commands ─────────────────────────────────────────

export function dthink(entry) {
  return feed({
    type: entry.type || 'command:exec',
    agentId: entry.agentId || 'system',
    trigger: entry.trigger || 'manual',
    summary: entry.summary || '',
    severity: entry.severity || 'INFO',
    data: entry.data,
  });
}

// ─── Contracts writer ───────────────────────────────────────────────────────

function writeContracts() {
  const path = join(DTHINK_DIR, 'contracts.ts');
  writeFileSync(path, CONTRACTS_TS, 'utf8');
  return path;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'feed': {
      const type = process.argv[3] || 'command:exec';
      const summary = process.argv[4] || 'manual-entry';
      const id = feed({ type, summary, trigger: 'cli' });
      console.log(`  [DTHINK] ${id} → ${type}: ${summary}`);
      break;
    }

    case 'tail':
    case 'recent': {
      const n = parseInt(process.argv[3]) || 20;
      const entries = tail(n);
      console.log(`\n  DTHINK Pipeline — last ${entries.length}/${n} entries:\n`);
      for (const e of (entries)) {
        const ts = (e.timestamp || '').slice(11, 19);
        const icon = e.severity === 'CRITICAL' ? '⚡' : e.severity === 'ERROR' ? '✗' : e.severity === 'WARN' ? '⚠' : '✓';
        console.log(`  ${icon} ${ts} ${(e.type || '?').padEnd(18)} ${(e.agentId || '?').slice(0, 15).padEnd(15)} ${(e.summary || '').slice(0, 60)}`);
      }
      console.log();
      break;
    }

    case 'stats':
    case 'snapshot': {
      const snap = snapshot();
      console.log(`\n  ╔══════════════════════════════════════════════════╗`);
      console.log(`  ║  DTHINK PIPELINE STATISTICS                     ║`);
      console.log(`  ╠══════════════════════════════════════════════════╣`);
      console.log(`  ║  entries:   ${String(snap.totalEntries).padEnd(37)}║`);
      console.log(`  ║  size:      ${(snap.streamSizeBytes / 1024).toFixed(1)}`.padEnd(36) + `KB ║`);
      console.log(`  ║  healthy:   ${String(snap.healthy).padEnd(37)}║`);
      console.log(`  ╠══════════════════════════════════════════════════╣`);
      if (Object.keys(snap.byType).length > 0) {
        console.log(`  ║  By type:                                       ║`);
        for (const [t, c] of Object.entries(snap.byType)) {
          console.log(`  ║    ${t.padEnd(30)} ${String(c).padStart(6)}         ║`);
        }
      }
      if (Object.keys(snap.byAgent).length > 0) {
        console.log(`  ║  By agent:                                      ║`);
        for (const [a, c] of Object.entries(snap.byAgent)) {
          console.log(`  ║    ${a.slice(0, 25).padEnd(30)} ${String(c).padStart(6)}         ║`);
        }
      }
      console.log(`  ╚══════════════════════════════════════════════════╝\n`);
      break;
    }

    case 'compact':
    case 'clean': {
      const removed = compact();
      console.log(`  [DTHINK] Compacted: ${removed} entries removed\n`);
      break;
    }

    case 'contracts':
    case 'rules': {
      const path = writeContracts();
      console.log(`  [DTHINK] Contracts written to ${path}`);
      console.log(`  \n${CONTRACTS_TS.split('\n').filter(l => l.startsWith('  RULE_')).join('\n')}\n`);
      break;
    }

    case 'init':
    case 'bootstrap': {
      mkdirSync(DTHINK_DIR, { recursive: true });
      writeContracts();
      if (!existsSync(STREAM_PATH)) writeFileSync(STREAM_PATH, '', 'utf8');
      if (!existsSync(INDEX_PATH)) writeFileSync(INDEX_PATH, JSON.stringify({ entries: [], totalEntries: 0 }, null, 2), 'utf8');
      const initId = feed({ type: 'system:init', summary: 'DTHINK pipeline initialized', trigger: 'bootstrap' });
      console.log(`  [DTHINK] Pipeline initialized: ${initId}\n`);
      break;
    }

    default:
      console.log(`
  DTHINK Pipeline — Distributed THINK

  Shared consciousness layer. Every command, action, decision, and event
  feeds into this pipeline. All agents see the same stream.

  Commands:
    init             Initialize the pipeline
    feed <t> <s>     Feed an entry (type + summary)
    tail [n]         Show last n entries (default 20)
    stats            Pipeline statistics + snapshot
    compact          Compact stream (keep last 300)
    contracts        Show TypeScript contracts + rules

  Contracts: .kilo/memory/dthink/contracts.ts
  Stream:    .kilo/memory/dthink/stream.jsonl (JSONLines)
  Index:     .kilo/memory/dthink/index.json

  Rules:
    ${CONTRACTS_TS.split('\n').filter(l => l.startsWith('  RULE_')).map(l => l.replace('  RULE_', '  ').replace(': \'', ' → ').replace('\',', '')).join('\n  ')}
`);
  }
}
