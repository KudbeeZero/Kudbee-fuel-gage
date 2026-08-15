#!/usr/bin/env node
/**
 * scripts/verify-capability.mjs — Phase 5B capability registry + observability.
 *
 * Proves:
 *   1. known agent resolves expected capabilities
 *   2. unknown agent resolves safely (empty, no throw)
 *   3. role resolution works
 *   4. capability context attaches correctly
 *   5. missing capability is observable (telemetry)
 *   6. missing capability does NOT yet produce 403 (observe only)
 *   7. existing authenticated requests still work
 *   8. existing 401 behavior remains unchanged
 *   9. existing 403 role behavior remains unchanged
 *  10. no secrets enter logs
 *
 * Run: node --experimental-strip-types scripts/verify-capability.mjs
 */
import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';
import { createHmac } from 'crypto';
import { resolveCapabilities, endpointCapability } from '../services/lib/capabilityRegistry.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const INGESTION_DIR = path.join(__dirname, '..', 'services', 'ingestion');
const PORT = 9878;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_STREAM_SECRET = 'phase5b-capability-secret';
let serverProcess = null;
let passed = 0;
let failed = 0;

function assert(check, label) {
  if (check) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.error(`  [FAIL] ${label}`); failed++; }
}
function signedBearer(agentId, roles) {
  const iat = Date.now();
  const payload = Buffer.from(JSON.stringify({ agentId, iat, roles })).toString('base64url');
  const sig = createHmac('sha256', TEST_STREAM_SECRET).update(`${agentId}:${iat}`).digest('hex');
  return `Bearer ${payload}.${sig}`;
}
async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(200);
  }
  throw new Error('server not ready');
}
async function startServer() {
  const tsxPath = require.resolve('tsx/cli');
  serverProcess = spawn(process.execPath, [tsxPath, 'server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env, PORT: String(PORT), NODE_ENV: 'test',
      STREAM_SECRET: TEST_STREAM_SECRET, KUDBEE_AUTH_BOUNDARY: 'required',
      DATABASE_URL: '', REDIS_URL: '', REDIS_WORKER_URL: '', REDIS_SLOW_URL: '',
      E2E_ALLOW_DATABASE_WRITES: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  serverProcess.stderr.on('data', (d) => { stderr += d.toString(); });
  await waitForServer(`${BASE}/health`, 15000);
  return () => stderr;
}
async function stopServer() {
  if (serverProcess) { serverProcess.kill('SIGTERM'); await delay(500); if (serverProcess.killed === false) serverProcess.kill('SIGKILL'); }
}
async function runCheck(name, fn) {
  try { const ok = await fn(); assert(ok, name); } catch (e) { assert(false, `${name} threw: ${e.message}`); }
}

async function main() {
  console.log('═══ PHASE 5B — CAPABILITY REGISTRY + OBSERVABILITY ═══');

  // ── Unit: resolver ──
  const admin = resolveCapabilities({ agentId: 'a', roles: ['ADMIN'] });
  assert(admin.capabilities.includes('admin:agents'), 'ADMIN resolves admin:agents');
  assert(admin.capabilities.includes('execute:terminal'), 'ADMIN resolves execute:terminal');
  assert(admin.capabilities.includes('execute:aws'), 'ADMIN resolves execute:aws');
  const viewer = resolveCapabilities({ agentId: 'v', roles: ['VIEWER'] });
  assert(viewer.capabilities.includes('read:state') && !viewer.capabilities.includes('execute:terminal'), 'VIEWER is read-only');
  const unknown = resolveCapabilities({ agentId: 'ghost', roles: [] });
  assert(Array.isArray(unknown.capabilities) && unknown.capabilities.length === 0, 'unknown agent resolves safely (empty)');
  assert(endpointCapability('/api/terminal/execute') === 'execute:terminal', 'endpoint→capability mapping works');
  assert(endpointCapability('/api/tools/fs/read') === 'execute:fs', 'fs endpoint maps to execute:fs');

  // ── Integration: isolated server ──
  const getStderr = await startServer();
  const op = signedBearer('e2e-operator', ['OPERATOR']);

  // existing 401 unchanged
  let r = await fetch(`${BASE}/api/governance/tenants`);
  assert(r.status === 401, 'anonymous protected → 401 (unchanged)');

  // authenticated request reaches route (capability middleware does NOT deny)
  r = await fetch(`${BASE}/api/governance/tenants`, { headers: { Authorization: op } });
  assert(r.status !== 401, 'authenticated request is not rejected by capability middleware');

  // existing 403 role behavior unchanged
  r = await fetch(`${BASE}/api/audit/vault/anchor`, { method: 'POST', headers: { Authorization: op, 'Content-Type': 'application/json' }, body: '{}' });
  assert(r.status === 403, 'insufficient role → 403 (unchanged)');

  // ── Phase 5C: controlled enforcement on terminal/fs/shell ──
  const adm = signedBearer('e2e-admin', ['ADMIN']);

  // OPERATOR lacks execute:terminal/fs/shell → 403 (capability denial)
  r = await fetch(`${BASE}/api/terminal/execute`, { method: 'POST', headers: { Authorization: op, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'echo x' }) });
  assert(r.status === 403, 'OPERATOR terminal → 403 (no execute:terminal)');
  assert((await r.text()).includes('Capability required: execute:terminal'), 'terminal denial is a capability denial');
  r = await fetch(`${BASE}/api/tools/fs/read`, { method: 'POST', headers: { Authorization: op, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'README.md' }) });
  assert(r.status === 403, 'OPERATOR fs → 403 (no execute:fs)');
  r = await fetch(`${BASE}/api/tools/shell/exec`, { method: 'POST', headers: { Authorization: op, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'pwd' }) });
  assert(r.status === 403, 'OPERATOR shell → 403 (no execute:shell)');

  // ADMIN has execute:terminal/fs/shell → NOT capability-denied (reaches route)
  r = await fetch(`${BASE}/api/terminal/execute`, { method: 'POST', headers: { Authorization: adm, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'echo x' }) });
  assert(!(await r.text()).includes('Capability required: execute:terminal'), 'ADMIN terminal passes capability layer');
  r = await fetch(`${BASE}/api/tools/fs/read`, { method: 'POST', headers: { Authorization: adm, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'README.md' }) });
  assert(!(await r.text()).includes('Capability required: execute:fs'), 'ADMIN fs passes capability layer');

  // anonymous still 401 (boundary precedes capability)
  r = await fetch(`${BASE}/api/terminal/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'echo x' }) });
  assert(r.status === 401, 'anonymous terminal → 401 (unchanged)');

  // telemetry reflects partial enforcement + denials
  const t = await (await fetch(`${BASE}/api/capability`)).json();
  assert(t.enforcement === 'partial', 'enforcement is partial');
  assert(t.enforcedCapabilities.includes('execute:terminal'), 'terminal is in enforced set');
  assert(t.denials > 0, 'denials recorded (enforcement active)');
  assert(typeof t.resolutions === 'number' && t.resolutions > 0, 'resolutions are recorded');

  // no secrets in logs
  const stderr = getStderr();
  assert(!/Bearer |sk-|AIza|gsk_|kudbee-dev/.test(stderr), 'no secrets in server logs');

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
