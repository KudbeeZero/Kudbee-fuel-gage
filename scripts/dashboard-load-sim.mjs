import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const LOG = path.join(LOG_DIR, 'deployment-debug.log');
const PORT = 5057;
const BASE = `http://localhost:${PORT}`;
const ts = new Date().toISOString();

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(line) {
  const entry = `[${ts}] ${line}\n`;
  fs.appendFileSync(LOG, entry);
  console.log(line);
}

const required = [
  { name: 'System Health', path: '/health' },
  { name: 'Telemetry Feed (interceptor triage)', path: '/api/interceptor/triage' },
  { name: 'Memory Insights (memory recall)', path: '/api/memory/recall?query=control%20tower%20telemetry%20health' },
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
  for (let i = 0; i < 3; i++) {
    await fetch(`${BASE}/api/memory/recall?query=pulse`);
  }
  log('SIM: Memory Insights "Pulse" poll x3 completed (no page refresh).');
} catch (e) {
  failures++;
  log(`FATAL: ${e.message}`);
} finally {
  server.kill();
  log(failures === 0 ? 'RESULT: PASS — Dashboard can fetch all backend data.' : `RESULT: FAIL — ${failures} endpoint(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}
