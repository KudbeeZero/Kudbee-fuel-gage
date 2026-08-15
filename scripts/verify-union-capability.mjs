#!/usr/bin/env node
/**
 * scripts/verify-union-capability.mjs — Phase 5O execute:union enforcement.
 *
 * Proves POST /api/governance/union/form and /union/negotiate are protected:
 *   - anonymous → 401
 *   - authenticated without execute:union → 403
 *   - authorized (execute:union) → success
 *   - execute:union does NOT imply mint:think-token / admin:governance / etc.
 *
 * Runs against the in-memory fallback (no DATABASE_URL) so it is hermetic.
 * Run: node scripts/verify-union-capability.mjs
 */
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { resolveCapabilities } from '../services/lib/capabilityRegistry.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = path.join(__dirname, '..', 'services', 'ingestion');
const REGISTRY_FILE = path.resolve(__dirname, '..', 'config', 'agents.json');
const PORT = 9894;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess = null;
let passed = 0;
let failed = 0;
const passes = {};

function assert(check, label) {
  if (check) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.error(`  [FAIL] ${label}`); failed++; }
}
function genIdentity(agentId) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { agentId, publicKey, privateKey };
}
function ensureInRegistry(identity) {
  let reg = { registry: [] };
  try { reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); } catch {}
  const i = reg.registry.findIndex((a) => a.agentId === identity.agentId);
  const e = { agentId: identity.agentId, publicKey: identity.publicKey, status: 'active', createdAt: new Date().toISOString() };
  if (i >= 0) reg.registry[i] = e; else reg.registry.push(e);
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
}
function createPass(identity) {
  const issuedAt = Date.now();
  const signature = crypto.sign(null, Buffer.from(`${identity.agentId}:${issuedAt}`), identity.privateKey).toString('base64');
  return Buffer.from(JSON.stringify({ agentId: identity.agentId, issuedAt, signature })).toString('base64');
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
  for (const id of ['kudbee-union-verify', 'ci-watcher']) {
    const identity = genIdentity(id);
    ensureInRegistry(identity);
    passes[id] = createPass(identity);
  }
  const memberships = { 'kudbee-union-verify': { tenantId: 'tenant-prod', role: 'ADMIN' }, 'ci-watcher': { tenantId: 'tenant-prod', role: 'OPERATOR' } };
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', AGENT_REGISTRY_PATH: REGISTRY_FILE, DATABASE_URL: '', KUDBEE_TENANT_MEMBERSHIPS: JSON.stringify(memberships) },
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
async function form(agentId) {
  return fetch(`${BASE}/api/governance/union/form`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes[agentId] },
    body: JSON.stringify({ agentIds: ['a', 'b'] }),
  });
}

async function main() {
  console.log('═══ PHASE 5O — execute:union ENFORCEMENT ═══');

  // ── UNIT: privilege isolation ──
  const u = resolveCapabilities({ agentId: 'kudbee-union-verify', roles: [] });
  assert(u.capabilities.includes('execute:union'), 'kudbee-union-verify has execute:union');
  assert(!u.capabilities.includes('mint:think-token'), 'execute:union does NOT imply mint:think-token');
  assert(!u.capabilities.includes('admin:governance'), 'execute:union does NOT imply admin:governance');
  assert(!u.capabilities.includes('execute:dispatch'), 'execute:union does NOT imply execute:dispatch');
  const op = resolveCapabilities({ agentId: 'x', roles: ['OPERATOR'] });
  assert(!op.capabilities.includes('execute:union'), 'OPERATOR role does NOT imply execute:union (default-deny)');

  await startServer();

  await runCheck('anonymous union/form → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/union/form`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentIds: ['a'] }) });
    return r.status === 401;
  });
  await runCheck('authenticated without execute:union → 403', async () => {
    const r = await form('ci-watcher');
    return r.status === 403;
  });
  await runCheck('authorized execute:union → 201', async () => {
    const r = await form('kudbee-union-verify');
    return r.status === 201;
  });
  await runCheck('authorized union/negotiate → 200', async () => {
    const r = await fetch(`${BASE}/api/governance/union/negotiate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes['kudbee-union-verify'] }, body: JSON.stringify({ unionId: 'union-1', requestedTokens: 100 }) });
    return r.status === 200;
  });

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
