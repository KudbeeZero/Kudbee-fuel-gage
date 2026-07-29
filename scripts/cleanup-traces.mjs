#!/usr/bin/env node
/**
 * scripts/cleanup-traces.mjs — Stale Audit Log & Trace Stream Purging
 * ---------------------------------------------------------------------------
 * Cleans stale correlation audit logs and temporary Redis streams.
 * Runs daily at 12:00 AM UTC via Heroku Scheduler on Standard-1X dyno.
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX_TRACE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function redisCmd(args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const res = await fetch(REDIS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(args) });
  return res.ok ? res.json() : null;
}

async function cleanup() {
  let purged = 0;
  console.log('[Cleanup] Starting trace purge...');

  // Purge stale bus events older than 7 days with cursor iteration
  let cursor = 0;
  do {
    const busEvents = await redisCmd(['SCAN', String(cursor), 'MATCH', 'evt-*', 'COUNT', '50']);
    if (!busEvents) break;
    const [nextCursor, keys] = busEvents.result || [['0', []]];
    cursor = parseInt(nextCursor);
    for (const key of keys || []) {
      const ttl = await redisCmd(['TTL', key]);
      if (ttl?.result === -1 || ttl?.result <= 0) { await redisCmd(['DEL', key]); purged++; }
    }
  } while (cursor !== 0);

  // Purge expired lock workspace entries with cursor iteration
  cursor = 0;
  do {
    const workspaceKeys = await redisCmd(['SCAN', String(cursor), 'MATCH', 'kudbee:global:workspace:*', 'COUNT', '50']);
    if (!workspaceKeys) break;
    const [nextCursor, keys] = workspaceKeys.result || [['0', []]];
    cursor = parseInt(nextCursor);
    for (const key of keys || []) {
      const ttl = await redisCmd(['TTL', key]);
      if (ttl?.result <= 0) { await redisCmd(['DEL', key]); purged++; }
    }
  } while (cursor !== 0);

  // Clean stale decisions (older than 7 days)
  const fs = await import('fs');
  const decisionsDir = '.kilo/memory/decisions';
  if (fs.existsSync(decisionsDir)) {
    for (const f of fs.readdirSync(decisionsDir)) {
      if (f.endsWith('.json')) {
        const stat = fs.statSync(`${decisionsDir}/${f}`);
        if (Date.now() - stat.mtimeMs > MAX_TRACE_AGE_MS) {
          fs.rmSync(`${decisionsDir}/${f}`);
          purged++;
        }
      }
    }
  }

  console.log(`[Cleanup] Complete — ${purged} items purged`);
  process.exit(0);
}

cleanup().catch(e => { console.error('[Cleanup] Error:', e.message); process.exit(1); });
