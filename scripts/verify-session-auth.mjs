#!/usr/bin/env node
/**
 * scripts/verify-session-auth.mjs — Phase 5Q SPA session authentication.
 *
 * Proves the canonical HttpOnly session cookie flow:
 *   - anonymous /api/session → authenticated:false
 *   - anonymous dispatch → 401
 *   - wrong login → 401
 *   - correct login → session cookie issued (no raw token in body)
 *   - /api/session with cookie → authenticated OPERATOR with execute:dispatch
 *   - dispatch with cookie but no CSRF → 403
 *   - dispatch with cookie + CSRF → 200 (CRUCIBLE disabled)
 *   - logout → session cleared
 *   - dispatch after logout → 401
 *
 * Run: node scripts/verify-session-auth.mjs
 */
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = path.join(__dirname, '..', 'services', 'ingestion');
const PORT = 9901;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASS = 'test-admin-pass-5q';
let serverProcess = null;
let passed = 0;
let failed = 0;
let cookie = '';

function assert(check, label) {
  if (check) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.error(`  [FAIL] ${label}`); failed++; }
}
function extractSetCookie(res) {
  // Build a proper Cookie header from the Set-Cookie response headers.
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setCookies.length === 0) {
    const sc = res.headers.get('set-cookie');
    if (!sc) return '';
    return sc.split(',').map((c) => c.split(';')[0].trim()).join('; ');
  }
  return setCookies.map((c) => c.split(';')[0].trim()).join('; ');
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
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env, PORT: String(PORT), NODE_ENV: 'test', DATABASE_URL: '',
      ADMIN_PASS, CRUCIBLE_ENABLED: 'false',
      KUDBEE_TENANT_MEMBERSHIPS: JSON.stringify({ 'dashboard-operator': { tenantId: 'tenant-prod', role: 'OPERATOR' } }),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await waitForServer(`${BASE}/health`, 15000);
}
async function stopServer() {
  if (serverProcess) { serverProcess.kill('SIGTERM'); await delay(500); if (serverProcess.killed === false) serverProcess.kill('SIGKILL'); }
}
async function runCheck(name, fn) {
  try { const ok = await fn(); assert(ok, name); } catch (e) { assert(false, `${name} threw: ${e.message}`); }
}
function csrfFromCookie() {
  const m = cookie.match(/kudbee_csrf=([^;]+)/);
  return m ? m[1] : '';
}

async function main() {
  console.log('═══ PHASE 5Q — SPA SESSION AUTHENTICATION ═══');
  await startServer();

  await runCheck('anonymous /api/session → authenticated:false', async () => {
    const r = await fetch(`${BASE}/api/session`);
    const d = await r.json();
    return d.authenticated === false;
  });
  await runCheck('anonymous dispatch → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'x' }) });
    return r.status === 401;
  });
  await runCheck('wrong login → 401', async () => {
    const r = await fetch(`${BASE}/api/admin/verify-pass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passkey: 'wrong' }) });
    return r.status === 401;
  });

  // Correct login — capture the session cookie.
  const loginRes = await fetch(`${BASE}/api/admin/verify-pass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passkey: ADMIN_PASS }) });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200 && loginData.authenticated === true, 'correct login → authenticated:true');
  assert(!('session' in loginData) || !loginData.session, 'raw session token NOT returned in body');
  const rawSetCookie = loginRes.headers.get('set-cookie') || '';
  assert(rawSetCookie.includes('kudbee_session=') && rawSetCookie.includes('HttpOnly'), 'HttpOnly session cookie issued');
  cookie = extractSetCookie(loginRes);

  await runCheck('/api/session with cookie → authenticated OPERATOR + execute:dispatch', async () => {
    const r = await fetch(`${BASE}/api/session`, { headers: { Cookie: cookie } });
    const d = await r.json();
    return d.authenticated === true && d.role === 'OPERATOR' && (d.capabilities || []).includes('execute:dispatch');
  });

  await runCheck('dispatch with cookie but no CSRF → 403', async () => {
    const r = await fetch(`${BASE}/api/governance/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ task: 'manual-dispatch' }) });
    return r.status === 403;
  });

  await runCheck('dispatch with cookie + CSRF → 200 (CRUCIBLE disabled)', async () => {
    const csrf = csrfFromCookie();
    const r = await fetch(`${BASE}/api/governance/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: JSON.stringify({ task: 'manual-dispatch' }) });
    const d = await r.json();
    return r.status === 200 && d.message === 'Crucible not enabled';
  });

  // Logout (state-changing POST — requires CSRF).
  const logoutRes = await fetch(`${BASE}/api/logout`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrfFromCookie() } });
  assert(logoutRes.status === 200, 'logout → 200');
  cookie = extractSetCookie(logoutRes);

  await runCheck('dispatch after logout → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ task: 'x' }) });
    return r.status === 401;
  });

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
