#!/usr/bin/env node
/**
 * scripts/terminal-cache.mjs
 * ---------------------------------------------------------------------------
 * Terminal Cache — persistent, TTL-aware caching layer for the entire
 * terminal agent system. Pre-warms on session start. Feeds all scripts.
 *
 * Cache tiers:
 *   L1: In-memory (process lifetime) — maps for agent state, snippets, graph
 *   L2: File cache (.kilo/cache/) — persists across sessions, TTL-evicted
 *
 * Usage:
 *   node scripts/terminal-cache.mjs warm          Pre-warm all caches
 *   node scripts/terminal-cache.mjs flush         Force-flush all caches
 *   node scripts/terminal-cache.mjs stats         Cache statistics
 *   node scripts/terminal-cache.mjs get <key>     Read a cached value
 *   node scripts/terminal-cache.mjs keys          List all cache keys
 *   node scripts/terminal-cache.mjs prune         Remove expired entries
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const CACHE_DIR = join(REPO_ROOT, '.kilo', 'cache');
const MEM_DIR = join(REPO_ROOT, '.kilo', 'memory');
const SNIPPETS_DIR = join(MEM_DIR, 'snippets');
const MEMORIES_DIR = join(MEM_DIR, 'memories');
const DECISIONS_DIR = join(MEM_DIR, 'decisions');
const AGENTS_DIR = join(REPO_ROOT, '.kilo', 'agents');
const RELATIONS_PATH = join(MEM_DIR, 'relations.json');
const JOURNAL_PATH = join(MEM_DIR, 'journal.json');
const RATE_PATH = join(MEM_DIR, 'rate-limits.json');
const QUEUE_PATH = join(MEM_DIR, 'wait-queue.json');

mkdirSync(CACHE_DIR, { recursive: true });

// ─── Cache Config ──────────────────────────────────────────────────────────

const CACHE_TTL = {
  'agent-state': 8000,       // 8s (matches UI poll)
  'snippet-list': 30000,     // 30s
  'snippet-recall': 15000,   // 15s
  'knowledge-graph': 30000,  // 30s
  'agent-memories': 15000,   // 15s
  'decisions-recent': 8000,  // 8s
  'journal': 60000,          // 60s
  'rate-limits': 5000,       // 5s
  'wait-queue': 5000,        // 5s
  'dashboard': 5000,         // 5s
  default: 15000,
};

// ─── In-memory L1 cache ────────────────────────────────────────────────────

const L1 = new Map();

function l1Get(key) {
  const entry = L1.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > (CACHE_TTL[key] || CACHE_TTL['default'])) {
    L1.delete(key);
    return null;
  }
  return entry.val;
}

function l1Set(key, val) {
  L1.set(key, { val, ts: Date.now() });
}

function l1Flush() { L1.clear(); }

// ─── File L2 cache ─────────────────────────────────────────────────────────

function l2Path(key) {
  return join(CACHE_DIR, `cache-${key.replace(/[^a-z0-9-]/g, '-')}.json`);
}

function l2Get(key) {
  try {
    const path = l2Path(key);
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (Date.now() - data.ts > (CACHE_TTL[key] || CACHE_TTL['default'])) {
      try { unlinkSync(path); } catch {}
      return null;
    }
    return data.val;
  } catch { return null; }
}

function l2Set(key, val) {
  try {
    writeFileSync(l2Path(key), JSON.stringify({ ts: Date.now(), val, ttl: CACHE_TTL[key] || CACHE_TTL['default'] }, null, 2), 'utf8');
  } catch {}
}

function l2Flush() {
  if (!existsSync(CACHE_DIR)) return;
  for (const f of readdirSync(CACHE_DIR)) {
    if (f.startsWith('cache-')) {
      try { unlinkSync(join(CACHE_DIR, f)); } catch {}
    }
  }
}

// ─── Unified API ───────────────────────────────────────────────────────────

export function cacheGet(key) {
  return l1Get(key) ?? l2Get(key);
}

export function cacheSet(key, val) {
  l1Set(key, val);
  l2Set(key, val);
}

export function cacheFlush() {
  l1Flush();
  l2Flush();
}

export function cacheStats() {
  const l1Size = L1.size;
  const l2Files = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).length : 0;
  let l2Bytes = 0;
  if (existsSync(CACHE_DIR)) {
    for (const f of readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'))) {
      try { l2Bytes += readFileSync(join(CACHE_DIR, f)).length; } catch {}
    }
  }
  return { l1Entries: l1Size, l2Files, l2Bytes, keys: [...L1.keys()] };
}

// ─── Data builders (what gets cached) ──────────────────────────────────────

function buildAgentState() {
  const agents = [];
  if (existsSync(AGENTS_DIR)) {
    for (const f of readdirSync(AGENTS_DIR).filter(x => x.endsWith('.agent'))) {
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
      const memPath = join(MEMORIES_DIR, `${id}.memory`);
      let mem = {};
      try { if (existsSync(memPath)) mem = JSON.parse(readFileSync(memPath, 'utf8')); } catch {}
      agents.push({
        id, category: meta.category, schedule: meta.schedule, description: meta.description,
        status: (meta.schedule === 'on-deploy' && !mem.totalActions) ? 'idle' : 'active',
        memory: { totalActions: mem.totalActions || 0, lastAction: mem.lastAction, recallCount: (mem.recalls || []).length },
      });
    }
  }

  const snippets = [];
  if (existsSync(SNIPPETS_DIR)) {
    for (const f of readdirSync(SNIPPETS_DIR).filter(x => x.endsWith('.snippet'))) {
      const raw = readFileSync(join(SNIPPETS_DIR, f), 'utf8');
      const id = f.replace('.snippet', '');
      const memPath = join(MEMORIES_DIR, `${id}.memory`);
      let recallCount = 0;
      try { if (existsSync(memPath)) { const m = JSON.parse(readFileSync(memPath, 'utf8')); recallCount = m.recallCount || 0; } } catch {}
      snippets.push({ id, size: raw.length, recallCount });
    }
  }

  let decisions = [];
  if (existsSync(DECISIONS_DIR)) {
    decisions = readdirSync(DECISIONS_DIR).filter(x => x.endsWith('.json')).map(f => {
      try { return JSON.parse(readFileSync(join(DECISIONS_DIR, f), 'utf8')); } catch { return null; }
    }).filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  let relations = {};
  try { if (existsSync(RELATIONS_PATH)) relations = JSON.parse(readFileSync(RELATIONS_PATH, 'utf8')); } catch {}

  let rate = { global: { maxConcurrent: 3, currentRunning: 0, waitQueue: [] } };
  try { if (existsSync(RATE_PATH)) rate = JSON.parse(readFileSync(RATE_PATH, 'utf8')); } catch {}

  let queue = { queued: [], processed: 0 };
  try { if (existsSync(QUEUE_PATH)) queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8')); } catch {}

  let journal = { trends: { sessions: 0 }, journal: [] };
  try { if (existsSync(JOURNAL_PATH)) journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')); } catch {}

  return {
    timestamp: new Date().toISOString(),
    agents,
    snippets: {
      total: snippets.length, totalSize: snippets.reduce((a, s) => a + s.size, 0),
      topRecalled: snippets.filter(s => s.recallCount > 0).sort((a, b) => b.recallCount - a.recallCount).slice(0, 5),
    },
    decisions: {
      total: decisions.length,
      recent: decisions.slice(0, 10),
    },
    knowledgeGraph: { nodes: Object.keys(relations.nodes || {}).length, edges: (relations.edges || []).length },
    rateLimits: rate,
    waitQueue: queue,
    journal: { sessions: journal.trends?.sessions || 0, lastEntry: journal.journal?.[journal.journal.length - 1] || null },
    cache: cacheStats(),
  };
}

// ─── Warm all caches ──────────────────────────────────────────────────────

function warmAll() {
  const state = buildAgentState();
  cacheSet('agent-state', state);
  cacheSet('dashboard', {
    agents: state.agents.length,
    snippets: state.snippets.total,
    decisions: state.decisions.total,
    rateUse: `${state.rateLimits.global.currentRunning}/${state.rateLimits.global.maxConcurrent}`,
    queueDepth: state.waitQueue.queued.length,
    status: state.agents.length >= 3 ? 'READY' : 'BOOTING',
    timestamp: state.timestamp,
  });
  return state;
}

// ─── Prune expired ─────────────────────────────────────────────────────────

function pruneExpired() {
  if (!existsSync(CACHE_DIR)) return;
  const now = Date.now();
  let pruned = 0;
  for (const f of readdirSync(CACHE_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const data = JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf8'));
      if (now - data.ts > (data.ttl || CACHE_TTL['default'])) {
        unlinkSync(join(CACHE_DIR, f));
        pruned++;
      }
    } catch {
      try { unlinkSync(join(CACHE_DIR, f)); pruned++; } catch {}
    }
  }
  return pruned;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'warm':
    case 'preload': {
      console.log(`  ═══ Terminal Cache Warm ═══`);
      const state = warmAll();
      console.log(`  [✓] L1 in-memory: ${cacheStats().l1Entries} entries`);
      console.log(`  [✓] L2 disk: ${cacheStats().l2Files} files, ${(cacheStats().l2Bytes / 1024).toFixed(1)}KB`);
      console.log(`  [✓] Agents: ${state.agents.length}  |  Snippets: ${state.snippets.total}  |  Decisions: ${state.decisions.total}`);
      console.log(`  [✓] Pre-warmed. Next poll is instant.\n`);
      break;
    }

    case 'flush': {
      cacheFlush();
      console.log(`  [+] All caches flushed.\n`);
      break;
    }

    case 'prune': {
      const n = pruneExpired();
      console.log(`  [+] Pruned ${n} expired cache entries.\n`);
      break;
    }

    case 'stats':
    case 'status': {
      const s = cacheStats();
      console.log(`\n  ╔══════════════════════════════════════╗`);
      console.log(`  ║  TERMINAL CACHE STATS                ║`);
      console.log(`  ╠══════════════════════════════════════╣`);
      console.log(`  ║  L1 (memory): ${String(s.l1Entries).padEnd(24)}║`);
      console.log(`  ║  L2 (disk):   ${String(s.l2Files).padEnd(24)}║`);
      console.log(`  ║  L2 size:     ${(s.l2Bytes / 1024).toFixed(1)}`.padEnd(33) + `KB ║`);
      console.log(`  ╠══════════════════════════════════════╣`);
      console.log(`  ║  TTL map (seconds):                  ║`);
      for (const [k, v] of Object.entries(CACHE_TTL)) {
        console.log(`  ║    ${k.padEnd(18)} ${String((v/1000).toFixed(0)+'s').padStart(4)}              ║`);
      }
      console.log(`  ╚══════════════════════════════════════╝\n`);
      break;
    }

    case 'get':
    case 'read': {
      const val = cacheGet(arg || 'dashboard');
      if (val) {
        console.log(JSON.stringify(val, null, 2));
      } else {
        console.log(`Cache miss for "${arg}". Run 'node scripts/terminal-cache.mjs warm' first.`);
      }
      break;
    }

    case 'keys':
    case 'list': {
      const s = cacheStats();
      console.log(`\n  Cache keys (${s.l1Entries}):\n`);
      for (const k of s.keys) console.log(`    ${k}`);
      console.log();
      break;
    }

    default:
      console.log(`
  Terminal Cache System

  Tiers:
    L1: In-memory (process lifetime) — ${CACHE_TTL['agent-state']/1000}s agent TTL
    L2: Disk (.kilo/cache/) — persists across restart, TTL-evicted

  Commands:
    warm     Pre-warm all caches (agent state, dashboard, snippets)
    flush    Clear all caches
    prune    Remove expired L2 entries
    stats    Cache statistics (L1 entries, L2 files/size, TTL map)
    get <k>  Read cached value (default: dashboard)
    keys     List all active cache keys

  Integration:
    Session bootstrap: node scripts/session-bootstrap.mjs
      → calls cache.warm to pre-populate
    Agent bridge: GET /api/system/agent-status
      → reads cache first, falls back to disk
    Frontend useAgentStatus hook:
      → polls every 8s, 0-latency on cache hit
`);
  }
}

// Auto-warm on module import for scripts that need it
if (!cmd) {
  const state = warmAll();
  console.log(`[cache] Pre-warmed ${state.agents.length} agents, ${state.snippets.total} snippets`);
}
