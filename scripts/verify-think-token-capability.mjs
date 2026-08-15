#!/usr/bin/env node
/**
 * scripts/verify-think-token-capability.mjs — Phase 5J mint:think-token enforcement.
 *
 * Proves:
 *   - execute:governance does NOT imply mint:think-token
 *   - admin:governance does NOT imply mint:think-token
 *   - gastown is explicitly granted mint:think-token
 *   - anonymous mint → 401
 *   - authenticated without capability → 403
 *   - authenticated with capability → allowed (PENDING_APPROVAL)
 *   - lifecycle intact: VERIFIED/RECYCLED injection still → 400
 *
 * Run: node scripts/verify-think-token-capability.mjs
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
const PORT = 9882;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess = null;
let passed = 0;
let failed = 0;
const passes = {}; // agentId -> X-Agent-Pass

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
  for (const id of ['gastown', 'ci-watcher', 'kudbee-root-minter']) {
    const identity = genIdentity(id);
    ensureInRegistry(identity);
    passes[id] = createPass(identity);
  }
  const memberships = { gastown: { tenantId: 'tenant-prod', role: 'ADMIN' }, 'ci-watcher': { tenantId: 'tenant-prod', role: 'ADMIN' }, 'kudbee-root-minter': { tenantId: 'tenant-prod', role: 'ADMIN' } };
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', AGENT_REGISTRY_PATH: REGISTRY_FILE, KUDBEE_TENANT_MEMBERSHIPS: JSON.stringify(memberships) },
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
function mintBody(overrides = {}) {
  return JSON.stringify({ traceId: `tr-cap-${Date.now()}`, taskContext: {}, failedState: {}, correctionDelta: 'cap test', ...overrides });
}
async function mint(agentId, status) {
  const body = status ? mintBody({ status }) : mintBody();
  return fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes[agentId] },
    body,
  });
}

async function main() {
  console.log('═══ PHASE 5J — mint:think-token CAPABILITY ENFORCEMENT ═══');

  // ── Unit: capability separation ──
  const op = resolveCapabilities({ agentId: 'gastown', roles: ['OPERATOR'] });
  assert(op.capabilities.includes('execute:governance'), 'OPERATOR has execute:governance');
  assert(op.capabilities.includes('mint:think-token'), 'gastown has mint:think-token (explicit grant)');
  const opNoGrant = resolveCapabilities({ agentId: 'some-operator', roles: ['OPERATOR'] });
  assert(opNoGrant.capabilities.includes('execute:governance') && !opNoGrant.capabilities.includes('mint:think-token'), 'execute:governance does NOT imply mint:think-token');
  const adm = resolveCapabilities({ agentId: 'admin', roles: ['ADMIN'] });
  assert(adm.capabilities.includes('admin:governance') && !adm.capabilities.includes('mint:think-token'), 'admin:governance does NOT imply mint:think-token');

  // ── Integration ──
  await startServer();

  await runCheck('anonymous mint → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/mint-think-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: mintBody() });
    return r.status === 401;
  });

  await runCheck('ci-watcher (no mint capability) → 403', async () => {
    const r = await mint('ci-watcher');
    return r.status === 403;
  });

  await runCheck('gastown (mint:think-token) → allowed (201)', async () => {
    const r = await mint('gastown');
    return r.status === 201;
  });

  await runCheck('gastown mint status=PENDING_APPROVAL → 201', async () => {
    const r = await mint('gastown', 'PENDING_APPROVAL');
    return r.status === 201;
  });

  await runCheck('gastown mint status=VERIFIED → 400 (lifecycle intact)', async () => {
    const r = await mint('gastown', 'VERIFIED');
    return r.status === 400;
  });

  await runCheck('gastown mint status=RECYCLED → 400 (lifecycle intact)', async () => {
    const r = await mint('gastown', 'RECYCLED');
    return r.status === 400;
  });

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
