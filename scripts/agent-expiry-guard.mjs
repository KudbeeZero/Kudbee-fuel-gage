#!/usr/bin/env node
/**
 * scripts/agent-expiry-guard.mjs
 * ---------------------------------------------------------------------------
 * Agent Expiry Guard — monitors Redis agent state keys for approaching
 * expiration and re-populates them before they vanish.
 *
 * Strategy:
 *   - Agent keys live in Redis with 72h TTL (259200s).
 *   - This guard runs every 6 hours (or on-demand) via cron / CI trigger.
 *   - Scans kudbee:agents:index SET → checks TTL on each agent hash.
 *   - If TTL < 3600s (1 hour) → re-EXPIRE back to 72h + update heartbeat.
 *   - If agent key is missing → re-register from .kilo/agents/*.agent files.
 *   - If REDIS unavailable → fall back to LOCAL file-based state gracefully.
 *
 * Usage:
 *   node scripts/agent-expiry-guard.mjs check     # Check all agent TTLs
 *   node scripts/agent-expiry-guard.mjs renew     # Renew all approaching expiry
 *   node scripts/agent-expiry-guard.mjs repop     # Re-register missing agents
 */

const AGENT_TTL = 259200; // 72 hours in seconds
const WARN_TTL = 3600;     // Warn when < 1 hour remains
const RENEW_TTL = 7200;    // Renew when < 2 hours remains

const REDIS_BASE = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

import { readdirSync, readFileSync } from 'node:fs';

async function redisCmd(args) {
  if (!REDIS_BASE || !REDIS_TOKEN) {
    console.error('[expiry-guard] REDIS not configured, nothing to do');
    return null;
  }
  try {
    const res = await fetch(`${REDIS_BASE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${REDIS_TOKEN}`,
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      console.error(`[expiry-guard] Redis request failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`[expiry-guard] Redis unreachable: ${err.message}`);
    return null;
  }
}

async function getAgentIds() {
  const data = await redisCmd(['SMEMBERS', 'kudbee:agents:index']);
  if (!data || !data.result) return [];
  return data.result;
}

async function getTTL(agentId) {
  const data = await redisCmd(['TTL', `kudbee:agents:${agentId}`]);
  if (!data || data.result === undefined) return null;
  return data.result;
}

async function getAgentHash(agentId) {
  const data = await redisCmd(['HGETALL', `kudbee:agents:${agentId}`]);
  if (!data || !data.result) return null;
  const arr = data.result;
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}

async function renewAgent(agentId) {
  const now = new Date().toISOString();
  await redisCmd(['HSET', `kudbee:agents:${agentId}`, 'heartbeat', String(Date.now()), 'last_renewed', now]);
  await redisCmd(['EXPIRE', `kudbee:agents:${agentId}`, String(AGENT_TTL)]);
  console.log(`  [renew] ${agentId} → TTL reset to ${AGENT_TTL}s (${AGENT_TTL / 3600}h)`);
}

function loadLocalAgentMeta(agentId) {
  const path = `.kilo/agents/${agentId}.agent`;
  try {
    const raw = readFileSync(path, 'utf8');
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
    return meta;
  } catch {
    return null;
  }
}

async function registerAgent(agentId, meta) {
  const now = new Date().toISOString();
  await redisCmd([
    'HSET', `kudbee:agents:${agentId}`,
    'id', agentId,
    'category', meta.category || 'unknown',
    'schedule', meta.schedule || 'manual',
    'status', 'active',
    'heartbeat', String(Date.now()),
    'mode', 'REDIS',
    'ttl_ms', String(AGENT_TTL * 1000),
    'created_at', now,
    'last_renewed', now,
  ]);
  await redisCmd(['EXPIRE', `kudbee:agents:${agentId}`, String(AGENT_TTL)]);
  await redisCmd(['SADD', 'kudbee:agents:index', agentId]);
  await redisCmd(['EXPIRE', 'kudbee:agents:index', String(AGENT_TTL)]);
  console.log(`  [register] ${agentId} (${meta.category || 'unknown'})`);
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function checkAll() {
  console.log(`\n[expiry-guard] CHECK — ${new Date().toISOString()}`);
  const ids = await getAgentIds();
  console.log(`  Agents in index: ${ids.length}`);

  for (const id of ids) {
    const ttl = await getTTL(id);
    const hours = ttl !== null && ttl >= 0 ? (ttl / 3600).toFixed(1) : '∞';
    const status = ttl === null ? 'MISSING' : ttl < 0 ? 'NO-TTL' : ttl <= WARN_TTL ? 'EXPIRING' : 'HEALTHY';
    console.log(`  ${id.padEnd(22)} TTL: ${String(ttl || '?').padEnd(8)} (${hours}h)  [${status}]`);
  }
}

async function renewAll() {
  console.log(`\n[expiry-guard] RENEW — ${new Date().toISOString()}`);
  const ids = await getAgentIds();

  let renewed = 0;
  for (const id of ids) {
    const ttl = await getTTL(id);
    if (ttl !== null && ttl >= 0 && ttl <= RENEW_TTL) {
      await renewAgent(id);
      renewed++;
    } else if (ttl === null || ttl < 0) {
      await renewAgent(id);
      renewed++;
    }
  }

  // Also renew the index set itself
  await redisCmd(['EXPIRE', 'kudbee:agents:index', String(AGENT_TTL)]);

  console.log(`  Done — ${renewed}/${ids.length} agents renewed`);
}

async function repopAll() {
  console.log(`\n[expiry-guard] REPOP — ${new Date().toISOString()}`);
  const ids = await getAgentIds();

  // Scan local agent files
  const localFiles = readdirSync('.kilo/agents').filter(f => f.endsWith('.agent')).map(f => f.replace('.agent', ''));
  console.log(`  Local agents: ${localFiles.length} (${localFiles.join(', ')})`);
  console.log(`  Redis agents: ${ids.length}`);

  for (const id of localFiles) {
    if (!ids.includes(id)) {
      const meta = loadLocalAgentMeta(id);
      if (meta) await registerAgent(id, meta);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2] || 'check';

switch (cmd) {
  case 'check':
    await checkAll();
    break;
  case 'renew':
    await renewAll();
    break;
  case 'repop':
    await repopAll();
    break;
  case 'full':
    await checkAll();
    await repopAll();
    await renewAll();
    console.log('\n  [expiry-guard] Full cycle complete');
    break;
  default:
    console.log('Usage: node scripts/agent-expiry-guard.mjs <check|renew|repop|full>');
}
