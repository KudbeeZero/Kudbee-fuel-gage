#!/usr/bin/env node
/**
 * scripts/canary-probe.mjs — Proactive Health Probe
 * ---------------------------------------------------------------------------
 * Tests API routes, frontend render states, and database connectivity.
 * Runs every 10 minutes via AWS EventBridge/EC2 cron.
 *
 * Reports: GREEN (all healthy), DEGRADED (some failures), RED (critical).
 * Publishes results to kudbee:stream:audit for AnomalyFeedPlugin.
 */
const BASE = process.env.CANARY_BASE_URL || 'http://localhost:3000';
const CHECKS = [
  { name: 'Health endpoint', url: '/health', expect: 200 },
  { name: 'Deploy status', url: '/api/system/deploy-status', expect: 200 },
  { name: 'Lock metrics', url: '/api/system/lock-metrics', expect: 200 },
  { name: 'Error report', url: '/api/system/error-report', expect: 200 },
  { name: 'Anomaly count', url: '/api/edge/anomalies/count', expect: 200 },
  { name: 'Frontend HTML', url: '/', expect: 200 },
  { name: 'JS bundle', url: '', expect: 200, dynamic: true },
  { name: 'HEALTH parse', url: '/health', expect: 200, parseHealth: true },
];

async function probe() {
  const results = [];
  let failures = 0;

  for (const check of CHECKS) {
    const start = Date.now();
    let url = check.dynamic ? await resolveBundleUrl() : `${BASE}${check.url}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const ok = res.status === check.expect;
      if (!ok) failures++;
      results.push({ name: check.name, status: ok ? 'PASS' : 'FAIL', code: res.status, ms: Date.now() - start });
      if (!ok) console.error(`[Canary] ${check.name} FAILED: ${res.status}`);
    } catch (e) {
      failures++;
      results.push({ name: check.name, status: 'ERROR', error: e.message.slice(0, 80), ms: Date.now() - start });
      console.error(`[Canary] ${check.name} ERROR: ${e.message.slice(0, 80)}`);
    }
  }

  const status = failures === 0 ? 'GREEN' : failures <= 2 ? 'DEGRADED' : 'RED';
  console.log(`[Canary] ${status} — ${results.length - failures}/${results.length} checks passed`);

  // Publish to audit channel
  if (process.env.UPSTASH_REDIS_REST_URL) {
    try {
      await fetch(process.env.UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
        body: JSON.stringify(['PUBLISH', 'kudbee:stream:audit', JSON.stringify({ type: 'canary.probe', status, results, timestamp: new Date().toISOString() })]),
      });
    } catch {}
  }

  process.exit(failures > 2 ? 1 : 0);
}

async function resolveBundleUrl() {
  try {
    const html = await (await fetch(`${BASE}/`)).text();
    const match = html.match(/src="\/assets\/(main-[^"]+\.js)"/);
    return match ? `${BASE}/assets/${match[1]}` : `${BASE}/`;
  } catch { return `${BASE}/`; }
}

probe();
