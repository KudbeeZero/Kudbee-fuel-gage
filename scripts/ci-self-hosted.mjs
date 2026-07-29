/**
 * scripts/ci-self-hosted.mjs
 * ---------------------------------------------------------------------------
 * Self-Hosted CI Runner — no GitHub Actions dependency.
 *
 * Runs the same checks as verify.yml but locally, reporting results
 * to the Kudbee API and DTHINK pipeline. Can be triggered via:
 *   - CLI:    node scripts/ci-self-hosted.mjs
 *   - Cron:   every 4 hours node scripts/ci-self-hosted.mjs
 *   - Webhook: POST /api/ci/trigger → spawns this script
 *
 * Checks:
 *   1. Typecheck — turbo run typecheck
 *   2. Lint — turbo run lint
 *   3. Unused imports — verify-gates.mjs --unused-only
 *   4. Build — turbo run build --filter=@kudbee/web
 *   5. E2E — verify-e2e.mjs (if DATABASE_URL set)
 *   6. Agent verify — verify-agents.mjs
 *
 * Reports results to /api/ci/status endpoint on the Kudbee server.
 * Feeds every run into DTHINK pipeline for learning.
 * ---------------------------------------------------------------------------
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const API_BASE = process.env.KUDBEE_API_URL || 'https://kudbee-fuel-gage-330ade653a62.herokuapp.com';
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
    execSync(`node scripts/dthink-pipeline.mjs feed "system:ci" "${msg.replace(/"/g, '\\"')}"`, { timeout: 5000 });
  } catch {}
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const runId = `ci-${Date.now().toString(36)}`;
  log('INFO', `CI run ${runId} started`);

  const results = [];

  // 1. Typecheck
  log('INFO', 'Gate 1/6: Typecheck');
  const tc = sh('npx turbo run typecheck', 'typecheck');
  const tcPass = tc.ok && !tc.out.includes('Failed');
  results.push({ gate: 'typecheck', pass: tcPass, detail: tc.out.slice(-60) });
  log(tcPass ? 'PASS' : 'FAIL', `Typecheck: ${tcPass ? 'OK' : 'FAILED'}`);

  // 2. Lint
  log('INFO', 'Gate 2/6: Lint');
  const lint = sh('npx turbo run lint', 'lint');
  const lintPass = lint.ok && !lint.out.includes('error');
  results.push({ gate: 'lint', pass: lintPass, detail: lint.out.slice(-60) });
  log(lintPass ? 'PASS' : 'WARN', `Lint: ${lintPass ? 'OK' : 'warnings'}`);

  // 3. Unused imports
  log('INFO', 'Gate 3/6: Unused imports');
  const unused = sh('node scripts/verify-gates.mjs --unused-only', 'unused');
  const unusedPass = unused.ok && !unused.out.includes('✗');
  results.push({ gate: 'unused-imports', pass: unusedPass, detail: unused.out.slice(-60) });
  log(unusedPass ? 'PASS' : 'FAIL', `Unused imports: ${unusedPass ? 'OK' : 'FOUND'}`);

  // 4. Build
  log('INFO', 'Gate 4/6: Build');
  const build = sh('npx turbo run build --filter=@kudbee/web', 'build');
  const buildPass = build.ok;
  results.push({ gate: 'build', pass: buildPass, detail: build.out.slice(-60) });
  log(buildPass ? 'PASS' : 'FAIL', `Build: ${buildPass ? 'OK' : 'FAILED'}`);

  // 5. E2E (only if DATABASE_URL is set)
  if (process.env.DATABASE_URL) {
    log('INFO', 'Gate 5/6: E2E');
    const e2e = sh('node scripts/verify-e2e.mjs', 'e2e');
    const e2ePass = e2e.ok;
    results.push({ gate: 'e2e', pass: e2ePass, detail: e2e.out.slice(-60) });
    log(e2ePass ? 'PASS' : 'FAIL', `E2E: ${e2ePass ? 'OK' : 'FAILED'}`);
  } else {
    log('INFO', 'Gate 5/6: E2E skipped (no DATABASE_URL)');
    results.push({ gate: 'e2e', pass: true, detail: 'skipped' });
  }

  // 6. Agent verify
  log('INFO', 'Gate 6/6: Agent verify');
  const agents = sh('node scripts/verify-agents.mjs', 'agents');
  const agentsPass = agents.ok;
  results.push({ gate: 'agents', pass: agentsPass, detail: agents.out.slice(-60) });
  log(agentsPass ? 'PASS' : 'FAIL', `Agents: ${agentsPass ? 'OK' : 'FAILED'}`);

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
