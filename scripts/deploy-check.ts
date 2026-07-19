import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  createAgentPass,
  serializePass
} from '@kudbee/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INGESTION_DIR = path.join(ROOT, 'services', 'ingestion');
const PRIVATE_KEY_PATH = path.join(ROOT, '.agent_private_key.pem');
const PORT = 5055;

interface CheckMetrics {
  serverBootedMs: number;
  authenticatedStatus: number;
  bypassLogged: boolean;
  firewallRejectedStatus: number;
  passValid: boolean;
}

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status < 500) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('Server did not boot in time'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(`Missing agent private key at ${PRIVATE_KEY_PATH}. Run the identity bootstrap first.`);
  }
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const agentId = 'kudbee-agent-01';

  const server = spawn('node', ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });

  const metrics: CheckMetrics = {
    serverBootedMs: 0,
    authenticatedStatus: 0,
    bypassLogged: false,
    firewallRejectedStatus: 0,
    passValid: false
  };

  try {
    const bootStart = Date.now();
    await waitForServer(`http://localhost:${PORT}/api/telemetry/logs`, 15000);
    metrics.serverBootedMs = Date.now() - bootStart;

    const pass = createAgentPass(privateKey, agentId);
    metrics.passValid = !!pass.signature;
    const header = serializePass(pass);

    const authRes = await fetch(`http://localhost:${PORT}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': header },
      body: JSON.stringify({
        trace_id: 'agent-fastpath-verify',
        model: 'gpt-4o',
        tokens_in: 42,
        tokens_out: 7,
        cost: 0.005,
        status: 'agent_computed'
      })
    });
    metrics.authenticatedStatus = authRes.status;
    const authBody = await authRes.json();
    metrics.bypassLogged = authRes.status === 201 && authBody.bypass === true;

    const rejectRes = await fetch(`http://localhost:${PORT}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trace_id: 12345 })
    });
    metrics.firewallRejectedStatus = rejectRes.status;

    const passed =
      metrics.serverBootedMs > 0 &&
      metrics.passValid &&
      metrics.authenticatedStatus === 201 &&
      metrics.bypassLogged &&
      metrics.firewallRejectedStatus === 422;

    console.log('\n=== Phase 3 Deployment Verification Metrics ===');
    console.log(JSON.stringify(metrics, null, 2));
    console.log(passed ? '\nRESULT: PASS — authenticated fast-path bypass verified.' : '\nRESULT: FAIL — see metrics above.');

    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('deploy-check failed:', err);
  process.exit(1);
});
