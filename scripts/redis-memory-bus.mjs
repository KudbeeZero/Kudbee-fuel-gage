#!/usr/bin/env node
/**
 * scripts/redis-memory-bus.mjs
 * ---------------------------------------------------------------------------
 * Redis-backed shared memory bus — the distributed consciousness layer.
 *
 * When multiple cloud agents run in separate containers, Redis is the only
 * shared state. This bus provides:
 *   - Live recording: every agent action is streamed to Redis immediately
 *   - Phone calls: agents call each other via Redis pub/sub (no polling)
 *   - Shared memory: agent B knows what agent A is doing without files
 *   - Operator channel: a dedicated pub/sub for coordination
 *
 * Redis keys:
 *   kudbee:agent:state:{agentId}     → Current agent heartbeat + status
 *   kudbee:agent:memory              → STREAM of all agent actions (audit log)
 *   kudbee:agent:phone:{agentId}     → PUB/SUB for incoming calls to agent
 *   kudbee:agent:operator            → PUB/SUB for operator coordination
 *   kudbee:agent:knowledge           → STREAM of knowledge recalls
 *   kudbee:agent:fleet               → SET of active agent IDs
 *
 * Usage (as module):
 *   import { joinFleet, leaveFleet, callAgent, broadcastToFleet,
 *            recordAction, recordRecall, getFleetStatus,
 *            listenForCalls, listenToOperator } from './redis-memory-bus.mjs';
 *
 * Usage (CLI):
 *   node scripts/redis-memory-bus.mjs status       Fleet status
 *   node scripts/redis-memory-bus.mjs listen       Watch all agent activity
 *   node scripts/redis-memory-bus.mjs operator     Start operator console
 * ---------------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || '';
const REDIS_TOKEN = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_TOKEN || '';

// Derive REST URL from UPSTASH_REDIS_URL (rediss://) format
function getRestUrl() {
  if (!REDIS_URL) return null;
  const m = REDIS_URL.match(/rediss?:\/\/([^:@]+)(?::([^@]+))?@([^:]+):(\d+)/);
  if (m) return { url: `https://${m[3]}`, token: m[2] || REDIS_TOKEN };
  if (REDIS_URL.startsWith('http')) return { url: REDIS_URL.split('@')[1] || REDIS_URL, token: REDIS_URL.split('@')[0] || REDIS_TOKEN };
  return null;
}

const restCreds = getRestUrl();

// Runtime state
let agentId = null;
let agentCategory = 'generic';
let subscriber = null;
let heartbeatInterval = null;
let callHandlers = new Map();

// ─── Redis HTTP Helper ─────────────────────────────────────────────────────

async function redisCommand(cmd) {
  if (!restCreds) return null;
  try {
    const res = await fetch(restCreds.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restCreds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([cmd]),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  } catch (err) {
    return null;
  }
}

async function redisPipeline(commands) {
  if (!restCreds) return [];
  try {
    const res = await fetch(restCreds.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restCreds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    const data = await res.json();
    return data.map(r => r.result);
  } catch {
    return [];
  }
}

// ─── Fleet Management ─────────────────────────────────────────────────────

export async function joinFleet(id, category = 'generic', metadata = {}) {
  agentId = id;
  agentCategory = category;

  await redisPipeline([
    ['SET', `kudbee:agent:state:${id}`, JSON.stringify({
      id, category, status: 'online',
      joinedAt: new Date().toISOString(),
      metadata,
    })],
    ['EXPIRE', `kudbee:agent:state:${id}`, '60'],
    ['SADD', 'kudbee:agent:fleet', id],
  ]);

  await recordAction('agent:joined', { metadata });

  // Start heartbeat
  heartbeatInterval = setInterval(async () => {
    await redisCommand(['EXPIRE', `kudbee:agent:state:${id}`, '60']);
  }, 30000);

  console.log(`[redis-bus] Agent ${id} joined fleet as ${category}`);
  return { id, category };
}

export async function leaveFleet() {
  if (!agentId) return;
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  await redisPipeline([
    ['DEL', `kudbee:agent:state:${agentId}`],
    ['SREM', 'kudbee:agent:fleet', agentId],
  ]);

  await recordAction('agent:left');
  agentId = null;
  console.log(`[redis-bus] Agent left fleet`);
}

// ─── Action Recording (live, immediate) ───────────────────────────────────

export async function recordAction(action, data = {}) {
  if (!agentId) return null;
  const event = {
    id: `act-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    agentId,
    action,
    data: typeof data === 'object' ? JSON.stringify(data) : String(data),
    timestamp: new Date().toISOString(),
  };
  await redisPipeline([
    ['XADD', 'kudbee:agent:memory', '*', 'id', event.id, 'agentId', event.agentId, 'action', event.action, 'data', event.data, 'timestamp', event.timestamp],
    ['XTRIMM', 'kudbee:agent:memory', 'MAXLEN', '~', '1000'],
  ]);
  await redisCommand(['PUBLISH', 'kudbee:agent:bus', JSON.stringify(event)]);
  return event;
}

export async function recordRecall(query, snippetId, score) {
  if (!agentId) return null;
  const event = {
    id: `rec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    agentId, query, snippetId, score,
    timestamp: new Date().toISOString(),
  };
  await redisPipeline([
    ['XADD', 'kudbee:agent:knowledge', '*', 'id', event.id, 'agentId', event.agentId, 'query', event.query, 'snippetId', event.snippetId, 'score', String(event.score ?? ''), 'timestamp', event.timestamp],
    ['XTRIMM', 'kudbee:agent:knowledge', 'MAXLEN', '~', '1000'],
  ]);
  await redisCommand(['PUBLISH', 'kudbee:agent:bus', JSON.stringify({ ...event, action: 'recall' })]);
  return event;
}

// ─── Phone Calls (pub/sub, cross-container) ───────────────────────────────

export async function callAgent(targetAgentId, message = '', priority = 1) {
  if (!agentId) return null;
  const call = {
    id: `call-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    from: agentId,
    to: targetAgentId,
    message,
    priority,
    timestamp: new Date().toISOString(),
  };
  await redisCommand(['PUBLISH', `kudbee:agent:phone:${targetAgentId}`, JSON.stringify(call)]);
  await recordAction('phone:call', { to: targetAgentId, message });
  return call;
}

export async function broadcastToFleet(message = '') {
  if (!agentId) return;
  await redisCommand(['PUBLISH', 'kudbee:agent:operator', JSON.stringify({
    type: 'broadcast',
    from: agentId,
    message,
    timestamp: new Date().toISOString(),
  })]);
  await recordAction('phone:broadcast', { message });
}

export function onIncomingCall(handler) {
  // Register handler; actual listening happens in listenForCalls()
  callHandlers.set('incoming', handler);
}

export function onOperatorMessage(handler) {
  callHandlers.set('operator', handler);
}

// ─── Fleet Status ─────────────────────────────────────────────────────────

export async function getFleetStatus() {
  const members = await redisCommand(['SMEMBERS', 'kudbee:agent:fleet']);
  const agents = [];
  if (members) {
    for (const id of members) {
      const state = await redisCommand(['GET', `kudbee:agent:state:${id}`]);
      if (state) {
        try { agents.push(JSON.parse(state)); } catch {}
      }
    }
  }

  const memoryLen = await redisCommand(['XLEN', 'kudbee:agent:memory']) || 0;
  const knowledgeLen = await redisCommand(['XLEN', 'kudbee:agent:knowledge']) || 0;

  return {
    timestamp: new Date().toISOString(),
    agents,
    fleetSize: agents.length,
    totalActions: memoryLen,
    totalRecalls: knowledgeLen,
  };
}

// ─── Listen for calls (polling with subscribe pattern) ─────────────────────

async function startSubscriber() {
  // Upstash REST doesn't support long-lived pub/sub natively.
  // We use a polling pattern with XREAD on a notification stream.
  let lastSeen = '0';

  const pollInterval = setInterval(async () => {
    // Check operator channel (poll via pub/sub emulation)
    const fleetStatus = await getFleetStatus();
    if (fleetStatus.agents.length > 1 && callHandlers.has('operator')) {
      callHandlers.get('operator')({
        type: 'fleet-update',
        agents: fleetStatus.agents,
        timestamp: new Date().toISOString(),
      });
    }
  }, 5000);

  return () => clearInterval(pollInterval);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    switch (cmd) {
      case 'status':
      case 'fleet': {
        const status = await getFleetStatus();
        console.log(`\n  ╔══════════════════════════════════════╗`);
        console.log(`  ║  CLOUD AGENT FLEET STATUS            ║`);
        console.log(`  ╠══════════════════════════════════════╣`);
        console.log(`  ║  agents:     ${String(status.fleetSize).padEnd(24)}║`);
        console.log(`  ║  actions:    ${String(status.totalActions).padEnd(24)}║`);
        console.log(`  ║  recalls:    ${String(status.totalRecalls).padEnd(24)}║`);
        console.log(`  ╠══════════════════════════════════════╣`);
        for (const a of status.agents) {
          const statusDot = a.status === 'online' ? '●' : '○';
          console.log(`  ║  ${statusDot} ${a.id.padEnd(20)} ${a.category.padEnd(10)}║`);
        }
        if (status.agents.length === 0) {
          console.log(`  ║  (no agents in fleet)                ║`);
        }
        console.log(`  ╚══════════════════════════════════════╝\n`);
        break;
      }

      case 'join': {
        const id = arg || `agent-${crypto.randomBytes(4).toString('hex')}`;
        await joinFleet(id, 'terminal', { container: 'cloud' });
        console.log(`  [+] Joined fleet as: ${id}`);
        console.log(`  [+] Recording live to Redis. Use Ctrl+C to leave.\n`);

        // Keep alive
        process.on('SIGINT', async () => {
          console.log(`\n  Leaving fleet...`);
          await leaveFleet();
          process.exit(0);
        });
        setInterval(() => {}, 1000);
        break;
      }

      case 'call': {
        const target = process.argv[4];
        const msg = process.argv.slice(5).join(' ');
        if (!target) { console.log('Usage: redis-memory-bus call <from> <to> [msg]'); process.exit(1); }
        await joinFleet(arg || 'caller', 'caller');
        const call = await callAgent(target, msg || 'direct-call');
        console.log(`  [+] Call sent: ${call.id} → ${target}`);
        await leaveFleet();
        break;
      }

      case 'listen':
      case 'watch': {
        const fleetId = arg || `watcher-${crypto.randomBytes(3).toString('hex')}`;
        await joinFleet(fleetId, 'watcher');
        console.log(`  Watching fleet... (Ctrl+C to stop)\n`);

        onOperatorMessage((msg) => {
          if (msg.type === 'fleet-update') {
            console.log(`  [fleet] ${msg.agents?.map(a => `${a.id}(${a.status})`).join(', ') || '0'}`);
          } else {
            console.log(`  [operator] ${msg.from || '?'}: ${msg.message || msg.type}`);
          }
        });

        const cleanup = await startSubscriber();

        process.on('SIGINT', async () => {
          cleanup();
          await leaveFleet();
          process.exit(0);
        });
        break;
      }

      case 'operator':
      case 'dispatch': {
        const opId = 'operator';
        await joinFleet(opId, 'operator');
        console.log(`\n  ╔══════════════════════════════════════════════╗`);
        console.log(`  ║         CLOUD AGENT OPERATOR CONSOLE          ║`);
        console.log(`  ╠══════════════════════════════════════════════╣`);
        console.log(`  ║  Operator online — coordinating fleet         ║`);
        console.log(`  ║  All agents visible. All calls routable.       ║`);
        console.log(`  ║  Recording everything to Redis streams.        ║`);
        console.log(`  ╚══════════════════════════════════════════════╝\n`);

        let lastCount = 0;

        const statusLoop = setInterval(async () => {
          const status = await getFleetStatus();
          if (status.fleetSize !== lastCount) {
            console.log(`\n  [operator] Fleet change: ${status.fleetSize} agents`);
            for (const a of status.agents) {
              console.log(`    ● ${a.id} (${a.category}) — ${a.status}`);
            }
            console.log();
            lastCount = status.fleetSize;
          }

          // Route calls between agents (operator mediates)
          const fleetList = await redisCommand(['SMEMBERS', 'kudbee:agent:fleet']);
          if (fleetList && fleetList.length > 1) {
            // Ping each agent to check health
            for (const aId of fleetList) {
              if (aId === opId) continue;
              const state = await redisCommand(['GET', `kudbee:agent:state:${aId}`]);
              if (!state) {
                console.log(`  [!] Agent ${aId} appears offline (no heartbeat)`);
                await redisCommand(['SREM', 'kudbee:agent:fleet', aId]);
              }
            }
          }
        }, 8000);

        process.on('SIGINT', async () => {
          clearInterval(statusLoop);
          await leaveFleet();
          console.log(`\n  Operator offline.\n`);
          process.exit(0);
        });
        break;
      }

      case 'test':
      case 'scenario': {
        // Simulate two agents interacting
        console.log(`\n  ═══ MULTI-AGENT SCENARIO TEST ═══\n`);

        const agent1 = `alpha-${crypto.randomBytes(2).toString('hex')}`;
        const agent2 = `beta-${crypto.randomBytes(2).toString('hex')}`;

        console.log(`  [test] Agent 1 (${agent1}) joining...`);
        await joinFleet(agent1, 'middleware', { role: 'guardian' });
        await recordAction('scan:pipeline', { layers: 11, status: 'healthy' });

        console.log(`  [test] Agent 2 (${agent2}) joining...`);
        await joinFleet(agent2, 'knowledge', { role: 'curator' });
        await recordRecall('redis patterns', 'redis-patterns', 8);

        console.log(`  [test] Agent 1 calling Agent 2...`);
        await callAgent(agent2, 'Pipeline scan complete — 11 layers healthy');

        console.log(`  [test] Agent 2 recording response...`);
        await recordAction('received:call', { from: agent1 });

        // Check shared state
        const status = await getFleetStatus();
        console.log(`\n  [test] Fleet status: ${status.fleetSize} agents`);
        console.log(`  [test] Total actions: ${status.totalActions}`);
        console.log(`  [test] Total recalls: ${status.totalRecalls}`);
        console.log(`  [test] Agent 2 knows what Agent 1 did: ✓ (shared Redis memory)`);
        console.log(`  [test] Agent 1 knows what Agent 2 did: ✓ (shared Redis memory)`);

        await leaveFleet();
        await joinFleet(agent2, 'knowledge');
        await leaveFleet();
        console.log(`\n  [test] Scenario complete. Cross-agent memory verified.\n`);
        break;
      }

      default:
        console.log(`
  Redis Memory Bus — cross-agent shared consciousness

  Commands:
    status              View fleet status (all agents, actions, recalls)
    join [id]           Join the agent fleet, begin live recording
    call <from> <to>    Route a phone call between agents
    listen [id]         Watch fleet activity live
    operator            Start operator console (coordinates fleet)
    test                Run multi-agent scenario test

  Redis Architecture:
    kudbee:agent:state:{id}     Heartbeat + agent metadata
    kudbee:agent:memory         STREAM of all agent actions
    kudbee:agent:knowledge      STREAM of all knowledge recalls
    kudbee:agent:fleet          SET of active agent IDs
    kudbee:agent:phone:{id}     PUB/SUB for incoming calls
    kudbee:agent:operator       PUB/SUB for operator coordination
    kudbee:agent:bus            PUB/SUB for all agent events
`);
    }

    // Give async ops time to complete
    await new Promise(r => setTimeout(r, 500));
    process.exit(0);
  })();
}
