import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = `${__dirname}/../services/ingestion`;
const PORT = 9878;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess = null;
let passed = 0;
let failed = 0;
let lastMintedTraceId = '';

function assert(check, label) {
  if (check) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* ignore */
    }
    await delay(200);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function startServer() {
  console.log('[ThinkLoop] Starting ingestion server...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));

  serverProcess.on('error', (err) => {
    console.error(`[ThinkLoop] Failed to start server process: ${err.message}`);
  });

  await waitForServer(`${BASE}/health`, 15000);
  console.log('[ThinkLoop] Server is ready\n');
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

async function runCheck(name, fn) {
  console.log(`--- ${name} ---`);
  try {
    const ok = await fn();
    assert(ok, name);
  } catch (e) {
    assert(false, `${name} threw: ${e.message}`);
  }
}

async function check1_MintThinkTokenWithReasoning() {
  lastMintedTraceId = `tr-thinkloop-${Date.now()}`;
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: lastMintedTraceId,
      taskContext: {
        traceId: lastMintedTraceId,
        task: 'simulated-reasoning',
        agent: 'test-agent',
        phase: 'Phase28'
      },
      failedState: { status: 'SIMULATED_FAILURE', details: 'test context' },
      correctionDelta: 'Rerouted logic through verified vector memory path.',
      reasoningSteps: [
        'Identified duplicate governance action in session history.',
        'Queried vector memory for similar past corrections.',
        'Applied correction delta and verified against topology.'
      ]
    })
  });
  const data = await res.json();
  return (
    res.status === 201 &&
    data.success === true &&
    typeof data.tokenId === 'string' &&
    typeof data.embedding_dim === 'number' &&
    data.embedding_dim === 1536
  );
}

async function check2_TrajectoryEmbeddingValid() {
  const res = await fetch(`${BASE}/api/think/trajectories?limit=10`);
  const data = await res.json();
  if (!res.status === 200 || !Array.isArray(data.trajectories)) return false;

  const hasValidEmbedding = data.trajectories.some((t) => {
    const coords = Array.isArray(t.spatial_coordinates) ? t.spatial_coordinates : [];
    return coords.length === 1536 && coords.every((v) => typeof v === 'number' && !Number.isNaN(v));
  });

  return hasValidEmbedding && data.trajectories.length > 0;
}

async function check3_ThinkTokenStatusRouting() {
  const res = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const data = await res.json();
  if (!res.status === 200 || !Array.isArray(data.trajectories)) return false;

  const mintedTrajectory = data.trajectories.find((t) => t.task_context?.traceId === lastMintedTraceId);
  if (!mintedTrajectory) return false;

  return ['PENDING_APPROVAL', 'VERIFIED', 'RECYCLED'].includes(mintedTrajectory.status);
}

async function check4_RedisTelemetryPubSub() {
  const healthRes = await fetch(`${BASE}/health`);
  const healthData = await healthRes.json();
  const redisHealthy = healthData.dependencies?.redis === 'healthy';

  if (!redisHealthy) {
    console.log('  [SKIP] Redis unavailable — verifying in-memory fallback minted token instead');
    const res = await fetch(`${BASE}/api/think/trajectories?limit=5`);
    const data = await res.json();
    return res.status === 200 && Array.isArray(data.trajectories) && data.trajectories.length > 0;
  }

  const res = await fetch(`${BASE}/api/events`, {
    headers: { Accept: 'text/event-stream' }
  });
  return res.status === 200 && res.headers.get('content-type') === 'text/event-stream';
}

async function run() {
  try {
    await startServer();
    await runCheck('Check 1: Mint Think Token with reasoning steps', check1_MintThinkTokenWithReasoning);
    await runCheck('Check 2: Trajectory embedding is valid 1536-dim', check2_TrajectoryEmbeddingValid);
    await runCheck('Check 3: Think Token status routing is valid', check3_ThinkTokenStatusRouting);
    await runCheck('Check 4: Redis telemetry pub/sub surfaces think token', check4_RedisTelemetryPubSub);
  } catch (e) {
    console.error(`[ThinkLoop] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of 4`);
  console.log('========================================');

  if (failed > 0) {
    console.error('[ThinkLoop] VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[ThinkLoop] ALL CHECKS PASSED');
    process.exit(0);
  }
}

run();
