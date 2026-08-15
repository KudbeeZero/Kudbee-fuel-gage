#!/usr/bin/env node
/**
 * scripts/verify-dispatch-capability.mjs — Phase 5O execute:dispatch enforcement.
 *
 * Proves POST /api/governance/dispatch is protected and preserves crucible
 * behavior:
 *   - anonymous → 401
 *   - authenticated without execute:dispatch → 403
 *   - authorized (OPERATOR → execute:dispatch) → 200
 *   - CRUCIBLE_ENABLED=false → existing no-op behavior preserved
 *   - execute:dispatch does NOT imply terminal/fs/shell/admin:governance
 *
 * Run: node scripts/verify-dispatch-capability.mjs
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
const PORT = 9896;
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
  for (const id of ['kudbee-dispatch-verify', 'kudbee-auditor']) {
    const identity = genIdentity(id);
    ensureInRegistry(identity);
    passes[id] = createPass(identity);
  }
  const memberships = { 'kudbee-dispatch-verify': { tenantId: 'tenant-prod', role: 'OPERATOR' }, 'kudbee-auditor': { tenantId: 'tenant-prod', role: 'AUDITOR' } };
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', AGENT_REGISTRY_PATH: REGISTRY_FILE, DATABASE_URL: '', KUDBEE_TENANT_MEMBERSHIPS: JSON.stringify(memberships), CRUCIBLE_ENABLED: 'false' },
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
async function dispatch(agentId) {
  return fetch(`${BASE}/api/governance/dispatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes[agentId] },
    body: JSON.stringify({ task: 'manual-dispatch' }),
  });
}

async function main() {
  console.log('═══ PHASE 5O — execute:dispatch ENFORCEMENT ═══');

  // ── UNIT: privilege isolation ──
  const d = resolveCapabilities({ agentId: 'kudbee-dispatch-verify', roles: [] });
  assert(d.capabilities.includes('execute:dispatch'), 'kudbee-dispatch-verify has execute:dispatch (explicit grant)');
  assert(!d.capabilities.includes('admin:governance'), 'execute:dispatch does NOT imply admin:governance');
  assert(!d.capabilities.includes('execute:terminal') && !d.capabilities.includes('execute:fs') && !d.capabilities.includes('execute:shell'), 'execute:dispatch does NOT imply terminal/fs/shell');
  const au = resolveCapabilities({ agentId: 'kudbee-auditor', roles: ['AUDITOR'] });
  assert(!au.capabilities.includes('execute:dispatch'), 'AUDITOR does NOT have execute:dispatch');
  const op = resolveCapabilities({ agentId: 'x', roles: ['OPERATOR'] });
  assert(op.capabilities.includes('execute:dispatch'), 'OPERATOR role has execute:dispatch (RBAC-declared operator dispatch)');

  await startServer();

  await runCheck('anonymous dispatch → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'x' }) });
    return r.status === 401;
  });
  await runCheck('authenticated without execute:dispatch → 403', async () => {
    const r = await dispatch('kudbee-auditor');
    return r.status === 403;
  });
  await runCheck('authorized dispatch (CRUCIBLE disabled) → 200 no-op preserved', async () => {
    const r = await dispatch('kudbee-dispatch-verify');
    const data = await r.json();
    return r.status === 200 && data.success === false && data.message === 'Crucible not enabled';
  });

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
