#!/usr/bin/env node
/**
 * scripts/verify-think-telemetry-lifecycle.mjs — Phase 5L edge-ingest
 * authorization + Phase 5M lifecycle.
 *
 * Proves POST /api/telemetry/edge-ingest is hardened:
 *   - anonymous → 401
 *   - authenticated without ingest:telemetry → 403
 *   - authenticated Edge Sentinel (ingest:telemetry) → 202
 *   - authorized ingest can NOT manufacture VERIFIED (PENDING_APPROVAL only)
 *
 * Uses agent identity + capability (no static EDGE_AGENT_PASS). Runs against
 * the in-memory fallback (no DATABASE_URL) so it is hermetic.
 *
 * Run: node scripts/verify-think-telemetry-lifecycle.mjs
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
const PORT = 9891;
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
  for (const id of ['sentinel', 'ci-watcher']) {
    const identity = genIdentity(id);
    ensureInRegistry(identity);
    passes[id] = createPass(identity);
  }
  const memberships = { sentinel: { tenantId: 'tenant-prod', role: 'ADMIN' }, 'ci-watcher': { tenantId: 'tenant-prod', role: 'ADMIN' } };
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: {
      ...process.env, PORT: String(PORT), NODE_ENV: 'test', AGENT_REGISTRY_PATH: REGISTRY_FILE,
      DATABASE_URL: '', KUDBEE_TENANT_MEMBERSHIPS: JSON.stringify(memberships),
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
async function ingest(agentId, payload) {
  return fetch(`${BASE}/api/telemetry/edge-ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': passes[agentId] },
    body: JSON.stringify(payload),
  });
}
async function edgeSentinelStatuses() {
  const res = await fetch(`${BASE}/api/think/trajectories?limit=50`, {
    headers: { 'X-Agent-Pass': passes['sentinel'] },
  });
  const data = await res.json();
  return (data.trajectories || [])
    .filter((t) => (t.task_context || {}).source === 'edge-sentinel')
    .map((t) => t.status);
}

async function main() {
  console.log('═══ PHASE 5L — EDGE-INGEST AUTH + LIFECYCLE ═══');

  // ── UNIT: privilege isolation (ingest:telemetry ≠ other capabilities) ──
  const sent = resolveCapabilities({ agentId: 'sentinel', roles: [] });
  assert(sent.capabilities.includes('ingest:telemetry'), 'sentinel has ingest:telemetry (explicit grant)');
  assert(!sent.capabilities.includes('mint:think-token'), 'ingest:telemetry does NOT imply mint:think-token');
  assert(!sent.capabilities.includes('admin:governance'), 'ingest:telemetry does NOT imply admin:governance');
  assert(!sent.capabilities.includes('execute:terminal'), 'ingest:telemetry does NOT imply execute:terminal');
  assert(!sent.capabilities.includes('execute:fs'), 'ingest:telemetry does NOT imply execute:fs');
  assert(!sent.capabilities.includes('execute:shell'), 'ingest:telemetry does NOT imply execute:shell');
  const op = resolveCapabilities({ agentId: 'some-operator', roles: ['OPERATOR'] });
  assert(!op.capabilities.includes('ingest:telemetry'), 'OPERATOR role does NOT imply ingest:telemetry');

  await startServer();

  // ── AUTH MATRIX ──
  await runCheck('anonymous edge-ingest → 401', async () => {
    const r = await fetch(`${BASE}/api/telemetry/edge-ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return r.status === 401;
  });

  await runCheck('authenticated without ingest:telemetry → 403', async () => {
    const r = await ingest('ci-watcher', {});
    return r.status === 403;
  });

  await runCheck('invalid/forged credential → 401', async () => {
    const r = await fetch(`${BASE}/api/telemetry/edge-ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': 'forged' }, body: '{}' });
    return r.status === 401;
  });

  // ── AUTHORIZED INGEST + LIFECYCLE ──
  const okRes = await ingest('sentinel', { trace_id: `edge-5l-ok-${Date.now()}`, cost: 0, latency_ms: 100, status: 'OK', model: 'test' });
  assert(okRes.status === 202, 'authorized Edge Sentinel ingest → 202');

  const riskyRes = await ingest('sentinel', { trace_id: `edge-5l-risky-${Date.now()}`, cost: 5, latency_ms: 5000, status: 'FAILED', model: 'test' });
  assert(riskyRes.status === 202, 'authorized risky ingest → 202');

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
