/**
 * scripts/boot-verify.mjs
 * ---------------------------------------------------------------------------
 * Phase 40 — Self-Boot Kernel Rollover.
 *
 * Cold-starts the ingestion server, runs the full health matrix, and exits
 * with code 0 only when Postgres, Redis, the worker loop, and the receptor
 * lock registry are confirmed healthy. Designed as a Heroku release-phase
 * command (Procfile: `release: node scripts/boot-verify.mjs`) so every
 * deploy self-verifies before receiving traffic.
 *
 * Fails fast: exits with code 1 and a diagnostic message on any failure.
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const INGESTION_DIR = new URL('../services/ingestion', import.meta.url).pathname;
const PORT = 9900;
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 60_000;
const HEALTH_CHECK_MS = 20_000;

async function bootVerify() {
  console.log('[BootVerify] Cold-starting ingestion server on port', PORT, '…');
  const tsxPath = require.resolve('tsx/cli');
  const proc = spawn(process.execPath, [tsxPath, 'server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'pipe',
    killSignal: 'SIGTERM'
  });

  const stdout: string[] = [];
  proc.stdout.on('data', (d) => stdout.push(d.toString()));
  proc.stderr.on('data', (d) => { /* suppress */ });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  // Wait for server to become ready
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) { ready = true; break; }
    } catch {}
    await delay(500);
  }

  if (!ready) {
    console.error('[BootVerify] FAILED: server did not become ready within', BOOT_TIMEOUT_MS, 'ms');
    proc.kill('SIGTERM');
    process.exit(1);
  }

  console.log('[BootVerify] Server ready. Running health matrix…');

  // Run lifecycle probe
  const healthDeadline = Date.now() + HEALTH_CHECK_MS;
  let healthy = false;
  let report: Record<string, unknown> = {};
  while (Date.now() < healthDeadline) {
    try {
      const res = await fetch(`${BASE}/api/system/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' })
      });
      report = await res.json() as Record<string, unknown>;
      if (report.status === 'HEALTHY') { healthy = true; break; }
    } catch {}
    await delay(1000);
  }

  proc.kill('SIGTERM');

  if (healthy) {
    console.log('[BootVerify] SYSTEM READY — all services healthy.');
    console.log('[BootVerify] Report:', JSON.stringify(report, null, 2));
    process.exit(0);
  } else {
    console.error('[BootVerify] FAILED: services not healthy after', HEALTH_CHECK_MS, 'ms');
    console.error('[BootVerify] Last report:', JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

bootVerify().catch((err) => {
  console.error('[BootVerify] FATAL:', err.message);
  process.exit(1);
});
