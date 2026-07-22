/**
 * scripts/verify-resilience.mjs
 * Phase 61 — Resilience verification: 6 assertions on isolated port 9904.
 */
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
const DIR = new URL('../services/ingestion', import.meta.url).pathname;
const PORT = 9904, BASE = `http://127.0.0.1:${PORT}`;
let proc = null, passed = 0, failed = 0;
function assert(c,l) { if(c) { console.log(`  [PASS] ${l}`); passed++; } else { console.error(`  [FAIL] ${l}`); failed++; } }

async function start() {
  proc = spawn('npx', ['tsx', 'server.js'], { cwd: DIR, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: 'pipe', shell: true });
  const d = Date.now(); while (Date.now() - d < 20000) { try { if ((await fetch(`${BASE}/health`)).ok) { console.log('[Resilience] Ready.'); return; } } catch {} await delay(500); }
  throw new Error('Server not ready');
}
async function stop() { if (proc) { proc.kill('SIGTERM'); await delay(500); } }

async function run() {
  try {
    await start();
    // Test 1: Health endpoint
    console.log('\n--- Check 1: Health ---');
    assert((await fetch(`${BASE}/health`)).ok, 'Health returns 200');
    // Test 2: Non-existent route returns graceful error
    console.log('\n--- Check 2: Unknown route degrades gracefully ---');
    const r2 = await fetch(`${BASE}/api/nonexistent-${Date.now()}`);
    assert(r2.status >= 400, 'Unknown route returns 4xx/5xx without crash');
    // Test 3: Probation docket endpoint
    console.log('\n--- Check 3: Probation docket ---');
    const r3 = await fetch(`${BASE}/api/governance/probation/docket`);
    assert(r3.ok, 'Probation docket returns 200');
    // Test 4: Threat heatmap
    console.log('\n--- Check 4: Threat heatmap ---');
    const r4 = await fetch(`${BASE}/api/interceptor/threat-heatmap`);
    assert(r4.ok, 'Threat heatmap returns 200');
    // Test 5: Lifecycle probe
    console.log('\n--- Check 5: Lifecycle ---');
    const r5 = await fetch(`${BASE}/api/system/lifecycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
    assert(r5.ok, 'Lifecycle returns 200');
    // Test 6: Server still alive after all probes
    console.log('\n--- Check 6: Server still alive ---');
    assert((await fetch(`${BASE}/health`)).ok, 'Server survived all probes');
    console.log(`\n========================================`);
    console.log(`Resilience Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
    if (failed > 0) { process.exitCode = 1; } else { console.log('[Resilience] ALL CHECKS PASSED'); }
  } catch(e) { console.error(`[Resilience] Fatal: ${e.message}`); process.exitCode = 1; }
  finally { await stop(); process.exit(process.exitCode ?? 0); }
}
run();
