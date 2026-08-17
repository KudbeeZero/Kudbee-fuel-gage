#!/usr/bin/env node
/**
 * scripts/verify-think-lifecycle.mjs — Phase 5I THINK-token lifecycle integrity.
 *
 * Proves the mint boundary cannot manufacture VERIFIED/RECYCLED state:
 *   - anonymous (no X-Agent-Pass) → 401
 *   - mint with caller-supplied VERIFIED → 400 (rejected)
 *   - mint with caller-supplied RECYCLED → 400 (rejected)
 *   - normal mint → 201 (PENDING_APPROVAL)
 *
 * Run: node scripts/verify-think-lifecycle.mjs
 */
import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = path.join(__dirname, '..', 'services', 'ingestion');
const REGISTRY_FILE = path.resolve(__dirname, '..', 'config', 'agents.json');
const PORT = 9879;
const BASE = `http://127.0.0.1:${PORT}`;
const AGENT_ID = 'kudbee-thinkloop-verify';
let serverProcess = null;
let agentPassHeader = '';
let passed = 0;
let failed = 0;

function assert(check, label) {
  if (check) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.error(`  [FAIL] ${label}`); failed++; }
}
function generateAgentIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { agentId: AGENT_ID, publicKey, privateKey };
}
function ensureAgentInRegistry(publicKey) {
  let registry = { registry: [] };
  try { registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); } catch {}
  const i = registry.registry.findIndex((a) => a.agentId === AGENT_ID);
  const entry = { agentId: AGENT_ID, publicKey, status: 'active', createdAt: new Date().toISOString() };
  if (i >= 0) registry.registry[i] = entry;
  else registry.registry.push(entry);
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}
function createAgentPass(privateKey) {
  const issuedAt = Date.now();
  const signature = crypto.sign(null, Buffer.from(`${AGENT_ID}:${issuedAt}`), privateKey).toString('base64');
  return Buffer.from(JSON.stringify({ agentId: AGENT_ID, issuedAt, signature })).toString('base64');
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
  const identity = generateAgentIdentity();
  ensureAgentInRegistry(identity.publicKey);
  agentPassHeader = createAgentPass(identity.privateKey);
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env, PORT: String(PORT), NODE_ENV: 'test', AGENT_REGISTRY_PATH: REGISTRY_FILE,
      KUDBEE_TENANT_MEMBERSHIPS: JSON.stringify({ [AGENT_ID]: { tenantId: 'tenant-prod', role: 'ADMIN' } }),
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
function mintBody(overrides = {}) {
  return JSON.stringify({
    traceId: `tr-lifecycle-${Date.now()}`,
    taskContext: { task: 'lifecycle-test' },
    failedState: { status: 'TEST' },
    correctionDelta: 'lifecycle integrity test delta',
    ...overrides,
  });
}
async function mint(status) {
  const body = status ? mintBody({ status }) : mintBody();
  return fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': agentPassHeader },
    body,
  });
}

async function main() {
  console.log('═══ PHASE 5I — THINK TOKEN LIFECYCLE INTEGRITY ═══');
  await startServer();

  await runCheck('anonymous mint → 401', async () => {
    const r = await fetch(`${BASE}/api/governance/mint-think-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: mintBody() });
    return r.status === 401;
  });

  await runCheck('normal mint → 201 (PENDING_APPROVAL)', async () => {
    const r = await mint();
    return r.status === 201;
  });

  await runCheck('mint status=VERIFIED → 400 (rejected)', async () => {
    const r = await mint('VERIFIED');
    return r.status === 400;
  });

  await runCheck('mint status=RECYCLED → 400 (rejected)', async () => {
    const r = await mint('RECYCLED');
    return r.status === 400;
  });

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
