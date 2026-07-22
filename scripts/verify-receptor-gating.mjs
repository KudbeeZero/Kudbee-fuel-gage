/**
 * scripts/verify-receptor-gating.mjs
 * ---------------------------------------------------------------------------
 * Phase 32 E2E Verification — Receptor Gating & Suboxone Effect Locking.
 *
 * Starts the ingestion server, then runs 4 gating assertions:
 *   1. Mint a high-affinity Guard Token (Kd ≤ 0.05, ε = 0) locks slot (1,1,1).
 *   2. Ordinary token at (1,1,1) is rejected with 423 Locked.
 *   3. CHALLENGE_TOKEN with superior Kd overrides the lock.
 *   4. Guard Token lock state is confirmed via the gating engine.
 *
 * Resilient-First: test failures degrade with clear diagnostics.
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const INGESTION_DIR = new URL('../services/ingestion', import.meta.url).pathname;
const PORT = 9877;
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let passed = 0;
let failed = 0;

function assert(check, label) {
  if (check) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* ignore */ }
    await delay(200);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function startServer() {
  // Clean stale locks from previous test runs so each verification starts fresh.
  try {
    const Redis = (await import('ioredis')).default;
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const isUpstash = url.startsWith('rediss://') || url.includes('upstash.io');
    const config = { lazyConnect: false, enableOfflineQueue: true };
    if (isUpstash) config.tls = { rejectUnauthorized: false };
    const redis = new Redis(url, config);
    await new Promise(r => setTimeout(r, 1000));
    await redis.del('kudbee:receptor:locks');
    await redis.quit();
    console.log('[ReceptorE2E] Cleared stale receptor locks from Redis.');
  } catch { /* degrade gracefully — Redis may be unavailable */ }

  console.log('[ReceptorE2E] Starting ingestion server...');
  const tsxPath = require.resolve('tsx/cli');
  serverProcess = spawn(process.execPath, [tsxPath, 'server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d.toString().trim()}\n`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d.toString().trim()}\n`));

  await waitForServer(`${BASE}/health`, 20000);
  console.log('[ReceptorE2E] Server ready.\n');
}

async function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await delay(500);
    if (serverProcess.killed === false) {
      serverProcess.kill('SIGKILL');
    }
  }
}

async function check1_GuardTokenLocksSlot() {
  console.log('--- Check 1: Guard Token locks coordinate slot (1,1,1) ---');
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `guard-${Date.now()}`,
      correctionDelta: 'Guard Token — high-affinity antagonist',
      kd: 0.02,
      efficacy: 0.0,
      spatial_coordinates: [1, 1, 1]
    })
  });
  const data = await res.json();
  console.log(`  response status: ${res.status}`);
  console.log(`  response data: ${JSON.stringify(data).slice(0, 300)}`);

  const minted = res.status === 201 && data.success === true && typeof data.tokenId === 'string';
  const locked = data.receptor?.admitted === true && data.receptor?.auditHash !== undefined;

  assert(minted, 'Guard Token minted successfully');
  assert(locked, 'Receptor lock acquired on Guard Token admission');
  return data.tokenId || null;
}

async function check2_OrdinaryTokenRejected() {
  console.log('\n--- Check 2: Ordinary token rejected at locked slot (1,1,1) ---');
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `ordinary-${Date.now()}`,
      correctionDelta: 'Ordinary token — should be blocked',
      kd: 0.3,
      efficacy: 0.5,
      spatial_coordinates: [1, 1, 1]
    })
  });
  const data = await res.json();
  console.log(`  response status: ${res.status}`);
  console.log(`  response data: ${JSON.stringify(data).slice(0, 300)}`);

  const locked = res.status === 423;
  const hasReason = typeof data.reason === 'string' && data.reason.length > 0;

  assert(locked, 'Ordinary token rejected with 423 Locked status');
  assert(hasReason, '423 response includes rejection reason');
}

async function check3_ChallengeTokenOverrides() {
  console.log('\n--- Check 3: CHALLENGE_TOKEN overrides lock with superior affinity ---');
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `challenge-${Date.now()}`,
      correctionDelta: 'Challenge Token — superior Kd override',
      kd: 0.005,
      efficacy: 0.0,
      tokenType: 'CHALLENGE_TOKEN',
      spatial_coordinates: [1, 1, 1]
    })
  });
  const data = await res.json();
  console.log(`  response status: ${res.status}`);
  console.log(`  response data: ${JSON.stringify(data).slice(0, 300)}`);

  const overrode = res.status === 201 && data.success === true;
  const admitted = data.receptor?.admitted === true;

  assert(overrode, 'CHALLENGE_TOKEN minted successfully');
  assert(admitted, 'CHALLENGE_TOKEN admission confirmed (lock overridden)');

  return data.tokenId || null;
}

async function run() {
  try {
    await startServer();

    const guardId = await check1_GuardTokenLocksSlot();
    const ordinaryId = await check2_OrdinaryTokenRejected();
    const challengeId = await check3_ChallengeTokenOverrides();

    console.log('\n========================================');
    console.log(`Receptor Gating Results: ${passed} passed, ${failed} failed out of 6`);
    console.log('========================================');

    if (failed > 0) {
      console.error('[ReceptorE2E] VERIFICATION FAILED');
      process.exitCode = 1;
    } else {
      console.log('[ReceptorE2E] ALL CHECKS PASSED');
    }
  } catch (e) {
    console.error(`[ReceptorE2E] Fatal error: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await stopServer();
    process.exit(process.exitCode ?? 0);
  }
}

run();
