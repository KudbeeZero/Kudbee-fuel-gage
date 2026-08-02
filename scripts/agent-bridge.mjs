#!/usr/bin/env node
/**
 * scripts/agent-bridge.mjs
 * ---------------------------------------------------------------------------
 * Shared state bridge between terminal agents (npm scripts) and Express
 * middleware. Terminal agents write state to .kilo/memory/agent-state.json.
 * The Express system router reads this file and serves it via REST API.
 * The frontend polls the API for real-time agent fleet status.
 *
 * Also propagates rate limits: agents respect global concurrency cap and
 * middleware-imposed API rate limits (429/503 aware).
 * ---------------------------------------------------------------------------
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const BUS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'bus');
const BUS_INDEX = join(BUS_DIR, 'index.json');
const STATE_PATH = join(REPO_ROOT, '.kilo', 'memory', 'agent-state.json');
const RATE_PATH = join(REPO_ROOT, '.kilo', 'memory', 'rate-limits.json');
const QUEUE_PATH = join(REPO_ROOT, '.kilo', 'memory', 'wait-queue.json');
const AGENTS_DIR = join(REPO_ROOT, '.kilo', 'agents');
const SNIPPETS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'snippets');
const MEMORIES_DIR = join(REPO_ROOT, '.kilo', 'memory', 'memories');
const DECISIONS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'decisions');
const RELATIONS_PATH = join(REPO_ROOT, '.kilo', 'memory', 'relations.json');
const JOURNAL_PATH = join(REPO_ROOT, '.kilo', 'memory', 'journal.json');
const VOICEMAILS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'voicemails');
const CALL_LOG_PATH = join(REPO_ROOT, '.kilo', 'memory', 'call-log.json');
const PROTOCOL_EVENTS_PATH = join(REPO_ROOT, '.kilo', 'memory', 'protocol-events.jsonl');
const DTHINK_STREAM_PATH = join(REPO_ROOT, '.kilo', 'memory', 'dthink', 'stream.jsonl');

[STATE_PATH, RATE_PATH, QUEUE_PATH].forEach(p => mkdirSync(dirname(p), { recursive: true }));

// ─── Read functions (called by system router) ──────────────────────────────

export function getAgentState() {
  const state = {
    timestamp: new Date().toISOString(),
    agents: [],
    snippets: { total: 0, totalSize: 0, topRecalled: [] },
    decisions: { total: 0, recent: [] },
    memories: { total: 0, totalActions: 0 },
    knowledgeGraph: { nodes: 0, edges: 0 },
    rateLimits: getRateLimitState(),
    waitQueue: getWaitQueue(),
    journal: { sessions: 0, lastEntry: null },
    terminal: { voicemailsPending: 0, callsRecent: 0, busEventsRecent: 0, thinkForgeInjections: 0 },
    protocolEventsRecent: [],
  };

  // Agents
  if (existsSync(AGENTS_DIR)) {
    state.agents = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent')).map(f => {
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
      const mem = loadMemory(id);
      const decs = loadDecisions(id);
      return {
        id, category: meta.category || 'unknown', schedule: meta.schedule || 'manual',
        description: meta.description || id, triggers: meta.triggers || '',
        memory: { totalActions: mem.totalActions || 0, lastAction: mem.lastAction, recallCount: (mem.recalls || []).length },
        decisions: { total: decs.length, lastDecision: decs[0]?.decision || null },
        status: (meta.schedule === 'on-deploy' && (mem.totalActions || 0) === 0) ? 'idle' : 'active',
      };
    });
  }

  // Snippets
  if (existsSync(SNIPPETS_DIR)) {
    const snippets = readdirSync(SNIPPETS_DIR).filter(f => f.endsWith('.snippet')).map(f => {
      const raw = readFileSync(join(SNIPPETS_DIR, f), 'utf8');
      const id = f.replace('.snippet', '');
      const mem = loadMemory(id);
      return { id, size: raw.length, recallCount: mem.recallCount || 0 };
    });
    state.snippets.total = snippets.length;
    state.snippets.totalSize = snippets.reduce((a, s) => a + s.size, 0);
    state.snippets.topRecalled = snippets.filter(s => s.recallCount > 0).sort((a, b) => b.recallCount - a.recallCount).slice(0, 5);
  }

  // Decisions
  if (existsSync(DECISIONS_DIR)) {
    const allDecs = readdirSync(DECISIONS_DIR).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(readFileSync(join(DECISIONS_DIR, f), 'utf8')); } catch { return null; }
    }).filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    state.decisions.total = allDecs.length;
    state.decisions.recent = allDecs.slice(0, 20);
  }

  // Memories
  if (existsSync(MEMORIES_DIR)) {
    const mems = readdirSync(MEMORIES_DIR).filter(f => f.endsWith('.memory')).map(f => {
      try { return JSON.parse(readFileSync(join(MEMORIES_DIR, f), 'utf8')); } catch { return null; }
    }).filter(Boolean);
    state.memories.total = mems.length;
    state.memories.totalActions = mems.reduce((a, m) => a + (m.totalActions || 0), 0);
  }

  // Knowledge graph
  if (existsSync(RELATIONS_PATH)) {
    try { const rel = JSON.parse(readFileSync(RELATIONS_PATH, 'utf8')); state.knowledgeGraph = { nodes: Object.keys(rel.nodes || {}).length, edges: (rel.edges || []).length }; } catch {}
  }

  // Journal
  if (existsSync(JOURNAL_PATH)) {
    try { const j = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')); state.journal = { sessions: j.trends?.sessions || 0, lastEntry: j.journal?.[j.journal.length - 1] || null }; } catch {}
  }

  state.terminal = {
    voicemailsPending: getUnreadVoicemailCount(),
    callsRecent: getRecentCallsCount(),
    busEventsRecent: getRecentBusEventsCount(),
    thinkForgeInjections: getThinkForgeInjectionCount(),
  };
  state.protocolEventsRecent = getRecentProtocolEvents(12);

  return state;
}

// ─── Rate limit system ─────────────────────────────────────────────────────

export function getRateLimitState() {
  try {
    if (existsSync(RATE_PATH)) return JSON.parse(readFileSync(RATE_PATH, 'utf8'));
  } catch {}
  return { global: { maxConcurrent: 3, currentRunning: 0, waitQueue: [] }, agents: {} };
}

export function acquireRateLimitSlot(agentId) {
  const state = getRateLimitState();
  if (state.global.currentRunning < state.global.maxConcurrent) {
    state.global.currentRunning += 1;
    if (!state.agents[agentId]) state.agents[agentId] = { running: 0, lastRun: null, quotaUsed: 0 };
    state.agents[agentId].running += 1;
    state.agents[agentId].lastRun = new Date().toISOString();
    writeFileSync(RATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    return { allowed: true, waitTime: 0 };
  }
  return { allowed: false, waitTime: state.global.waitQueue.length * 5000 };
}

export function releaseRateLimitSlot(agentId) {
  const state = getRateLimitState();
  state.global.currentRunning = Math.max(0, state.global.currentRunning - 1);
  if (state.agents[agentId]) state.agents[agentId].running = Math.max(0, (state.agents[agentId].running || 1) - 1);
  writeFileSync(RATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ─── Wait queue ────────────────────────────────────────────────────────────

export function getWaitQueue() {
  try {
    if (existsSync(QUEUE_PATH)) return JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  } catch {}
  return { queued: [], processed: 0, nextSlot: 0 };
}

export function enqueueWait(agentId, priority = 1) {
  const queue = getWaitQueue();
  const entry = { id: `wq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, agentId, priority, enqueued: new Date().toISOString(), status: 'waiting' };
  queue.queued.push(entry);
  queue.queued.sort((a, b) => b.priority - a.priority);
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  return entry;
}

export function dequeueWait() {
  const queue = getWaitQueue();
  const entry = queue.queued.shift();
  if (entry) {
    entry.status = 'processing';
    entry.dequeued = new Date().toISOString();
    queue.processed += 1;
  }
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  return entry || null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadMemory(id) {
  const p = join(MEMORIES_DIR, `${id}.memory`);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

function loadDecisions(agentId) {
  if (!existsSync(DECISIONS_DIR)) return [];
  return readdirSync(DECISIONS_DIR).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(readFileSync(join(DECISIONS_DIR, f), 'utf8')); } catch { return null; }
  }).filter(d => d && d.agentId === agentId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getRecentBusEventsCount() {
  try {
    if (!existsSync(BUS_INDEX)) return 0;
    const idx = JSON.parse(readFileSync(BUS_INDEX, 'utf8'));
    const events = Array.isArray(idx.events) ? idx.events : [];
    return events.slice(-50).length;
  } catch {
    return 0;
  }
}

function getUnreadVoicemailCount() {
  try {
    if (!existsSync(VOICEMAILS_DIR)) return 0;
    const files = readdirSync(VOICEMAILS_DIR).filter((f) => f.endsWith('.json'));
    let total = 0;
    for (const file of files) {
      try {
        const payload = JSON.parse(readFileSync(join(VOICEMAILS_DIR, file), 'utf8'));
        const messages = Array.isArray(payload) ? payload : [];
        total += messages.filter((m) => !m.read).length;
      } catch {}
    }
    return total;
  } catch {
    return 0;
  }
}

function getRecentCallsCount() {
  try {
    if (!existsSync(CALL_LOG_PATH)) return 0;
    const payload = JSON.parse(readFileSync(CALL_LOG_PATH, 'utf8'));
    const calls = Array.isArray(payload) ? payload : Array.isArray(payload.calls) ? payload.calls : [];
    return calls.slice(-20).length;
  } catch {
    return 0;
  }
}

function getThinkForgeInjectionCount() {
  try {
    const lines = readTailJsonlLines(DTHINK_STREAM_PATH, 512 * 1024);
    return lines
      .slice(-300)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.type === 'think:inject').length;
  } catch {
    return 0;
  }
}

function getRecentProtocolEvents(limit = 12) {
  try {
    const lines = readTailJsonlLines(PROTOCOL_EVENTS_PATH, 128 * 1024);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

function readTailJsonlLines(filePath, maxBytes = 128 * 1024) {
  try {
    if (!existsSync(filePath)) return [];
    const { size } = statSync(filePath);
    if (size <= 0) return [];
    const bytesToRead = Math.min(maxBytes, size);
    const start = size - bytesToRead;
    const fd = openSync(filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const readBytes = readSync(fd, buffer, 0, bytesToRead, start);
      let text = buffer.toString('utf8', 0, readBytes);
      if (start > 0 && text && !text.startsWith('\n')) {
        const firstBreak = text.indexOf('\n');
        text = firstBreak === -1 ? '' : text.slice(firstBreak + 1);
      }
      return text.split('\n').filter(Boolean);
    } finally {
      closeSync(fd);
    }
  } catch {
    return [];
  }
}

// ─── CLI direct execution ──────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const arg = process.argv[3];

  switch (cmd) {
    case 'state': console.log(JSON.stringify(getAgentState(), null, 2)); break;
    case 'rate': console.log(JSON.stringify(getRateLimitState(), null, 2)); break;
    case 'queue': console.log(JSON.stringify(getWaitQueue(), null, 2)); break;
    case 'acquire': console.log(JSON.stringify(acquireRateLimitSlot(arg || 'unknown'))); break;
    case 'release': releaseRateLimitSlot(arg || 'unknown'); console.log('released'); break;
    case 'enqueue': console.log(JSON.stringify(enqueueWait(arg || 'unknown', parseInt(process.argv[4]) || 1))); break;
    case 'dequeue': console.log(JSON.stringify(dequeueWait())); break;
    default:
      console.log(`agent-bridge: state | rate | queue | acquire <id> | release <id> | enqueue <id> [pri] | dequeue`);
  }
}
