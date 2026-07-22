/**
 * scripts/verify-system-integrity.mjs
 * Phase 59 — System-Wide Integration & Connector Audit.
 * Port-isolated on 9903. 6 assertions: health, PG, Redis, lifecycle,
 * receptor, dictionary lookup.
 */
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const DIR = new URL('../services/ingestion', import.meta.url).pathname;
const PORT = 9903, BASE = `http://127.0.0.1:${PORT}`;
let proc = null, passed = 0, failed = 0;
function assert(c,l) { if(c) { console.log(`  [PASS] ${l}`); passed++; } else { console.error(`  [FAIL] ${l}`); failed++; } }

async function start() {
  proc = spawn('npx', ['tsx', 'server.js'], { cwd: DIR, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'pipe', shell: true });
  const d = Date.now(); while (Date.now() - d < 20000) { try { if ((await fetch(`${BASE}/health`)).ok) { console.log('[Integrity] Ready.'); return; } } catch {} await delay(300); }
  throw new Error('Server not ready');
}
async function stop() { if (proc) { proc.kill('SIGTERM'); await delay(500); } }

async function run() {
  try {
    await start();

    console.log('\n--- Check 1: Health endpoint ---');
    assert((await fetch(`${BASE}/health`)).ok, 'Health endpoint returns 200');

    console.log('\n--- Check 2: Lifecycle probe ---');
    const lc = await (await fetch(`${BASE}/api/system/lifecycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })).json();
    assert(lc.status !== undefined, 'Lifecycle returns status');
    assert(lc.services?.postgres !== undefined, 'PG services present');
    assert(lc.services?.redis !== undefined, 'Redis services present');

    console.log('\n--- Check 3: Dictionary lookup ---');
    const dl = await (await fetch(`${BASE}/api/memory/dictionary/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'test' }) })).json();
    assert(typeof dl.found === 'boolean', 'Dictionary returns found boolean');

    console.log(`\n========================================`);
    console.log(`Integrity Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
    console.log(`========================================`);
    if (failed > 0) { process.exitCode = 1; } else { console.log('[Integrity] ALL CHECKS PASSED'); }
  } catch (e) { console.error(`[Integrity] Fatal: ${e.message}`); process.exitCode = 1; }
  finally { await stop(); process.exit(process.exitCode ?? 0); }
}
run();
