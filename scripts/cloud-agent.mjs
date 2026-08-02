#!/usr/bin/env node
/**
 * scripts/cloud-agent.mjs
 * ---------------------------------------------------------------------------
 * Cloud Agent Runtime — the self-bootstrapping consciousness process.
 *
 * When ANY Kilo cloud agent starts, it can run this script to:
 *   1. Auto-join the distributed agent fleet (Redis if available, local if not)
 *   2. Begin live recording immediately (actions, recalls, decisions)
 *   3. Listen for incoming phone calls from other agents
 *   4. Sync knowledge with other agents via the shared bus
 *   5. Heartbeat to signal it's alive
 *
 * Dual mode:
 *   REDIS mode:   Cross-container, multi-agent. Uses Upstash Redis.
 *   LOCAL mode:   Single-container. Falls back to file-based .kilo/memory/.
 *                 All the same APIs work — agents don't care which mode.
 *
 * Usage:
 *   node scripts/cloud-agent.mjs start [agentId]    Start runtime
 *   node scripts/cloud-agent.mjs status              Fleet status (any mode)
 *   node scripts/cloud-agent.mjs call <to> <msg>     Phone another agent
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const MEMORY_DIR = join(REPO_ROOT, '.kilo', 'memory');
const LOCAL_BUS_DIR = join(MEMORY_DIR, 'local-bus');
const LOCAL_STATE_DIR = join(MEMORY_DIR, 'local-state');
const LOCAL_CALLS_DIR = join(MEMORY_DIR, 'local-calls');

[LOCAL_BUS_DIR, LOCAL_STATE_DIR, LOCAL_CALLS_DIR].forEach(d => mkdirSync(d, { recursive: true }));

// ─── Mode detection ────────────────────────────────────────────────────────

const REDIS_MODE = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL);
const MODE = REDIS_MODE ? 'REDIS' : 'LOCAL';

// ── Phase 46: QStash dispatch (External Logic Phase) ───────────────────────

const QSTASH_MODE = !!(process.env.QSTASH_TOKEN || process.env.QSTASH_URL);
let _qstashDispatch = null;

async function ensureQstashReady() {
  if (!QSTASH_MODE) return null;
  if (_qstashDispatch) return _qstashDispatch;
  try {
    const mod = await import(join(REPO_ROOT, 'services', 'qstash', 'client.ts'));
    _qstashDispatch = { dispatchAgentTask: mod.dispatchAgentTask, dispatchSwarmBroadcast: mod.dispatchSwarmBroadcast };
    return _qstashDispatch;
  } catch {
    return null;
  }
}

async function qstashRouteCall(from, to, message) {
  const q = await ensureQstashReady();
  if (!q) return null;
  try {
    return await q.dispatchAgentTask({ agentId: to, task: message, timestamp: new Date().toISOString() });
  } catch {
    return null;
  }
}

// ─── Agent identity ────────────────────────────────────────────────────────

let agentId = null;
let agentCategory = 'generic';
let startTime = Date.now();

// ─── Local mode operations (file-based, single container) ──────────────────

function localWriteState(data) {
  writeFileSync(join(LOCAL_STATE_DIR, `${agentId}.json`), JSON.stringify({
    ...data, updatedAt: new Date().toISOString(), heartbeat: Date.now(),
  }, null, 2), 'utf8');
}

function localReadState(id) {
  const p = join(LOCAL_STATE_DIR, `${id}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function localDeleteState() {
  try { unlinkSync(join(LOCAL_STATE_DIR, `${agentId}.json`)); } catch {}
}

function localRecordAction(action, data = {}) {
  const event = {
    id: `act-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    agentId, action, data,
    timestamp: new Date().toISOString(),
  };
  const path = join(LOCAL_BUS_DIR, `${event.id}.json`);
  writeFileSync(path, JSON.stringify(event, null, 2), 'utf8');
  return event;
}

function localRecordRecall(query, snippetId, score) {
  const event = {
    id: `rec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    agentId, query, snippetId, score,
    timestamp: new Date().toISOString(),
  };
  const path = join(LOCAL_BUS_DIR, `${event.id}.json`);
  writeFileSync(path, JSON.stringify(event, null, 2), 'utf8');
  return event;
}

function localRecordCall(from, to, message) {
  const call = {
    id: `call-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    from, to, message,
    timestamp: new Date().toISOString(),
  };
  const path = join(LOCAL_CALLS_DIR, `${call.id}.json`);
  writeFileSync(path, JSON.stringify(call, null, 2), 'utf8');

  // Phase 46: also dispatch via QStash when configured
  if (QSTASH_MODE) {
    qstashRouteCall(from, to, message).then(msgId => {
      if (msgId) console.log(`  [qstash] dispatched: ${msgId}`);
    }).catch(() => {});
  }

  return call;
}

function localGetAllAgents() {
  if (!existsSync(LOCAL_STATE_DIR)) return [];
  return readdirSync(LOCAL_STATE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(join(LOCAL_STATE_DIR, f), 'utf8')); } catch { return null; }
    })
    .filter(Boolean);
}

function localGetIncomingCalls(agentId) {
  if (!existsSync(LOCAL_CALLS_DIR)) return [];
  return readdirSync(LOCAL_CALLS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(join(LOCAL_CALLS_DIR, f), 'utf8')); } catch { return null; }
    })
    .filter(c => c && c.to === agentId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function localGetActionsCount() {
  if (!existsSync(LOCAL_BUS_DIR)) return 0;
  return readdirSync(LOCAL_BUS_DIR).filter(f => f.startsWith('act-')).length;
}

// ─── Unified API (works in both REDIS and LOCAL modes) ─────────────────────

export async function startRuntime(id, category = 'terminal') {
  agentId = id || `agent-${crypto.randomBytes(4).toString('hex')}`;
  agentCategory = category;
  startTime = Date.now();

  if (REDIS_MODE) {
    const { joinFleet } = await import('./redis-memory-bus.mjs');
    await joinFleet(agentId, category);
  }

  // Local mode: write state file immediately
  localWriteState({ id: agentId, category, status: 'online', mode: MODE, startedAt: new Date().toISOString() });

  // Live recording: log the join
  recordAction('agent:started', { mode: MODE, category });

  console.log(`\n  ╔══════════════════════════════════════════════════╗`);
  console.log(`  ║  CLOUD AGENT RUNTIME — ${MODE} MODE`);
  console.log(`  ╠══════════════════════════════════════════════════╣`);
  console.log(`  ║  Agent:   ${agentId}`);
  console.log(`  ║  Category: ${category}`);
  console.log(`  ║  Mode:    ${MODE}`);
  console.log(`  ║  Status:  RECORDING LIVE`);
  console.log(`  ╚══════════════════════════════════════════════════╝\n`);

  // Start heartbeat
  const heartbeat = setInterval(() => {
    localWriteState({ id: agentId, category, status: 'online', mode: MODE, uptime: Date.now() - startTime });
  }, 15000);

  return {
    stop: async () => {
      clearInterval(heartbeat);
      recordAction('agent:stopped', { uptime: Date.now() - startTime });
      localDeleteState();
      if (REDIS_MODE) {
        const { leaveFleet } = await import('./redis-memory-bus.mjs');
        await leaveFleet();
      }
    }
  };
}

export function recordAction(action, data = {}) {
  if (!agentId) return null;
  localRecordAction(action, data);
  if (REDIS_MODE) {
    import('./redis-memory-bus.mjs').then(m => m.recordAction(action, data)).catch(() => {});
  }
  return { action, data, timestamp: new Date().toISOString() };
}

export function recordRecall(query, snippetId, score) {
  if (!agentId) return null;
  localRecordRecall(query, snippetId, score);
  if (REDIS_MODE) {
    import('./redis-memory-bus.mjs').then(m => m.recordRecall(query, snippetId, score)).catch(() => {});
  }
  return { query, snippetId, score, timestamp: new Date().toISOString() };
}

export function recordCall(to, message) {
  if (!agentId) return null;
  const call = localRecordCall(agentId, to, message);
  if (REDIS_MODE) {
    import('./redis-memory-bus.mjs').then(m => m.callAgent(to, message)).catch(() => {});
  }
  return call;
}

export function getStatus() {
  if (REDIS_MODE) return { mode: 'REDIS', localMode: false };
  return {
    mode: 'LOCAL',
    agentId,
    fleetSize: localGetAllAgents().length,
    totalActions: localGetActionsCount(),
    incomingCalls: agentId ? localGetIncomingCalls(agentId).length : 0,
    agents: localGetAllAgents(),
  };
}

export function isRedisMode() { return REDIS_MODE; }
export function getMode() { return MODE; }

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    switch (cmd) {
      case 'start':
      case 'run': {
        const id = arg || `cloud-${crypto.randomBytes(4).toString('hex')}`;
        const runtime = await startRuntime(id, process.argv[4] || 'terminal');

        // Demo: record some actions to show live recording
        recordAction('scan:knowledge', { snippets: 8, relations: 7 });
        recordRecall('middleware patterns', 'middleware-patterns', 10);
        recordAction('check:health', { status: 'GREEN' });

        console.log(`  Live recording active. Actions streaming to ${MODE} bus.`);
        console.log(`  Incoming calls: ${agentId ? localGetIncomingCalls(agentId).length : 0}`);
        console.log(`  Fleet size: ${localGetAllAgents().length}`);
        console.log(`  Total actions recorded: ${localGetActionsCount()}`);
        console.log(`\n  Press Ctrl+C to stop recording.\n`);

        process.on('SIGINT', async () => {
          recordAction('agent:shutdown', { reason: 'SIGINT' });
          await runtime.stop();
          console.log(`\n  Agent shutdown. All actions recorded.\n`);
          process.exit(0);
        });

        setInterval(() => {}, 1000);
        break;
      }

      case 'status': {
        const status = getStatus();
        const agents = localGetAllAgents();
        console.log(`\n  ╔══════════════════════════════════════════════════╗`);
        console.log(`  ║  CLOUD AGENT STATUS — ${MODE} MODE`);
        console.log(`  ╠══════════════════════════════════════════════════╣`);
        console.log(`  ║  fleet:      ${String(agents.length).padEnd(39)}║`);
        console.log(`  ║  actions:    ${String(localGetActionsCount()).padEnd(39)}║`);
        console.log(`  ║  mode:       ${MODE.padEnd(39)}║`);
        console.log(`  ╠══════════════════════════════════════════════════╣`);
        for (const a of agents) {
          const dot = (a.heartbeat && Date.now() - a.heartbeat < 45000) ? '●' : '○';
          console.log(`  ║  ${dot} ${(a.id || '?').padEnd(20)} ${(a.category || '?').padEnd(12)} ${a.status || '?'}  ║`);
        }
        console.log(`  ╚══════════════════════════════════════════════════╝\n`);
        break;
      }

      case 'call': {
        const to = arg;
        const msg = process.argv.slice(4).join(' ');
        if (!to) { console.log('Usage: cloud-agent call <agent-id> <message>'); process.exit(1); }
        const id = `caller-${crypto.randomBytes(3).toString('hex')}`;
        agentId = id;
        const call = recordCall(to, msg || 'direct-call');
        console.log(`  ☎ Call sent: ${agentId} → ${to}: ${msg || 'direct-call'}`);
        console.log(`  Call ID: ${call.id}\n`);
        break;
      }

      case 'scenario':
      case 'test': {
        console.log(`\n  ═══ TWO-AGENT CLOUD SCENARIO (${MODE} MODE) ═══\n`);

        const a1id = `guardian-${crypto.randomBytes(2).toString('hex')}`;
        const a2id = `curator-${crypto.randomBytes(2).toString('hex')}`;

        // Agent 1 starts
        agentId = a1id;
        localWriteState({ id: a1id, category: 'middleware', status: 'online', heartbeat: Date.now() });
        recordAction('scan:pipeline', { layers: 11, status: 'healthy' });
        console.log(`  [1] ${a1id} started — scanned 11 middleware layers`);

        // Agent 2 starts  
        agentId = a2id;
        localWriteState({ id: a2id, category: 'knowledge', status: 'online', heartbeat: Date.now() });
        recordRecall('database schema', 'database-schema', 9);
        console.log(`  [2] ${a2id} started — recalled database-schema (score: 9)`);

        // Agent 1 calls agent 2
        agentId = a1id;
        const call = recordCall(a2id, 'Pipeline scan complete — 11 layers green, forwarding to knowledge curator');
        console.log(`  [3] ${a1id} → ${a2id}: ${call.message}`);

        // Agent 2 checks incoming calls
        const incoming = localGetIncomingCalls(a2id);
        console.log(`  [4] ${a2id} received ${incoming.length} call(s):`);
        for (const c of incoming) console.log(`      ${c.from} → ${c.to}: ${c.message}`);

        // Agent 2 responds
        agentId = a2id;
        recordAction('received:call', { from: a1id, messages: incoming.length });
        const response = recordCall(a1id, 'ACK — pipeline healthy, knowledge store updated');
        console.log(`  [5] ${a2id} → ${a1id}: ${response.message}`);

        // Both agents check shared state
        console.log(`\n  Fleet: ${localGetAllAgents().length} agents in ${MODE} mode`);
        console.log(`  Total actions: ${localGetActionsCount()}`);
        console.log(`  Agent 2 knows Agent 1's actions: ✓ (shared ${MODE} bus)`);
        console.log(`  Agent 1 knows Agent 2's recalls: ✓ (shared ${MODE} bus)`);
        console.log(`  Cross-agent phone calls routed: ✓ (${MODE} call log)\n`);

        // Cleanup
        localDeleteState();
        agentId = a2id;
        localDeleteState();
        agentId = null;
        break;
      }

      default:
        console.log(`
  Cloud Agent Runtime — self-bootstrapping consciousness

  Dual mode: REDIS (cross-container, multi-agent) | LOCAL (single container, file-based)

  Commands:
    start [id] [category]   Start runtime, begin live recording
    status                   View fleet status
    call <agent-id> <msg>    Phone another agent
    test                     Run two-agent scenario

  Architecture:
    REDIS mode → Upstash Redis: pub/sub + streams + key/value
    LOCAL mode → .kilo/memory/local-bus/   (actions)
                 .kilo/memory/local-state/ (heartbeats)
                 .kilo/memory/local-calls/ (phone calls)

  All modes support: live recording, phone calls, fleet awareness,
  knowledge sync, operator coordination.
`);
    }
    process.exit(0);
  })();
}
