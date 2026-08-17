#!/usr/bin/env node
/**
 * scripts/workspace-sync.mjs — Global Workspace Tensor Synchronization
 * ---------------------------------------------------------------------------
 * Sweeps and aligns the shared consciousness centroid tensor across the
 * 40-agent mesh. Runs via AWS EventBridge/EC2 cron.
 *
 * Frequency:
 *   /scheduler run workspace-sync    → manual trigger
 *   AWS EventBridge every 10 minutes   → auto-sync
 *   Hourly full-state rollup at :0
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(REDIS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(args), signal: AbortSignal.timeout(5000) });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

async function syncWorkspace() {
  const mode = process.argv[2] || 'sync';
  console.log(`[WorkspaceSync] ${mode === 'full' ? 'Full-state rollup' : 'Incremental sync'} starting...`);

  // Scan all workspace keys
  const workspaceKeys = [];
  let cursor = 0;
  do {
    const res = await redisCmd(['SCAN', String(cursor), 'MATCH', 'kudbee:global:workspace:*', 'COUNT', '50']);
    if (!res) break;
    const [nextCursor, keys] = res.result || [[0, []]];
    cursor = parseInt(nextCursor);
    workspaceKeys.push(...keys);
  } while (cursor !== 0);

  if (workspaceKeys.length === 0) {
    console.log('[WorkspaceSync] No active agents in workspace');
    return;
  }

  // Fetch all vectors
  const vectors = [];
  for (const key of workspaceKeys) {
    const res = await redisCmd(['GET', key]);
    if (res?.result) {
      try { vectors.push(JSON.parse(res.result)); } catch {}
    }
  }

  if (vectors.length === 0) return;

  // Compute centroid (element-wise mean)
  const dim = vectors[0].vector?.length || 64;
  const centroid = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < Math.min(dim, v.vector.length); i++) {
      centroid[i] += v.vector[i];
    }
  }
  for (let i = 0; i < dim; i++) centroid[i] = Math.round(centroid[i] / vectors.length * 10000) / 10000;

  // Store centroid + stats
  const snapshot = {
    centroid,
    totalAgents: vectors.length,
    moods: {},
    fieldEnergy: 0,
    timestamp: new Date().toISOString(),
    mode,
  };

  for (const v of vectors) {
    snapshot.moods[v.mood] = (snapshot.moods[v.mood] || 0) + 1;
  }

  await redisCmd(['SET', 'kudbee:global:workspace:centroid', JSON.stringify(snapshot), 'EX', '3600']);

  // Publish sync event
  await redisCmd(['PUBLISH', 'kudbee:stream:audit', JSON.stringify({
    type: 'workspace.sync',
    totalAgents: vectors.length,
    centroidDim: dim,
    mode,
    timestamp: snapshot.timestamp,
  })]);

  console.log(`[WorkspaceSync] Complete — ${vectors.length} agents, centroid dim ${dim}, mode: ${mode}`);
}

syncWorkspace().catch(e => { console.error('[WorkspaceSync] Error:', e.message); process.exit(1); });
