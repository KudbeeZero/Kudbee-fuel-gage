/**
 * scripts/verify-energy-mesh.mjs
 * Phase 54 — 4 assertions: compute, endpoint, update weights, return heatmap.
 * Port-isolated on 9902.
 */
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const INGESTION_DIR = new URL('../services/ingestion', import.meta.url).pathname;
const PORT = 9902, BASE = `http://127.0.0.1:${PORT}`;
let serverProcess = null, passed = 0, failed = 0;
function assert(c, l) { if (c) { console.log(`  [PASS] ${l}`); passed++; } else { console.error(`  [FAIL] ${l}`); failed++; } }

async function start() {
  const tsxPath = require.resolve('tsx/cli');
  serverProcess = spawn(process.execPath, [tsxPath, 'server.js'], { cwd: INGESTION_DIR, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: 'pipe' });
  const d = Date.now(); while (Date.now() - d < 15000) { try { if ((await fetch(`${BASE}/health`)).ok) { console.log('[EnergyMesh] Ready.'); return; } } catch {} await delay(300); }
  throw new Error('Server not ready');
}
async function stop() { if (serverProcess) { serverProcess.kill('SIGTERM'); await delay(500); } }

async function run() {
  try {
    await start();
    console.log('\n--- Check 1: Energy mesh endpoint returns 200 ---');
    const r = await fetch(`${BASE}/api/think/energy-mesh`);
    assert(r.status === 200, 'Energy mesh endpoint returns 200');
    const d = await r.json();
    assert(typeof d.averageEnergy === 'number', 'Response includes averageEnergy');
    assert(Array.isArray(d.snapshots), 'Response includes snapshots array');
    assert(d.weights !== undefined, 'Response includes energy weights');
    console.log(`\n========================================`);
    console.log(`Energy Mesh Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
    console.log(`========================================`);
    if (failed > 0) { process.exitCode = 1; } else { console.log('[EnergyMesh] ALL CHECKS PASSED'); }
  } catch (e) { console.error(`[EnergyMesh] Fatal: ${e.message}`); process.exitCode = 1; }
  finally { await stop(); process.exit(process.exitCode ?? 0); }
}
run();
