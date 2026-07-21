import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = `${__dirname}/../services/ingestion`;
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
    } catch {
      /* ignore */
    }
    await delay(200);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function startServer(agentPass) {
  console.log('[Sim] Starting ingestion server...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      EDGE_AGENT_PASS: agentPass
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));

  serverProcess.on('error', (err) => {
    console.error(`[Sim] Failed to start server process: ${err.message}`);
  });

  await waitForServer(`${BASE}/health`, 15000);
  console.log('[Sim] Server is ready\n');
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

function generateAgentPass(agentId) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const now = Date.now();
  const signature = crypto.sign(null, Buffer.from(`${agentId}:${now}`), privateKey).toString('base64');
  const pass = { agentId, issuedAt: now, signature };
  const encoded = Buffer.from(JSON.stringify(pass)).toString('base64');
  return { publicKey, privateKey, encoded };
}

async function injectAgentToRegistry(publicKey, agentId) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const registryPath = path.join(INGESTION_DIR, '../../config/agents.json');
  let raw = fs.readFileSync(registryPath, 'utf8');
  const parsed = JSON.parse(raw);
  const existing = (parsed.registry || []).findIndex(a => a.agentId === agentId);
  const entry = {
    agentId,
    publicKey,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  if (existing >= 0) {
    parsed.registry[existing] = entry;
  } else {
    parsed.registry.push(entry);
  }
  fs.writeFileSync(registryPath, JSON.stringify(parsed, null, 2));
}

async function postTelemetry(base, agentPass, event) {
  const res = await fetch(`${base}/api/telemetry/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Pass': agentPass
    },
    body: JSON.stringify(event)
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function checkGovernancePending(base) {
  const res = await fetch(`${base}/api/governance/pending`);
  const data = await res.json();
  return { status: res.status, data };
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

async function check1_IngestNormalEvent() {
  const payload = {
    trace_id: `tr-sim-normal-${Date.now()}`,
    model: 'gemini-1.5-pro',
    tokens_in: 150,
    tokens_out: 80,
    cost: 0.0025,
    status: 'OK',
    provider: 'Google',
    project_name: 'kilo-fuel-gauge'
  };
  const { status, data } = await postTelemetry(BASE, global.agentPass, payload);
  return (status === 200 || status === 201) && data.success === true;
}

async function check2_IngestLatencySpikeAnomaly() {
  const payload = {
    trace_id: `tr-sim-latency-${Date.now()}`,
    model: 'gemini-1.5-flash',
    tokens_in: 320,
    tokens_out: 120,
    cost: 0.0012,
    status: 'OK',
    provider: 'Google',
    project_name: 'kilo-fuel-gauge',
    latency_ms: 2500
  };
  const { status, data } = await postTelemetry(BASE, global.agentPass, payload);
  return (status === 200 || status === 201) && data.success === true;
}

async function check3_IngestErrorStatusAnomaly() {
  const payload = {
    trace_id: `tr-sim-error-${Date.now()}`,
    model: 'gpt-4o',
    tokens_in: 1200,
    tokens_out: 500,
    cost: 0.08,
    status: 'ERROR',
    provider: 'OpenAI',
    project_name: 'kilo-fuel-gauge',
    latency_ms: 1800
  };
  const { status, data } = await postTelemetry(BASE, global.agentPass, payload);
  return (status === 200 || status === 201) && data.success === true;
}

async function check4_GovernancePendingCreated() {
  await delay(500);
  const { data } = await checkGovernancePending(BASE);
  const hasPending = Array.isArray(data) && data.some(
    (item) => item.status === 'PENDING_APPROVAL' && item.agent_id === 'EDGE_SENTINEL'
  );
  return hasPending;
}

async function check5_BatchIngest() {
  const batch = [
    { trace_id: `tr-sim-b1-${Date.now()}`, model: 'claude-3-5-sonnet', tokens_in: 200, tokens_out: 90, cost: 0.004, status: 'OK', provider: 'Anthropic', project_name: 'frontier-core' },
    { trace_id: `tr-sim-b2-${Date.now()}`, model: 'deepseek-r1', tokens_in: 400, tokens_out: 150, cost: 0.001, status: 'OK', provider: 'DeepSeek', project_name: 'mesh-globe-3d' },
    { trace_id: `tr-sim-b3-${Date.now()}`, model: 'gemini-1.5-pro', tokens_in: 800, tokens_out: 300, cost: 0.003, status: 'RATE_LIMIT', provider: 'Google', project_name: 'api-gateway', latency_ms: 3200 },
    { trace_id: `tr-sim-b4-${Date.now()}`, model: 'gpt-4o', tokens_in: 100, tokens_out: 50, cost: 0.001, status: 'OK', provider: 'OpenAI', project_name: 'ml-pipeline' }
  ];
  for (const event of batch) {
    const { status } = await postTelemetry(BASE, global.agentPass, event);
    if (status !== 200 && status !== 201) return false;
  }
  return true;
}

async function check6_GovernancePendingHasEdgeSentinel() {
  await delay(500);
  const { data } = await checkGovernancePending(BASE);
  const sentinelItems = Array.isArray(data) ? data.filter(
    (item) => item.agent_id === 'EDGE_SENTINEL'
  ) : [];
  return sentinelItems.length >= 1;
}

async function run() {
  try {
    const { publicKey, encoded } = generateAgentPass('edge-sentinel-test');
    global.agentPass = encoded;

    await injectAgentToRegistry(publicKey, 'edge-sentinel-test');
    console.log('[Sim] Injected test agent into config/agents.json');

    await startServer(encoded);
    await runCheck('Check 1: Normal telemetry ingest', check1_IngestNormalEvent);
    await runCheck('Check 2: Latency spike anomaly ingest', check2_IngestLatencySpikeAnomaly);
    await runCheck('Check 3: Error status anomaly ingest', check3_IngestErrorStatusAnomaly);
    await runCheck('Check 4: Governance PENDING_APPROVAL created', check4_GovernancePendingCreated);
    await runCheck('Check 5: Batch telemetry ingest', check5_BatchIngest);
    await runCheck('Check 6: Governance shows Edge Sentinel actions', check6_GovernancePendingHasEdgeSentinel);
  } catch (e) {
    console.error(`[Sim] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log('========================================');

  if (failed > 0) {
    console.error('[Sim] VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[Sim] ALL CHECKS PASSED');
    process.exit(0);
  }
}

run();
