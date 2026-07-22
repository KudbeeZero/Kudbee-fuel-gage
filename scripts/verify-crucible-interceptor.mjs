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

async function startServer() {
  console.log('[E2E] Starting ingestion server...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      CRUCIBLE_ENABLED: 'true'
    },
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

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

function signPayload(privateKeyPem, payload) {
  return crypto.sign(null, Buffer.from(payload), privateKeyPem).toString('base64');
}

function createAgentPass(privateKeyPem, agentId, now = Date.now()) {
  const signature = signPayload(privateKeyPem, `${agentId}:${now}`);
  const pass = { agentId, issuedAt: now, signature };
  return Buffer.from(JSON.stringify(pass)).toString('base64');
}

async function check1_IngestTelemetry() {
  const traceId = `tr-e2e-crucible-${Date.now()}`;
  const res = await fetch(`${BASE}/api/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trace_id: traceId,
      model: 'gemini-1.5-pro',
      tokens_in: 150,
      tokens_out: 80,
      cost: 0.0025,
      status: 'OK',
      provider: 'Google',
      project_name: 'kilo-fuel-gauge'
    })
  });
  const data = await res.json();
  return res.status === 201 && data.success === true;
}

async function check2_InterceptorVerify() {
  const traceId = `tr-e2e-crucible-${Date.now()}`;
  const { publicKey, privateKey } = generateKeyPair();
  const agentId = `partner-${Date.now()}`;
  const canonical = JSON.stringify({ trace_id: traceId, value_score: 75 });
  const signature = signPayload(privateKey, canonical);
  const agentPass = createAgentPass(privateKey, agentId);

  const res = await fetch(`${BASE}/api/interceptor/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trace_id: traceId,
      agent_id: agentId,
      agent_pass: agentPass,
      signature,
      signed_payload: canonical,
      public_key: publicKey,
      value_score: 75,
      note: 'E2E verification test'
    })
  });
  const data = await res.json();
  return res.status === 201 && data.success === true && data.verified === true && typeof data.actionId !== 'undefined';
}

async function check3_CrucibleRun() {
  const res = await fetch(`${BASE}/api/agents/crucible/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  console.log('  Crucible run response:', JSON.stringify(data));
  return res.status === 200 && data.success === true && typeof data.cycle === 'number' && data.cycle > 0;
}

async function check4_GovernanceProposedAfterCrucible() {
  await delay(2000);
  const res = await fetch(`${BASE}/api/governance/proposed`);
  const data = await res.json();
  const crucibleActions = Array.isArray(data)
    ? data.filter((a) => a.action === 'CRUCIBLE_FAILED_STATE_REVIEW' || (a.tags && a.tags.includes('crucible')))
    : [];
  return Array.isArray(data) && crucibleActions.length > 0;
}

async function check5_ReasoningLedgerAfterCrucible() {
  await delay(1000);
  const res = await fetch(`${BASE}/api/reasoning/ledger?limit=10`);
  const data = await res.json();
  console.log('  Reasoning ledger response count:', data.count, 'entries:', data.entries?.length);
  const crucibleEntries = Array.isArray(data.entries)
    ? data.entries.filter((e) => e.provider === 'crucible-agent' || e.event_type === 'reasoning')
    : [];
  return res.status === 200 && crucibleEntries.length > 0;
}

async function run() {
  try {
    await startServer();
    await runCheck('Check 1: Ingest telemetry log', check1_IngestTelemetry);
    await runCheck('Check 2: Interceptor verify with crypto signature', check2_InterceptorVerify);
    await runCheck('Check 3: Crucible run cycle', check3_CrucibleRun);
    await runCheck('Check 4: Governance proposed actions after crucible', check4_GovernanceProposedAfterCrucible);
    await runCheck('Check 5: Reasoning ledger entries after crucible', check5_ReasoningLedgerAfterCrucible);
  } catch (e) {
    console.error(`[E2E] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of 5`);
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
