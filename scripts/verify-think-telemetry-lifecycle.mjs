#!/usr/bin/env node
/**
 * scripts/verify-think-telemetry-lifecycle.mjs — Phase 5M edge-ingest lifecycle.
 *
 * Proves POST /api/telemetry/edge-ingest can NO LONGER manufacture VERIFIED:
 *   - non-risky payload (previously → VERIFIED) now mints PENDING_APPROVAL
 *   - risky payload (previously → PENDING_APPROVAL) still mints PENDING_APPROVAL
 *
 * Uses a test EDGE_AGENT_PASS credential only. Runs against the in-memory
 * fallback (no DATABASE_URL) so it is hermetic.
 *
 * Run: node scripts/verify-think-telemetry-lifecycle.mjs
 */
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = path.join(__dirname, '..', 'services', 'ingestion');
const REGISTRY_FILE = path.resolve(__dirname, '..', 'config', 'agents.json');
const PORT = 9891;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_AGENT = 'kudbee-telemetry-verify';
const EDGE_PASS = 'test-edge-agent-pass-5m';
let serverProcess = null;
let agentPassHeader = '';
let passed = 0;
let failed = 0;

function assert(check, label) {
  if (check) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.error(`  [FAIL] ${label}`); failed++; }
}
function genIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { agentId: TEST_AGENT, publicKey, privateKey };
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
  const identity = genIdentity();
  ensureInRegistry(identity);
  agentPassHeader = createPass(identity);
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env, PORT: String(PORT), NODE_ENV: 'test', AGENT_REGISTRY_PATH: REGISTRY_FILE,
      EDGE_AGENT_PASS: EDGE_PASS, DATABASE_URL: '',
      KUDBEE_TENANT_MEMBERSHIPS: JSON.stringify({ [TEST_AGENT]: { tenantId: 'tenant-prod', role: 'ADMIN' } }),
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
async function ingest(traceId, payload) {
  return fetch(`${BASE}/api/telemetry/edge-ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': EDGE_PASS },
    body: JSON.stringify({ trace_id: traceId, ...payload }),
  });
}
async function edgeSentinelStatuses() {
  const res = await fetch(`${BASE}/api/think/trajectories?limit=50`, {
    headers: { 'X-Agent-Pass': agentPassHeader },
  });
  const data = await res.json();
  return (data.trajectories || [])
    .filter((t) => (t.task_context || {}).source === 'edge-sentinel')
    .map((t) => t.status);
}

async function main() {
  console.log('═══ PHASE 5M — EDGE-INGEST LIFECYCLE (no VERIFIED mint) ═══');
  await startServer();

  await runCheck('edge-ingest rejects bad EDGE_AGENT_PASS → 401', async () => {
    const r = await fetch(`${BASE}/api/telemetry/edge-ingest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': 'wrong' }, body: '{}',
    });
    return r.status === 401;
  });

  const okRes = await ingest(`edge-5m-ok-${Date.now()}`, { cost: 0, latency_ms: 100, status: 'OK', model: 'test' });
  assert(okRes.status === 202, 'non-risky edge-ingest accepted (202)');

  const riskyRes = await ingest(`edge-5m-risky-${Date.now()}`, { cost: 5, latency_ms: 5000, status: 'FAILED', model: 'test' });
  assert(riskyRes.status === 202, 'risky edge-ingest accepted (202)');

  // Allow the async mint calls to complete.
  await delay(1200);

  await runCheck('all edge-sentinel tokens are PENDING_APPROVAL (never VERIFIED)', async () => {
    const statuses = await edgeSentinelStatuses();
    return statuses.length >= 2 && statuses.every((s) => s === 'PENDING_APPROVAL');
  });

  await stopServer();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
