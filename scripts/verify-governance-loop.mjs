import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = `${__dirname}/../services/ingestion`;
const PORT = 9877;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess = null;
let passed = 0;
let failed = 0;
let mintedTokenHash = '';
let mintedTokenId = '';

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
  console.log('[GovernanceLoop] Starting ingestion server...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));

  serverProcess.on('error', (err) => {
    console.error(`[GovernanceLoop] Failed to start server process: ${err.message}`);
  });

  await waitForServer(`${BASE}/health`, 15000);
  console.log('[GovernanceLoop] Server is ready\n');
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

async function check1_MintPendingApprovalToken() {
  const traceId = `tr-govloop-${Date.now()}`;
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId,
      taskContext: { task: 'governance-loop-test', agent: 'test-agent' },
      failedState: { status: 'PENDING_REVIEW' },
      correctionDelta: 'Governance loop test correction delta.',
      status: 'PENDING_APPROVAL'
    })
  });
  const data = await res.json();
  if (!(res.status === 201 && data.success === true && typeof data.tokenId === 'string')) {
    return false;
  }
  mintedTokenId = data.tokenId;

  const trajRes = await fetch(`${BASE}/api/think/trajectories?limit=10`);
  const trajData = await trajRes.json();
  const token = trajData.trajectories.find((t) => t.id === data.tokenId);
  if (!token) return false;

  mintedTokenHash = token.token_hash;
  return token.status === 'PENDING_APPROVAL';
}

async function check2_PatchPromoteToVerified() {
  if (!mintedTokenHash) return false;

  const res = await fetch(`${BASE}/api/think/trajectories/${encodeURIComponent(mintedTokenHash)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'VERIFIED', reviewerNotes: 'Automated governance loop promotion', tokenId: mintedTokenId })
  });
  const data = await res.json();
  return res.status === 200 && data.success === true && data.status === 'VERIFIED';
}

async function check3_ConfirmStatusMutation() {
  if (!mintedTokenHash) return false;

  const res = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const data = await res.json();
  const token = data.trajectories.find((t) => t.token_hash === mintedTokenHash);
  return token !== undefined && token.status === 'VERIFIED';
}

async function check4_PatchRecycleToken() {
  const traceId = `tr-govloop-recycle-${Date.now()}`;
  const mintRes = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId,
      taskContext: { task: 'governance-loop-recycle' },
      failedState: { status: 'RECYCLE_TEST' },
      correctionDelta: 'Token to be recycled.',
      status: 'PENDING_APPROVAL'
    })
  });
  const mintData = await mintRes.json();
  if (!(mintRes.status === 201 && mintData.success === true)) return false;
  const recycleTokenId = mintData.tokenId;

  const trajRes = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const trajData = await trajRes.json();
  const token = trajData.trajectories.find((t) => t.id === recycleTokenId);
  if (!token || token.status !== 'PENDING_APPROVAL') return false;

  const patchRes = await fetch(`${BASE}/api/think/trajectories/${encodeURIComponent(token.token_hash)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'RECYCLED', reviewerNotes: 'Automated recycle test', tokenId: recycleTokenId })
  });
  const patchData = await patchRes.json();
  if (!(patchRes.status === 200 && patchData.success === true && patchData.status === 'RECYCLED')) return false;

  const confirmRes = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const confirmData = await confirmRes.json();
  const updated = confirmData.trajectories.find((t) => t.token_hash === token.token_hash);
  return updated !== undefined && updated.status === 'RECYCLED';
}

async function run() {
  try {
    await startServer();
    await runCheck('Check 1: Mint PENDING_APPROVAL Think Token', check1_MintPendingApprovalToken);
    await runCheck('Check 2: PATCH promote to VERIFIED', check2_PatchPromoteToVerified);
    await runCheck('Check 3: Confirm status mutation in trajectories', check3_ConfirmStatusMutation);
    await runCheck('Check 4: PATCH recycle to RECYCLED', check4_PatchRecycleToken);
  } catch (e) {
    console.error(`[GovernanceLoop] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of 4`);
  console.log('========================================');

  if (failed > 0) {
    console.error('[GovernanceLoop] VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[GovernanceLoop] ALL CHECKS PASSED');
    process.exit(0);
  }
}

run();
