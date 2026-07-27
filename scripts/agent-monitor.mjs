import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

try {
  process.loadEnvFile('.env');
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MEMORY_ROOT = path.resolve(__dirname, '..', '.kilo', 'memory');
const VOICEMAIL_DIR = path.join(MEMORY_ROOT, 'voicemails');
const DECISIONS_DIR = path.join(MEMORY_ROOT, 'decisions');
const INTERVAL_MS = 5000;
const COMPACT_INTERVAL_MS = 30000;
const DEBOUNCE_CACHE = new Map();

let { compactTrajectory } = await import('./think-compact.mjs');
let { isDuplicate } = await import('./bus-debouncer.mjs');

if (!compactTrajectory) compactTrajectory = (p) => ({ compacted: p, beforeTokens: JSON.stringify(p).length, afterTokens: JSON.stringify(p).length, savingsPct: 0 });

function getRedisClient() {
  try {
    const { getRedisClient } = require('../services/lib/redis.js');
    return getRedisClient({ label: 'agent-monitor' });
  } catch {
    return null;
  }
}

function heartbeat(agentId) {
  const file = path.join(VOICEMAIL_DIR, `${agentId}_heartbeat`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ agentId, timestamp: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

function scanVoicemails() {
  const agents = {};
  try {
    if (!fs.existsSync(VOICEMAIL_DIR)) return agents;
    const files = fs.readdirSync(VOICEMAIL_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const agentId = f.replace('.json', '');
      const raw = JSON.parse(fs.readFileSync(path.join(VOICEMAIL_DIR, f), 'utf-8'));
      const vms = Array.isArray(raw) ? raw : [];
      agents[agentId] = {
        total: vms.length,
        unread: vms.filter((v) => !v.read).length,
        latestUrgency: vms.length > 0 ? vms[vms.length - 1].urgency : 'NONE',
      };
    }
  } catch {}
  return agents;
}

function scanHeartbeats() {
  const agents = {};
  try {
    if (!fs.existsSync(VOICEMAIL_DIR)) return agents;
    const files = fs.readdirSync(VOICEMAIL_DIR).filter((f) => f.endsWith('_heartbeat'));
    for (const f of files) {
      const agentId = f.replace('_heartbeat', '');
      const raw = fs.readFileSync(path.join(VOICEMAIL_DIR, f), 'utf-8');
      const hb = JSON.parse(raw);
      const ageMs = Date.now() - new Date(hb.timestamp).getTime();
      agents[agentId] = {
        lastSeen: hb.timestamp,
        ageSec: Math.round(ageMs / 1000),
        online: ageMs < 45_000,
      };
    }
  } catch {}
  return agents;
}

function scanInterrupts() {
  const file = path.join(MEMORY_ROOT, 'local-calls', 'interrupts.json');
  try {
    if (!fs.existsSync(file)) return { count: 0 };
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const interrupts = Array.isArray(raw) ? raw : [];
    return { count: interrupts.length, latest: interrupts.length > 0 ? interrupts[interrupts.length - 1] : null };
  } catch {
    return { count: 0 };
  }
}

function publishStatus(redis, status) {
  if (!redis) return;
  try {
    redis
      .publish(
        'kudbee:events',
        JSON.stringify({
          event: 'agent:monitor:status',
          payload: status,
          timestamp: new Date().toISOString(),
        })
      )
      .catch(() => {});
  } catch {}
}

let _lastCompactTs = 0;
let _lastStateFingerprint = '';

function commitThinkDump(status) {
  const now = Date.now();
  if (now - _lastCompactTs < COMPACT_INTERVAL_MS) return null;

  const dupEvent = { event: 'agent:monitor:think', payload: status };
  if (isDuplicate(dupEvent)) return null;

  const result = compactTrajectory(status);
  _lastCompactTs = now;
  _lastStateFingerprint = JSON.stringify(result.compacted).slice(0, 80);

  const thinkFile = path.join(MEMORY_ROOT, `think_monitor_${now}.json`);
  try {
    fs.mkdirSync(path.dirname(thinkFile), { recursive: true });
    fs.writeFileSync(thinkFile, JSON.stringify(result, null, 2));
    console.log(`[think-compact] Monitor snapshot → ${result.savingsPct}% savings (${result.afterTokens} tokens)`);
  } catch (e) {
    console.warn(`[think-compact] Write failed: ${e.message}`);
  }

  for (const [agentId, agent] of Object.entries(status.agents || {})) {
    const quality = agent.online ? 'OPTIMAL' : 'ESCALATED';
    const dpoFile = path.join(DECISIONS_DIR, `dpo_monitor_${quality.toLowerCase()}_${now}_${agentId}.json`);
    try {
      fs.mkdirSync(path.dirname(dpoFile), { recursive: true });
      const dpoEntry = {
        timestamp: new Date().toISOString(),
        recommendation: quality === 'OPTIMAL' ? 'CHOSEN' : 'REJECTED',
        trajectory_quality: quality,
        agentId,
        agent: result.compacted?.agents?.[agentId] || agent,
        metadata: { source: 'agent-monitor', category: quality },
      };
      fs.writeFileSync(dpoFile, JSON.stringify(dpoEntry, null, 2));
      if (quality === 'ESCALATED') {
        console.log(`[dpo] ESCALATED preference annotated: ${agentId} offline`);
      }
    } catch {}
  }

  return result;
}

function run() {
  const agentId = process.env.AGENT_ID || 'monitor-daemon';
  const redis = getRedisClient();

  console.log(`[agent-monitor] Daemon started — agent: ${agentId}`);
  console.log(`[agent-monitor] Polling every ${INTERVAL_MS}ms`);
  console.log(`[agent-monitor] Voicemail dir: ${VOICEMAIL_DIR}`);
  console.log(`[agent-monitor] PR: https://github.com/KudbeeZero/Kudbee-fuel-gage/pull/208`);
  console.log('');

  const tick = () => {
    const now = new Date().toISOString();
    heartbeat(agentId);

    const vms = scanVoicemails();
    const hbs = scanHeartbeats();
    const ints = scanInterrupts();

    const status = {
      timestamp: now,
      daemon: { agentId, uptime: process.uptime() },
      agents: {},
      interrupts: ints,
    };

    const allAgentIds = new Set([...Object.keys(vms), ...Object.keys(hbs)]);
    for (const id of allAgentIds) {
      status.agents[id] = {
        online: hbs[id]?.online ?? false,
        lastSeen: hbs[id]?.lastSeen ?? 'never',
        voicemails: vms[id]?.unread ?? 0,
        totalVoicemails: vms[id]?.total ?? 0,
      };
    }

    console.log(`[${now.slice(11, 19)}] Agents: ${Object.keys(status.agents).length} | Online: ${Object.values(status.agents).filter((a) => a.online).length} | Interrupts: ${ints.count} | Unread VMs: ${Object.values(status.agents).reduce((s, a) => s + a.voicemails, 0)}`);

    publishStatus(redis, status);
    commitThinkDump(status);
  };

  tick();
  const interval = setInterval(tick, INTERVAL_MS);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n[agent-monitor] Shutting down');
    redis?.quit().catch(() => {});
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('\n[agent-monitor] Shutting down');
    redis?.quit().catch(() => {});
    process.exit(0);
  });
}

run();
