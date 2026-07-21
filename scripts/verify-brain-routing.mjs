import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const PORT = 9879;
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

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* ignore */
    }
    await delay(500);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function startServer() {
  console.log('[Brain] Starting ingestion server (server.ts)...');
  serverProcess = spawn(process.execPath, ['-r', 'tsx', 'server.ts'], {
    cwd: `${process.cwd()}/services/ingestion`,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));

  serverProcess.on('error', (err) => {
    console.error(`[Brain] Failed to start server process: ${err.message}`);
  });

  await waitForServer(`${BASE}/api/dashboard/summary`, 30000);
  console.log('[Brain] Server is ready\n');
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

async function check1_ProposeAndApproveProvenLogic() {
  const res = await fetch(`${BASE}/api/governance/proposed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'FAST_BRAIN_TEST',
      tags: ['telemetry', 'trace', 'observability'],
      prompt: 'Check telemetry trace status and observability metrics',
      id: 'brain-test-proven-1'
    })
  });
  const data = await res.json();
  console.log('[Brain] propose response:', JSON.stringify(data).slice(0, 200));
  if (!res.ok || !data.id) return false;

  const approveRes = await fetch(`${BASE}/api/governance/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'brain-test-proven-1' })
  });
  const approveData = await approveRes.json();
  console.log('[Brain] approve response:', JSON.stringify(approveData).slice(0, 200));
  return approveRes.ok && approveData.status === 'PROVEN';
}

async function check2_FastBrainRouting() {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Check telemetry trace status and observability metrics' }]
    })
  });
  const data = await res.json();
  console.log('[Brain] fast brain response:', JSON.stringify(data).slice(0, 300));
  return res.status === 200 &&
    data.governance &&
    data.governance.route === 'FAST_BRAIN' &&
    data.governance.matched === true;
}

async function check3_SlowBrainRouting() {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Explain quantum entanglement to a five year old' }]
    })
  });
  const data = await res.json();
  console.log('[Brain] slow brain response:', JSON.stringify(data).slice(0, 300));
  return res.status === 200 &&
    data.governance &&
    data.governance.route === 'SLOW_BRAIN' &&
    data.governance.matched === false;
}

async function run() {
  try {
    await startServer();
    await runCheck('Check 1: Propose and approve proven logic', check1_ProposeAndApproveProvenLogic);
    await runCheck('Check 2: FAST_BRAIN routing for matching prompt', check2_FastBrainRouting);
    await runCheck('Check 3: SLOW_BRAIN routing for unknown prompt', check3_SlowBrainRouting);
  } catch (e) {
    console.error(`[Brain] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log('========================================');

  if (failed > 0) {
    console.error('[Brain] VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[Brain] ALL CHECKS PASSED');
    process.exit(0);
  }
}

run();
