#!/usr/bin/env node
/**
 * scripts/verify-auth-boundary.mjs — Phase 4E authenticated regression gates.
 *
 * Proves the ingestion authentication boundary end-to-end against an isolated
 * server (NODE_ENV=test, KUDBEE_AUTH_BOUNDARY=required):
 *
 *   anonymous protected request            → 401 (authentication failure)
 *   authenticated authorized request       → reaches the route
 *   authenticated insufficient role        → 403 (authorization failure)
 *   anonymous terminal / filesystem        → 401 (no command / no fs access)
 *   public health + read-only surfaces     → preserved
 *
 * Credentials are generated in-test from a throwaway STREAM_SECRET — never
 * committed, never printed. Run: node scripts/verify-auth-boundary.mjs
 */
import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';
import { createHmac } from 'crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const INGESTION_DIR = path.join(__dirname, '..', 'services', 'ingestion');
const PORT = 9877;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_STREAM_SECRET = 'phase4e-auth-boundary-secret';
const TEST_SESSION_SECRET = 'phase4e-auth-boundary-session';
const TEST_PRINCIPALS = Object.freeze({
  admin: Object.freeze({ agentId: 'e2e-admin', roles: ['ADMIN'] }),
  operator: Object.freeze({ agentId: 'e2e-operator', roles: ['OPERATOR'] }),
  auditor: Object.freeze({ agentId: 'e2e-auditor', roles: ['AUDITOR'] }),
});
const TEST_TENANT_MEMBERSHIPS = JSON.stringify({
  'e2e-admin': { tenantId: 'tenant-prod', role: 'ADMIN' },
  'e2e-operator': { tenantId: 'tenant-staging', role: 'OPERATOR' },
  'e2e-auditor': { tenantId: 'tenant-audit', role: 'AUDITOR' },
});
let serverProcess = null;
let passed = 0;
let failed = 0;

function signedBearer(principal) {
  const issuedAt = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ agentId: principal.agentId, iat: issuedAt, roles: principal.roles }),
  ).toString('base64url');
  const signature = createHmac('sha256', TEST_STREAM_SECRET)
    .update(`${principal.agentId}:${issuedAt}`)
    .digest('hex');
  return `Bearer ${payload}.${signature}`;
}
function authHeaders(principalName, extra = {}) {
  return { ...extra, Authorization: signedBearer(TEST_PRINCIPALS[principalName]) };
}
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
  const tsxPath = require.resolve('tsx/cli');
  serverProcess = spawn(process.execPath, [tsxPath, 'server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      STREAM_SECRET: TEST_STREAM_SECRET,
      SESSION_SECRET: TEST_SESSION_SECRET,
      KUDBEE_TENANT_MEMBERSHIPS: TEST_TENANT_MEMBERSHIPS,
      KUDBEE_AUTH_BOUNDARY: 'required',
      DATABASE_URL: '',
      REDIS_URL: '',
      REDIS_WORKER_URL: '',
      REDIS_SLOW_URL: '',
      E2E_ALLOW_DATABASE_WRITES: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d.toString().trim()}\n`));
  await waitForServer(`${BASE}/health`, 15000);
  console.log('[auth-boundary] isolated server ready\n');
}
async function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await delay(500);
    if (serverProcess.killed === false) serverProcess.kill('SIGKILL');
  }
}
async function runCheck(name, fn) {
  try {
    const ok = await fn();
    assert(ok, name);
  } catch (e) {
    assert(false, `${name} threw: ${e.message}`);
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────
async function anonymousProtectedRejected() {
  const results = [];
  results.push((await fetch(`${BASE}/api/governance/tenants`)).status === 401);
  results.push((await fetch(`${BASE}/api/agents/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 401);
  results.push((await fetch(`${BASE}/api/memory/recall?query=test`)).status === 401);
  results.push((await fetch(`${BASE}/api/think/trajectories?limit=5`)).status === 401);
  return results.every(Boolean);
}
async function anonymousTerminalRejected() {
  const res = await fetch(`${BASE}/api/terminal/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'echo should-not-run' }),
  });
  return res.status === 401;
}
async function anonymousFilesystemRejected() {
  const res = await fetch(`${BASE}/api/tools/fs/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/tmp/nonexistent' }),
  });
  return res.status === 401;
}
async function authorizedReachesRoute() {
  const res = await fetch(`${BASE}/api/governance/tenants`, {
    headers: { ...authHeaders('admin'), 'X-Tenant-Id': 'tenant-prod' },
  });
  return res.status === 200;
}
async function insufficientRoleForbidden() {
  // /api/audit/vault/anchor requires ADMIN; operator is insufficient.
  const res = await fetch(`${BASE}/api/audit/vault/anchor`, {
    method: 'POST',
    headers: { ...authHeaders('operator'), 'Content-Type': 'application/json' },
    body: '{}',
  });
  return res.status === 403;
}
async function healthPublic() {
  const res = await fetch(`${BASE}/health`);
  return res.status === 200;
}
async function readOnlyPublic() {
  const res = await fetch(`${BASE}/api/telemetry/stats`);
  return res.status === 200;
}

async function main() {
  console.log('═══ PHASE 4E — AUTHENTICATED REGRESSION GATES ═══');
  await startServer();
  await runCheck('anonymous protected request → 401', anonymousProtectedRejected);
  await runCheck('anonymous terminal → 401 (no command)', anonymousTerminalRejected);
  await runCheck('anonymous filesystem → 401 (no fs access)', anonymousFilesystemRejected);
  await runCheck('authenticated authorized → reaches route (200)', authorizedReachesRoute);
  await runCheck('authenticated insufficient role → 403', insufficientRoleForbidden);
  await runCheck('public /health → 200', healthPublic);
  await runCheck('read-only /api/telemetry/stats → 200', readOnlyPublic);
  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  stopServer().finally(() => process.exit(1));
});
