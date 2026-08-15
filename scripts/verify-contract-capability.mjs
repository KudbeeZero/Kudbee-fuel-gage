#!/usr/bin/env node
/**
 * scripts/verify-contract-capability.mjs — Phase 5O execute:contract /
 * read:contract enforcement + identity integrity.
 *
 * Proves POST /api/governance/contract/sign and /contract/verify/:id are
 * protected, and that contract/sign binds agentId to the authenticated
 * principal (impersonation blocked):
 *   - anonymous → 401
 *   - authenticated without capability → 403
 *   - authorized → success
 *   - conflicting request-body agentId → 403
 *   - omitted request-body agentId → resolves to authenticated principal
 *   - execute:contract / read:contract do NOT imply mint / admin / dispatch
 *
 * Run: node scripts/verify-contract-capability.mjs
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
const PORT = 9895;
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
  for (const id of ['kudbee-contract-verify', 'ci-watcher']) {
    const identity = genIdentity(id);
    ensureInRegistry(identity);
    passes[id] = createPass(identity);
  }
  const memberships = { 'kudbee-contract-verify': { tenantId: 'tenant-prod', role: 'ADMIN' }, 'ci-watcher': { tenantId: 'tenant-prod', role: 'OPERATOR' } };
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
function contractBody(overrides = {}) {
  return {
    maxTokensPerWindow: 1000, maxMemoryBytes: 1000000, maxLatencyMs: 5000,
    minSimilarityScore: 0.7, minConfidenceScore: 0.7, maxEnergyScore: 0.9,
    leasePeriodMs: 60000, penaltyCoefficient: 0.1, ...overrides,
  };
}
async function sign(agentId, body) {
  return fetch(`${BASE}/api/governance/contract/sign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes[agentId] },
    body: JSON.stringify(body),
  });
}

async function main() {
  console.log('═══ PHASE 5O — execute:contract / read:contract + IDENTITY ═══');

  // ── UNIT: privilege isolation ──
  const c = resolveCapabilities({ agentId: 'kudbee-contract-verify', roles: [] });
  assert(c.capabilities.includes('execute:contract') && c.capabilities.includes('read:contract'), 'kudbee-contract-verify has execute:contract + read:contract');
  assert(!c.capabilities.includes('mint:think-token'), 'execute:contract does NOT imply mint:think-token');
  assert(!c.capabilities.includes('admin:governance'), 'execute:contract does NOT imply admin:governance');
  assert(!c.capabilities.includes('execute:dispatch'), 'execute:contract does NOT imply execute:dispatch');

  await startServer();

  await runCheck('anonymous contract/sign → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/contract/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractBody()) });
    return r.status === 401;
  });
  await runCheck('authenticated without execute:contract → 403', async () => {
    const r = await sign('ci-watcher', contractBody());
    return r.status === 403;
  });
  await runCheck('authorized sign (agentId matches principal) → 201', async () => {
    const r = await sign('kudbee-contract-verify', contractBody({ agentId: 'kudbee-contract-verify' }));
    return r.status === 201;
  });
  await runCheck('sign with conflicting body agentId → 403 (impersonation blocked)', async () => {
    const r = await sign('kudbee-contract-verify', contractBody({ agentId: 'kudbee-root-minter' }));
    return r.status === 403;
  });
  await runCheck('sign with omitted agentId → 201 (resolves to principal)', async () => {
    const r = await sign('kudbee-contract-verify', contractBody());
    return r.status === 201;
  });
  await runCheck('contract/verify anonymous → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/contract/verify/agc-test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return r.status === 401;
  });
  await runCheck('contract/verify without read:contract → 403', async () => {
    const r = await fetch(`${BASE}/api/governance/contract/verify/agc-test`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes['ci-watcher'] }, body: '{}' });
    return r.status === 403;
  });
  await runCheck('contract/verify authorized → 200', async () => {
    const r = await fetch(`${BASE}/api/governance/contract/verify/agc-test`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes['kudbee-contract-verify'] }, body: '{}' });
    return r.status === 200;
  });

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
