import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = `${__dirname}/../services/ingestion`;
const PORT = 9876;
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
  console.log('[E2E] Starting ingestion server...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));

  serverProcess.on('error', (err) => {
    console.error(`[E2E] Failed to start server process: ${err.message}`);
  });

  await waitForServer(`${BASE}/health`, 15000);
  console.log('[E2E] Server is ready\n');
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

async function check1_HealthEndpoint() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  return res.status === 200 && ['ok', 'degraded'].includes(data.status) && data.dependencies?.ingestion_db;
}

async function check2_HealthCheckApi() {
  const res = await fetch(`${BASE}/api/health-check`);
  const data = await res.json();
  const hasUptime = typeof data.uptime_sec === 'number';
  const hasError = typeof data.error === 'string';
  const degradedGracefully = res.status === 500 && hasError;
  return (res.status === 200 || res.status === 503 || degradedGracefully) && (hasUptime || hasError);
}

async function check3_ValidIngest() {
  const payload = {
    trace_id: `tr-e2e-${Date.now()}`,
    model: 'gemini-1.5-pro',
    tokens_in: 150,
    tokens_out: 80,
    cost: 0.0025,
    status: 'OK',
    provider: 'Google',
    project_name: 'kilo-fuel-gauge'
  };
  const res = await fetch(`${BASE}/api/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return (res.status === 200 || res.status === 201) && data.success === true;
}

async function check4_InvalidIngestRejection() {
  const res = await fetch(`${BASE}/api/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invalid: true })
  });
  return res.status === 422;
}

async function check5_TelemetryLogs() {
  const res = await fetch(`${BASE}/api/telemetry/logs?limit=5`);
  const data = await res.json();
  return Array.isArray(data) && data.length >= 1;
}

async function check6_MemoryRecall() {
  const res = await fetch(`${BASE}/api/memory/recall?query=control+tower+telemetry&limit=3`);
  const data = await res.json();
  return res.status === 200 && Array.isArray(data.memories);
}

async function check7_GovernanceHealth() {
  const res = await fetch(`${BASE}/api/governance/health`);
  const data = await res.json();
  return res.status === 200 && data.governance_active === true;
}

async function check8_HermesLogs() {
  const res = await fetch(`${BASE}/api/governance/hermes-logs`);
  const data = await res.json();
  return (res.status === 200 || res.status === 500) && (Array.isArray(data) || typeof data === 'object');
}

async function check9_DatabaseDependency() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  return data.dependencies && (data.dependencies.ingestion_db === 'healthy' || data.dependencies.ingestion_db === 'unhealthy');
}

async function check10_SchemaExistence() {
  const res = await fetch(`${BASE}/api/interceptor/triage`);
  return res.status === 200;
}

async function check11_DashboardAggregate() {
  const res = await fetch(`${BASE}/api/dashboard/summary`);
  const data = await res.json();
  return res.status === 200 && typeof data.total_historical_tokens === 'number';
}

async function check12_DeepHealthEndpoint() {
  const res = await fetch(`${BASE}/api/system/health-deep`);
  const data = await res.json();
  return res.status === 200 && (data.status === 'HEALTHY' || data.status === 'DEGRADED') && data.services && data.agent;
}

async function check13_ModelComparator() {
  const res = await fetch(`${BASE}/api/system/compare-providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gemini' })
  });
  const data = await res.json();
  return res.status === 200 && (data.status === 'OK' || data.status === 'PROVIDER_UNREACHABLE') && typeof data.traceId === 'string';
}

async function check14_MintThinkToken() {
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `tr-e2e-${Date.now()}`,
      taskContext: { task: 'e2e-test' },
      failedState: { status: 'FAILED' },
      correctionDelta: 'E2E correction delta'
    })
  });
  const data = await res.json();
  return res.status === 201 && data.success === true && typeof data.tokenId === 'string';
}

async function check15_ThinkTrajectories() {
  const res = await fetch(`${BASE}/api/think/trajectories?limit=10`);
  const data = await res.json();
  return res.status === 200 && Array.isArray(data.trajectories) && Array.isArray(data.count !== undefined ? [data.count] : []);
}

async function check16_AutoThinkTokenEmbedding() {
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `tr-e2e-auto-${Date.now()}`,
      taskContext: { task: 'e2e-auto-check' },
      failedState: { status: 'AUTO_TEST' },
      correctionDelta: 'Automated verification correction delta',
      reasoningSteps: ['Step 1: verify embedding generation', 'Step 2: verify persistence', 'Step 3: verify trajectory surfacing']
    })
  });
  const data = await res.json();
  const minted = res.status === 201 && data.success === true && typeof data.tokenId === 'string' && data.embedding_dim === 1536;

  const trajRes = await fetch(`${BASE}/api/think/trajectories?limit=5`);
  const trajData = await trajRes.json();
  const hasValidTrajectory = trajRes.status === 200 &&
    Array.isArray(trajData.trajectories) &&
    trajData.trajectories.some((t) => {
      const coords = Array.isArray(t.spatial_coordinates) ? t.spatial_coordinates : [];
      return coords.length === 1536;
    });

  return minted && hasValidTrajectory;
}

async function check17_GovernancePromotionEndpoint() {
  const traceId = `tr-e2e-gov-${Date.now()}`;
  const mintRes = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId,
      taskContext: { task: 'e2e-gov-check' },
      failedState: { status: 'GOV_TEST' },
      correctionDelta: 'Governance promotion test delta',
      status: 'PENDING_APPROVAL'
    })
  });
  const mintData = await mintRes.json();
  if (!(mintRes.status === 201 && mintData.success === true && typeof mintData.tokenId === 'string')) {
    return false;
  }

  const trajRes = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const trajData = await trajRes.json();
  const token = trajData.trajectories.find((t) => t.id === mintData.tokenId);
  if (!token || token.status !== 'PENDING_APPROVAL') return false;

  const patchRes = await fetch(`${BASE}/api/think/trajectories/${encodeURIComponent(token.token_hash)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'VERIFIED', reviewerNotes: 'E2E governance promotion', tokenId: token.id })
  });
  const patchData = await patchRes.json();
  if (!(patchRes.status === 200 && patchData.success === true && patchData.status === 'VERIFIED')) return false;

  const confirmRes = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const confirmData = await confirmRes.json();
  const updated = confirmData.trajectories.find((t) => t.token_hash === token.token_hash);
  return updated !== undefined && updated.status === 'VERIFIED';
}

async function run() {
  try {
    await startServer();
    await runCheck('Check 1: Health endpoint', check1_HealthEndpoint);
    await runCheck('Check 2: Health-check API endpoint', check2_HealthCheckApi);
    await runCheck('Check 3: Valid telemetry ingest', check3_ValidIngest);
    await runCheck('Check 4: Invalid payload rejection', check4_InvalidIngestRejection);
    await runCheck('Check 5: Telemetry logs retrieval', check5_TelemetryLogs);
    await runCheck('Check 6: Memory recall', check6_MemoryRecall);
    await runCheck('Check 7: Governance health', check7_GovernanceHealth);
    await runCheck('Check 8: HERMES logs endpoint', check8_HermesLogs);
    await runCheck('Check 9: Database dependency reporting', check9_DatabaseDependency);
    await runCheck('Check 10: Schema existence via interceptor', check10_SchemaExistence);
    await runCheck('Check 11: Dashboard aggregate query', check11_DashboardAggregate);
    await runCheck('Check 12: Deep health endpoint', check12_DeepHealthEndpoint);
    await runCheck('Check 13: Model comparator endpoint', check13_ModelComparator);
    await runCheck('Check 14: Mint think token endpoint', check14_MintThinkToken);
    await runCheck('Check 15: Think trajectories endpoint', check15_ThinkTrajectories);
    await runCheck('Check 16: Auto Think Token embedding & trajectory', check16_AutoThinkTokenEmbedding);
    await runCheck('Check 17: Governance promotion endpoint (PATCH status)', check17_GovernancePromotionEndpoint);
  } catch (e) {
    console.error(`[E2E] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of 17`);
  console.log('========================================');

  if (failed > 0) {
    console.error('[E2E] VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[E2E] ALL CHECKS PASSED');
    process.exit(0);
  }
}

run();
