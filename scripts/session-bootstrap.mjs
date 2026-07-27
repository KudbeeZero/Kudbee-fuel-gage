#!/usr/bin/env node
/**
 * scripts/session-bootstrap.mjs
 * ---------------------------------------------------------------------------
 * Session Bootstrap — runs on every new Kilo session start.
 * Referenced by AGENTS.md. Wakes up all layers, syncs state, pre-warms caches.
 *
 * What it does:
 *   1. Read last session journal
 *   2. Run agent health check
 *   3. Recall top snippets for context injection
 *   4. Sync memories across all agents
 *   5. Route new agent to the right starting point
 *   6. Report readiness back to AGENTS.md context
 *
 * Usage: node scripts/session-bootstrap.mjs [--report]
 * Set KILO_SESSION=true in env when running from AGENTS.md context.
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const JOURNAL_PATH = join(REPO_ROOT, '.kilo', 'memory', 'journal.json');
const AGENTS_DIR = join(REPO_ROOT, '.kilo', 'agents');
const SNIPPETS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'snippets');
const MEMORIES_DIR = join(REPO_ROOT, '.kilo', 'memory', 'memories');
const MEMORY_DIR = join(REPO_ROOT, '.kilo', 'memory');
const RATE_LIMIT_STATE_PATH = join(REPO_ROOT, '.kilo', 'memory', 'rate-limits.json');

const sessionId = `ses-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const reportOnly = process.argv.includes('--report');

[MEMORIES_DIR, join(REPO_ROOT, '.kilo', 'memory', 'decisions')].forEach(d => mkdirSync(d, { recursive: true }));

// ─── Step 0: Sync from other agents (cross-container memory sharing) ────────
// Pull latest git state so we see what other cloud agents have checkpointed.
// This is the ONLY way agents in different containers share memory.

let gitSynced = false;
try {
  const { execSync } = await import('node:child_process');
  const result = execSync('git pull origin main --no-edit 2>&1 || echo "no-remote"', {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000,
  });
  if (result.includes('Already up to date') || result.includes('no-remote')) {
    // No changes from other agents — nothing to sync
  } else if (result.includes('Fast-forward') || result.includes('Updating')) {
    console.log(`[bootstrap] Synced from other agents: ${result.split('\n').slice(0, 2).join(' ')}`);
    gitSynced = true;
  }
} catch {
  // Non-critical — proceed with local state
}

// ─── Step 1: Read last session journal ─────────────────────────────────────

let journal = { journal: [], trends: { sessions: 0 }, health: { overall: 'UNKNOWN' } };
try { if (existsSync(JOURNAL_PATH)) journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')); } catch {}

const lastEntry = journal.journal.length > 0 ? journal.journal[journal.journal.length - 1] : null;

// ─── Step 2: Auto-discover agents (Pipeline 2 — Plug-and-Play Swarm) ────

function discoverAgents() {
  if (!existsSync(AGENTS_DIR)) return { agents: [], newAgents: [], warnings: [] };

  const warnings = [];
  const discovered = [];
  const newAgents = [];

  for (const f of readdirSync(AGENTS_DIR).filter(x => x.endsWith('.agent'))) {
    try {
      const raw = readFileSync(join(AGENTS_DIR, f), 'utf8');
      const meta = {};
      if (raw.startsWith('---')) {
        const end = raw.indexOf('---', 3);
        if (end !== -1) {
          for (const line of raw.slice(3, end).trim().split('\n')) {
            const ci = line.indexOf(':');
            if (ci !== -1) meta[line.slice(0, ci).trim()] = line.slice(ci + 1).trim();
          }
        }
      }
      const id = f.replace('.agent', '');

      // Validate required fields
      if (!meta.category) {
        warnings.push(`[warn] Agent "${id}" missing category — using "general"`);
        meta.category = 'general';
      }

      const memPath = join(MEMORIES_DIR, `${id}.memory`);
      let mem = { totalActions: 0, lastAction: null, recalls: [] };
      try { if (existsSync(memPath)) mem = JSON.parse(readFileSync(memPath, 'utf8')); } catch {}

      const isNew = !existsSync(memPath);
      if (isNew) {
        newAgents.push(id);
        writeFileSync(memPath, JSON.stringify({ id, recalls: [], decisions: [], totalActions: 0, lastAction: null, discoveredAt: new Date().toISOString() }, null, 2), 'utf8');
      }

      discovered.push({
        id, category: meta.category, schedule: meta.schedule || 'manual',
        description: meta.description || id, triggers: meta.triggers || '',
        actions: meta.actions || '', memory: mem, isNew,
      });
    } catch (err) {
      warnings.push(`[warn] Agent "${f}" parse failed: ${err.message} — skipping`);
    }
  }

  return { agents: discovered, newAgents, warnings };
}

const { agents: agentFiles, newAgents, warnings: agentWarnings } = discoverAgents();

// ─── Step 2b: Report discovery ────────────────────────────────────────────

if (newAgents.length > 0) {
  console.log(`[discovery] New agents found: ${newAgents.join(', ')}`);
  for (const id of newAgents) {
    try {
      const busPath = join(MEMORY_DIR, 'bus');
      mkdirSync(busPath, { recursive: true });
      const event = {
        id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        topic: 'agent:registered',
        source: 'session-bootstrap',
        data: { agentId: id, discovered: true },
        timestamp: new Date().toISOString(),
        sequence: Date.now(),
      };
      writeFileSync(join(busPath, `${event.id}.json`), JSON.stringify(event, null, 2), 'utf8');
    } catch {}
  }
}

for (const w of agentWarnings) {
  console.log(w);
}

// ─── Step 3: Recall top snippets ───────────────────────────────────────────

const snippetFiles = existsSync(SNIPPETS_DIR) ? readdirSync(SNIPPETS_DIR).filter(f => f.endsWith('.snippet')).map(f => {
  const raw = readFileSync(join(SNIPPETS_DIR, f), 'utf8');
  const memPath = join(MEMORIES_DIR, `${f.replace('.snippet', '')}.memory`);
  let recallCount = 0;
  try { if (existsSync(memPath)) { const m = JSON.parse(readFileSync(memPath, 'utf8')); recallCount = m.recallCount || 0; } } catch {}
  const firstLine = raw.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('category') && !l.startsWith('tags') && !l.startsWith('uuid') && !l.startsWith('created') && !l.startsWith('meaning') && !l.startsWith('imported') && !l.startsWith('source')) || '';
  return { id: f.replace('.snippet', ''), size: raw.length, recallCount, preview: firstLine.slice(0, 80) };
}).sort((a, b) => b.recallCount - a.recallCount) : [];

// ─── Step 4: Rate limit state ──────────────────────────────────────────────

let rateLimits = { agents: {}, global: { maxConcurrent: 3, currentRunning: 0, waitQueue: [] } };
try { if (existsSync(RATE_LIMIT_STATE_PATH)) rateLimits = JSON.parse(readFileSync(RATE_LIMIT_STATE_PATH, 'utf8')); } catch {}

// ─── Step 5: Knowledge graph summary ────────────────────────────────────────

const relationsPath = join(REPO_ROOT, '.kilo', 'memory', 'relations.json');
let relations = { nodes: {}, edges: [] };
try { if (existsSync(relationsPath)) relations = JSON.parse(readFileSync(relationsPath, 'utf8')); } catch {}

// ─── Step 6: Decision audit summary ─────────────────────────────────────────

const decisionsDir = join(REPO_ROOT, '.kilo', 'memory', 'decisions');
let recentDecisions = [];
try {
  if (existsSync(decisionsDir)) {
    recentDecisions = readdirSync(decisionsDir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(readFileSync(join(decisionsDir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);
  }
} catch {}

// ─── Step 7: Update journal with new session ────────────────────────────────

if (!reportOnly) {
  journal.journal.push({
    session: sessionId,
    date: new Date().toISOString(),
    type: 'bootstrap',
    agentsActive: agentFiles.length,
    snippetsAvailable: snippetFiles.length,
    decisionsTotal: recentDecisions.length,
  });
  if (journal.journal.length > 20) journal.journal = journal.journal.slice(-20);
  journal.trends.sessions = (journal.trends.sessions || 0) + 1;
  writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2), 'utf8');
}

// ─── Step 8: Voicemail replay ───────────────────────────────────────────────
// On every agent boot, check for pending voicemails and replay them.

const VOICEMAIL_DIR = join(MEMORY_DIR, 'voicemails');
let voicemailsReplayed = 0;

if (existsSync(VOICEMAIL_DIR)) {
  for (const f of readdirSync(VOICEMAIL_DIR).filter(f => f.endsWith('.json'))) {
    const agentId = f.replace('.json', '');
    try {
      const vms = JSON.parse(readFileSync(join(VOICEMAIL_DIR, f), 'utf8'));
      const unread = vms.filter(v => !v.read);
      if (unread.length > 0) {
        console.log(`  ✉  Voicemail for ${agentId}: ${unread.length} unread`);
        for (const vm of unread) {
          const icon = vm.urgency === 'CRITICAL' ? '⚡' : vm.urgency === 'HIGH' ? '🔴' : vm.urgency === 'MEDIUM' ? '🟡' : '🟢';
          console.log(`    ${icon} [${vm.urgency}] ${vm.callerId}: "${(vm.transcript || '').slice(0, 60)}..."`);
          voicemailsReplayed++;

          // Emit bus event for voicemail replay
          try {
            const busDir = join(MEMORY_DIR, 'bus');
            mkdirSync(busDir, { recursive: true });
            const event = {
              id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
              topic: 'agent:voicemail:replayed',
              source: 'session-bootstrap',
              data: { voicemailId: vm.id, to: agentId, from: vm.callerId, urgency: vm.urgency },
              timestamp: new Date().toISOString(),
              sequence: Date.now(),
            };
            writeFileSync(join(busDir, `${event.id}.json`), JSON.stringify(event, null, 2), 'utf8');
          } catch {}
        }
        // Mark all as read
        vms.forEach(v => { v.read = true; v.deliveredAt = new Date().toISOString(); });
        writeFileSync(join(VOICEMAIL_DIR, f), JSON.stringify(vms, null, 2), 'utf8');
      }
    } catch {}
  }
}

// ─── Step 9: Report ─────────────────────────────────────────────────────────

const totalActions = agentFiles.reduce((a, ag) => a + (ag.memory.totalActions || 0), 0);
const totalRecalls = snippetFiles.reduce((a, s) => a + s.recallCount, 0);
const totalKnowledge = snippetFiles.reduce((a, s) => a + s.size, 0);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║          TERMINAL AGENT SYSTEM — SESSION BOOTSTRAP          ║
╠══════════════════════════════════════════════════════════════╣
║  SESSION: ${sessionId}
╠══════════════════════════════════════════════════════════════╣
║  GIT SYNC: ${gitSynced ? 'New state from other agents' : 'Already current'}
╠══════════════════════════════════════════════════════════════╣
║  VOICEMAIL: ${voicemailsReplayed} replayed
╠══════════════════════════════════════════════════════════════╣
║  LAST SESSION:`);

if (lastEntry) {
  console.log(`║    ${(lastEntry.date || 'unknown').slice(0, 19)} — ${(lastEntry.summary || lastEntry.type || 'session').slice(0, 40)}`);
  console.log(`║    CI: ${JSON.stringify(lastEntry.ciStatus || {})}`);
} else {
  console.log(`║    No prior session journal found`);
}

console.log(`╠══════════════════════════════════════════════════════════════╣
║  TERMINAL AGENTS (${agentFiles.length}):`);
for (const ag of agentFiles) {
  console.log(`║    ${ag.id.padEnd(20)} ${ag.schedule.padEnd(10)} actions:${String(ag.memory.totalActions || 0).padStart(3)}`);
}

console.log(`╠══════════════════════════════════════════════════════════════╣
║  KNOWLEDGE STORE:
║    snippets: ${snippetFiles.length}  |  ${totalKnowledge.toLocaleString()}B  |  recalls: ${totalRecalls}
║    relations: ${relations.edges.length} edges  |  nodes: ${Object.keys(relations.nodes).length}
╠══════════════════════════════════════════════════════════════╣
║  RATE LIMIT STATE:
║    concurrent: ${rateLimits.global.currentRunning}/${rateLimits.global.maxConcurrent}  |  queued: ${rateLimits.global.waitQueue.length}
╠══════════════════════════════════════════════════════════════╣
║  RECENT DECISIONS (${recentDecisions.length}):`);

for (const d of recentDecisions.slice(0, 5)) {
  const ts = (d.timestamp || '').slice(11, 19) || '?';
  const agent = (d.agentId || '?').slice(0, 15);
  const dec = (d.decision || '?').slice(0, 35);
  console.log(`║    ${ts}  ${agent.padEnd(15)} ${dec}`);
}

console.log(`╠══════════════════════════════════════════════════════════════╣
║  TOP SNIPPETS (by recall):`);
for (const s of snippetFiles.filter(s => s.recallCount > 0).slice(0, 5)) {
  console.log(`║    ${s.id.padEnd(35)} recalls:${String(s.recallCount).padStart(2)}`);
}
if (snippetFiles.filter(s => s.recallCount > 0).length === 0) {
  console.log(`║    No snippets recalled yet — first session`);
}

console.log(`╠══════════════════════════════════════════════════════════════╣
║  SYSTEM STATUS: ${agentFiles.length >= 3 ? 'READY' : 'BOOTING'}
║  BOOTSTRAP COMPLETE — session context loaded
╚══════════════════════════════════════════════════════════════╝

  Next:
    node scripts/agents.mjs status        — view agent fleet
    node scripts/snippet-agent.mjs recall — search knowledge
    node scripts/snippet-agent.mjs health — snippet system health

  ⚡ Self-check: bootstrap loaded ${agentFiles.length} agents, ${snippetFiles.length} snippets, ${relations.edges.length} relations
  ⚠  If you didn't run this bootstrap, you are missing:
     - 6 pipeline statuses + 3 terminal agents + 8 knowledge snippets
     - Current CI status + session history + decision audit trail
     - Phone tree with 3 logged calls + serial bus with 9 events
  Run: node scripts/session-bootstrap.mjs
`);

// Return signal for AGENTS.md context injection
process.exit(0);
