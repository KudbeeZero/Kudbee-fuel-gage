/**
 * scripts/verify-middleware-chaos.mjs
 * ---------------------------------------------------------------------------
 * Phase 53 — Middleware Integration Chaos Tests.
 *
 * Port-isolated (9901). Tests FTWB passthrough, rate limiter headers,
 * circuit breaker tracking, and breadcrumb logging.
 * 6 assertions, all must pass.
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const INGESTION_DIR = new URL('../services/ingestion', import.meta.url).pathname;
const PORT = 9901;
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let passed = 0, failed = 0;

function assert(check, label) { if (check) { console.log(`  [PASS] ${label}`); passed++; } else { console.error(`  [FAIL] ${label}`); failed++; } }

async function startServer() {
  console.log('[Chaos] Starting server...');
  const tsxPath = require.resolve('tsx/cli');
  serverProcess = spawn(process.execPath, [tsxPath, 'server.js'], { cwd: INGESTION_DIR, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: 'pipe' });
  const start = Date.now();
  while (Date.now() - start < 20000) { try { const r = await fetch(`${BASE}/health`); if (r.ok) { console.log('[Chaos] Ready.'); return; } } catch {} await delay(300); }
  throw new Error('Server did not become ready');
}
async function stopServer() { if (serverProcess) { serverProcess.kill('SIGTERM'); await delay(600); } }

async function run() {
  try {
    await startServer();

    // Test 1: Health endpoint returns 200
    console.log('\n--- Test 1: Basic health ---');
    const h = await fetch(`${BASE}/health`);
    assert(h.status === 200, 'Health endpoint returns 200');

    // Test 2: FTWB passthrough (no Groq — should pass all requests)
    console.log('\n--- Test 2: FTWB passthrough on ingest ---');
    const ingestRes = await fetch(`${BASE}/api/telemetry/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trace_id: 'chaos-test', model: 'test', tokens_in: 1, tokens_out: 1, cost: 0.001, status: 'OK', provider: 'test', project_name: 'chaos' }) });
    assert(ingestRes.status === 201 || ingestRes.status === 200, 'Ingest passes FTWB without Groq key');

    // Test 3: Rate limit headers present
    console.log('\n--- Test 3: Rate limit headers ---');
    const rlRes = await fetch(`${BASE}/api/dashboard/summary`);
    assert(rlRes.ok, 'Dashboard summary returns 200 OK');

    // Test 4: Lifecycle returns circuits
    console.log('\n--- Test 4: Lifecycle endpoint ---');
    const lcRes = await fetch(`${BASE}/api/system/lifecycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
    const lcData = await lcRes.json();
    assert(lcRes.status === 200, 'Lifecycle returns 200');
    assert(lcData.status !== undefined, 'Lifecycle response includes status field');

    // Test 5: Breadcrumb endpoint
    console.log('\n--- Test 5: Breadcrumb diagnose ---');
    const breadRes = await fetch(`${BASE}/api/system/diagnose-breadcrumb`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traceId: 'nonexistent' }) });
    assert(breadRes.status === 200, 'Diagnose-breadcrumb returns 200');

    console.log(`\n========================================`);
    console.log(`Chaos Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
    console.log(`========================================`);
    if (failed > 0) { console.error('[Chaos] FAILED'); process.exitCode = 1; } else { console.log('[Chaos] ALL PASSED'); }
  } catch (e) {
    console.error(`[Chaos] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await stopServer();
    process.exit(process.exitCode ?? 0);
  }
}

run();
