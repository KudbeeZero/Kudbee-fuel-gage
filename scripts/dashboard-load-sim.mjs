import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const LOG = path.join(LOG_DIR, 'deployment-debug.log');
const PORT = 5058;
const BASE = `http://localhost:${PORT}`;
const ts = new Date().toISOString();

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(line) {
  const entry = `[${ts}] ${line}\n`;
  fs.appendFileSync(LOG, entry);
  console.log(line);
}

// Generate an agent identity (Phase 3 crypto-identity) to perform a signed Verify.
function makeAgentIdentity(agentId) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { agentId, publicKey, privateKey };
}

function signPayload(privateKey, payload) {
  return crypto.sign(null, Buffer.from(payload), privateKey).toString('base64');
}

function serializePass(privateKey, agentId, now = Date.now()) {
  const signature = signPayload(privateKey, `${agentId}:${now}`);
  return Buffer.from(JSON.stringify({ agentId, issuedAt: now, signature })).toString('base64');
}

const required = [
  { name: 'System Health', path: '/health' },
  { name: 'Telemetry Feed (interceptor triage)', path: '/api/interceptor/triage' },
  { name: 'Memory Insights (memory recall)', path: '/api/memory/recall?query=control%20tower%20telemetry%20health' },
  { name: 'Governance Feed', path: '/api/governance/feed' },
  { name: 'Community Value Score', path: '/api/metrics/community-value' },
  { name: 'Dashboard index (static SPA)', path: '/' },
];

const server = spawn('node', ['services/ingestion/server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
  stdio: 'ignore',
});

function waitUp(url, ms) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url);
        if (r.ok || r.status < 500) return resolve();
      } catch {}
      if (Date.now() - start > ms) return reject(new Error('server boot timeout'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

let failures = 0;
try {
  await waitUp(`${BASE}/api/telemetry/logs`, 15000);
  log(`SIM: Dashboard Load simulation started (${BASE})`);

  // Part 3a: static + API endpoint assertions
  for (const r of required) {
    try {
      const res = await fetch(`${BASE}${r.path}`);
      const body = await res.text();
      if (res.status === 404) {
        failures++;
        log(`FAIL: ${r.name} -> 404 NOT FOUND at ${r.path}. SUGGESTED FIX: verify the route is registered in services/ingestion/server.js and that REACT_APP_API_URL / CORS matches the deployed host.`);
      } else if (!res.ok) {
        failures++;
        log(`FAIL: ${r.name} -> HTTP ${res.status} at ${r.path}. Body: ${body.slice(0, 200)}`);
      } else {
        log(`PASS: ${r.name} -> HTTP ${res.status} (${body.length} bytes)`);
      }
    } catch (e) {
      failures++;
      log(`FAIL: ${r.name} -> FETCH ERROR ${e.message} at ${r.path}. SUGGESTED FIX: check CORS headers (Access-Control-Allow-Origin) and that the Heroku backend is reachable at the configured REACT_APP_API_URL.`);
    }
  }

  // Part 3a (Pulse): Memory Insights poll x3 (no page refresh)
  for (let i = 0; i < 3; i++) await fetch(`${BASE}/api/memory/recall?query=pulse`);
  log('SIM: Memory Insights "Pulse" poll x3 completed (no page refresh).');

  // Part 3b: Identity Auth test — Partner Verify with a cryptographic proof.
  try {
    const agent = makeAgentIdentity('partner-sim-01');
    const traceId = `trace-sim-${Date.now()}`;
    const valueScore = 75;
    const canonical = JSON.stringify({ trace_id: traceId, value_score: valueScore });
    const signature = signPayload(agent.privateKey, canonical);
    const agentPass = serializePass(agent.privateKey, agent.agentId);

    const verifyRes = await fetch(`${BASE}/api/interceptor/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trace_id: traceId,
        agent_id: agent.agentId,
        agent_pass: agentPass,
        signature,
        signed_payload: canonical,
        public_key: agent.publicKey,
        value_score: valueScore,
        note: 'Partner Portal simulation verify'
      })
    });
    const verifyBody = await verifyRes.json();
    if (verifyRes.status === 201 && verifyBody.signature && verifyBody.type === 'GOVERNANCE_ACTION') {
      log(`PASS: Identity Auth -> HTTP ${verifyRes.status}, signed proof present (type=${verifyBody.type}, trace=${verifyBody.trace_id}).`);
    } else {
      failures++;
      log(`FAIL: Identity Auth -> HTTP ${verifyRes.status}, missing cryptographic proof. Body: ${JSON.stringify(verifyBody).slice(0, 200)}`);
    }

    // Confirm it landed in the governance feed (type GOVERNANCE_ACTION persisted).
    const feed = await fetch(`${BASE}/api/governance/feed`).then((r) => r.json());
    const persisted = Array.isArray(feed) && feed.some((g) => g.type === 'GOVERNANCE_ACTION' && g.signature === signature);
    if (persisted) {
      log('PASS: Governance ledger persisted GOVERNANCE_ACTION with signature.');
    } else {
      failures++;
      log('FAIL: Governance ledger missing the signed GOVERNANCE_ACTION record.');
    }

    // Negative case: tampered signature must be rejected.
    const badRes = await fetch(`${BASE}/api/interceptor/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trace_id: traceId,
        agent_id: agent.agentId,
        agent_pass: agentPass,
        signature: 'AAAA' + signature.slice(4),
        signed_payload: canonical,
        public_key: agent.publicKey,
        value_score: valueScore
      })
    });
    if (badRes.status === 403) {
      log('PASS: Tampered signature correctly rejected (HTTP 403).');
    } else {
      failures++;
      log(`FAIL: Tampered signature not rejected (HTTP ${badRes.status}).`);
    }
  } catch (e) {
    failures++;
    log(`FAIL: Identity Auth test threw: ${e.message}`);
  }

  // Part 3c: Performance assertion — initial /health render < 200ms.
  try {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      await fetch(`${BASE}/health`);
      samples.push(Date.now() - t0);
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    if (avg < 200) {
      log(`PASS: Initial render/latency avg ${avg.toFixed(1)}ms (< 200ms threshold).`);
    } else {
      failures++;
      log(`FAIL: Initial latency avg ${avg.toFixed(1)}ms exceeds 200ms threshold.`);
    }
  } catch (e) {
    failures++;
    log(`FAIL: Performance assertion threw: ${e.message}`);
  }
} catch (e) {
  failures++;
  log(`FATAL: ${e.message}`);
} finally {
  server.kill();
  log(failures === 0 ? 'RESULT: PASS — Dashboard can fetch all backend data and identity loop is verified.' : `RESULT: FAIL — ${failures} assertion(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}
