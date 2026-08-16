/**
 * scripts/ci-self-hosted.mjs
 * ---------------------------------------------------------------------------
 * Self-Hosted CI Runner — no GitHub Actions dependency.
 *
 * Runs the authoritative local release checks, reporting results
 * to the Kudbee API and DTHINK pipeline. Can be triggered via:
 *   - CLI:    node scripts/ci-self-hosted.mjs
 *   - Cron:   every 4 hours node scripts/ci-self-hosted.mjs
 *   - Webhook: POST /api/ci/trigger → spawns this script
 *
 * Checks:
 *   1. Agent contracts — verify-agent-contracts.mjs
 *   2. Integration availability — verify-integrations.mjs
 *   3. Learning protocol — verify-learning-protocol.mjs
 *   4. Secret hygiene — verify-secret-hygiene.mjs
 *   5. TypeScript side-by-side version — native TS7 compiler + TS6 API alias
 *   6. Node crypto runtime — verify-crypto-runtime.mjs
 *   7. Typecheck — turbo run typecheck
 *   8. Lint — turbo run lint
 *   9. Build — turbo run build --filter=@kudbee/web
 *   10. E2E — bounded smoke by default; full E2E only with E2E_ALLOW_DATABASE_WRITES=1
 *   11. Agent verify — verify-agents.mjs
 *   12. Operating model — verify-operating-model.mjs
 *
 * Reports results to /api/ci/status endpoint on the Kudbee server.
 * Feeds every run into DTHINK pipeline for learning.
 * ---------------------------------------------------------------------------
 */

import { execFileSync, execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const API_BASE = process.env.KUDBEE_API_URL || 'http://localhost:3000';
const MEMORY_DIR = join(process.cwd(), '.kilo', 'memory');
const CI_LOG = join(MEMORY_DIR, 'ci-self-hosted.jsonl');

function ensureDir() { if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true }); }

function log(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  ensureDir();
  writeFileSync(CI_LOG, JSON.stringify(entry) + '\n', { flag: 'a' });
  console.log(`[${level}] ${msg}`);
}

function sh(cmd, label) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 120_000 }).trim();
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: e.message || String(e) };
  }
}

async function reportToAPI(runId, results) {
  try {
    await fetch(`${API_BASE}/api/ci/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, results, timestamp: new Date().toISOString() }),
    });
  } catch {}
}

async function feedDTHINK(msg) {
  try {
    execFileSync('node', ['scripts/dthink-pipeline.mjs', 'feed', 'system:ci', msg], { timeout: 5000 });
  } catch {}
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const runId = `ci-${Date.now().toString(36)}`;
  log('INFO', `CI run ${runId} started`);

  const results = [];

  // 1. Company agent contract.
  log('INFO', 'Gate 1/11: Agent contracts');
  const agentContracts = sh('npm run verify:agent-contracts', 'agent-contracts');
  results.push({ gate: 'agent-contracts', pass: agentContracts.ok, detail: agentContracts.out.slice(-60) });
  log(agentContracts.ok ? 'PASS' : 'FAIL', `Agent contracts: ${agentContracts.ok ? 'OK' : 'FAILED'}`);

  // 2. Integration availability; child process reports names only.
  log('INFO', 'Gate 2/11: Integration availability');
  const integrations = sh('npm run verify:integrations', 'integrations');
  results.push({ gate: 'integrations', pass: integrations.ok, detail: integrations.out.slice(-60) });
  log(integrations.ok ? 'PASS' : 'FAIL', `Integrations: ${integrations.ok ? 'OK' : 'FAILED'}`);

  // 3. Learning protocol.
  log('INFO', 'Gate 3/11: Learning protocol');
  const learning = sh('npm run verify:learning-protocol', 'learning-protocol');
  results.push({ gate: 'learning-protocol', pass: learning.ok, detail: learning.out.slice(-60) });
  log(learning.ok ? 'PASS' : 'FAIL', `Learning protocol: ${learning.ok ? 'OK' : 'FAILED'}`);

  // 4. Secret hygiene. The child process only reports names and status.
  log('INFO', 'Gate 4/11: Secret hygiene');
  const secrets = sh('npm run verify:secrets', 'secret-hygiene');
  const secretsPass = secrets.ok;
  results.push({ gate: 'secret-hygiene', pass: secretsPass, detail: secrets.out.slice(-60) });
  log(secretsPass ? 'PASS' : 'FAIL', `Secret hygiene: ${secretsPass ? 'OK' : 'FAILED'}`);

  // 5. TypeScript side-by-side version
  log('INFO', 'Gate 5/11: TypeScript 7 native compiler + TypeScript 6 API alias');
  const tsVersion = sh('npm run verify:typescript', 'typescript-version');
  const tsVersionPass = tsVersion.ok;
  results.push({ gate: 'typescript-version', pass: tsVersionPass, detail: tsVersion.out.slice(-60) });
  log(tsVersionPass ? 'PASS' : 'FAIL', `TypeScript side-by-side version: ${tsVersionPass ? 'OK' : 'FAILED'}`);

  // 6. Node crypto runtime.
  log('INFO', 'Gate 6/12: Node crypto runtime');
  const cryptoRuntime = sh('npm run verify:crypto', 'crypto-runtime');
  results.push({ gate: 'crypto-runtime', pass: cryptoRuntime.ok, detail: cryptoRuntime.out.slice(-60) });
  log(cryptoRuntime.ok ? 'PASS' : 'FAIL', `Crypto runtime: ${cryptoRuntime.ok ? 'OK' : 'FAILED'}`);

  // 7. Typecheck
  log('INFO', 'Gate 7/12: Typecheck');
  const tc = sh('npx turbo run typecheck', 'typecheck');
  const tcPass = tc.ok && !tc.out.includes('Failed');
  results.push({ gate: 'typecheck', pass: tcPass, detail: tc.out.slice(-60) });
  log(tcPass ? 'PASS' : 'FAIL', `Typecheck: ${tcPass ? 'OK' : 'FAILED'}`);

  // 7. Lint
  log('INFO', 'Gate 8/12: Lint');
  const lint = sh('npx turbo run lint', 'lint');
  const lintPass = lint.ok && !lint.out.includes('error');
  results.push({ gate: 'lint', pass: lintPass, detail: lint.out.slice(-60) });
  log(lintPass ? 'PASS' : 'WARN', `Lint: ${lintPass ? 'OK' : 'warnings'}`);

  // 8. Build
  log('INFO', 'Gate 9/12: Build');
  const build = sh('npx turbo run build --filter=@kudbee/web', 'build');
  const buildPass = build.ok;
  results.push({ gate: 'build', pass: buildPass, detail: build.out.slice(-60) });
  log(buildPass ? 'PASS' : 'FAIL', `Build: ${buildPass ? 'OK' : 'FAILED'}`);

  // 9. E2E is isolated smoke unless the explicit write opt-in is present.
  if (process.env.E2E_ALLOW_DATABASE_WRITES === '1') {
     log('INFO', 'Gate 10/12: Full E2E (database-writing opt-in enabled)');
    const e2e = sh('node scripts/verify-e2e.mjs', 'e2e');
    const e2ePass = e2e.ok;
    results.push({ gate: 'e2e', pass: e2ePass, detail: e2e.out.slice(-60) });
    log(e2ePass ? 'PASS' : 'FAIL', `E2E: ${e2ePass ? 'OK' : 'FAILED'}`);
  } else {
    log('INFO', 'Gate 5/7: E2E skipped (no DATABASE_URL)');
    results.push({ gate: 'e2e', pass: false, status: 'skipped', detail: 'DATABASE_URL unavailable; release evidence incomplete' });
  }

  // 10. Agent verify
  log('INFO', 'Gate 11/12: Agent verify');
  const agents = sh('node scripts/verify-agents.mjs', 'agents');
  const agentsPass = agents.ok;
  results.push({ gate: 'agents', pass: agentsPass, detail: agents.out.slice(-60) });
  log(agentsPass ? 'PASS' : 'FAIL', `Agents: ${agentsPass ? 'OK' : 'FAILED'}`);

  // 11. Operating model
  log('INFO', 'Gate 12/12: Operating model');
  const ops = sh('node scripts/verify-operating-model.mjs', 'operating-model');
  const opsPass = ops.ok;
  results.push({ gate: 'operating-model', pass: opsPass, detail: ops.out.slice(-60) });
  log(opsPass ? 'PASS' : 'FAIL', `Operating model: ${opsPass ? 'OK' : 'FAILED'}`);

  // ── Report ─────────────────────────────────────────────────────
  const passCount = results.filter(r => r.pass).length;
  const failCount = results.filter(r => !r.pass).length;
  const status = failCount === 0 ? 'GREEN' : 'FAIL';

  log('INFO', `Complete: ${passCount}/${results.length} gates passed — ${status}`);
  await reportToAPI(runId, results);
  await feedDTHINK(`CI run ${runId}: ${status} — ${passCount}/${results.length} gates. ${failCount > 0 ? 'Failing: ' + results.filter(r=>!r.pass).map(r=>r.gate).join(', ') : 'All clear.'}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => { log('FATAL', e.message); process.exit(1); });
