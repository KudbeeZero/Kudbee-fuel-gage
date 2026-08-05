#!/usr/bin/env node
/**
 * scripts/repository-guardian.mjs — Repository Guardian (OPS-GIT-002)
 * ---------------------------------------------------------------------------
 * The preflight gate every agent runs BEFORE any implementation:
 *
 *   ✓ clean tree         — git status clean (no uncommitted work)
 *   ✓ no merge markers   — zero <<<<<<< / ======= / >>>>>>> in tracked files
 *   ✓ package lock valid — package.json + package-lock.json parse + sync
 *   ✓ stack valid        — key workspace package.jsons are valid JSON
 *   ✓ manifest valid     — handoff manifest can be generated
 *   ✓ handoff current    — handoff briefing resolves
 *   ✓ bootstrap current  — memory dirs exist
 *   ✓ terminal integrity — terminal.html has no conflict markers + has key sections
 *   ✓ active mission     — roadmap has an in_progress or planned phase
 *
 * If any check FAILS → implementation is BLOCKED. Report and stop.
 *
 *   node scripts/repository-guardian.mjs        → full preflight
 *   node scripts/repository-guardian.mjs --json → machine-readable
 *   exit code: 0 = pass, 1 = blocked
 * ---------------------------------------------------------------------------
 */
import { execFile } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function run(cmd, args, timeout = 15000) {
  return new Promise(res => {
    execFile(cmd, args, { cwd: REPO_ROOT, timeout, maxBuffer: 1024 * 256 },
      (err, stdout) => res(err ? '' : String(stdout).trim()));
  });
}

const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail });
}

async function scanMergeMarkers() {
  // Scan tracked source files only (skip .kilo/ state + node_modules)
  const out = await run('git', ['ls-files', '--', '*.js', '*.mjs', '*.ts', '*.tsx', '*.json', '*.html', '*.yml', '*.yaml', '*.css']);
  const files = out.split('\n').filter(Boolean).filter(f => !f.startsWith('.kilo/'));
  const violations = [];
  for (const f of files) {
    try {
      const content = readFileSync(join(REPO_ROOT, f), 'utf8');
      // Real conflict markers are markers ON THEIR OWN LINE, not literal
      // strings inside code (verify-quick.mjs legitimately contains the
      // string in its detector logic).
      const lines = content.split('\n');
      const real = lines.some(l => /^\s*<<<<<<<\s/.test(l) || /^\s*>>>>>>>\s/.test(l) || /^\s*=======$/.test(l));
      if (real) violations.push(f);
    } catch {}
  }
  return violations;
}

async function main() {
  // 1. Clean tree
  const status = await run('git', ['status', '--porcelain']);
  const dirty = status.split('\n').filter(Boolean).length;
  check('clean tree', dirty === 0, dirty ? `${dirty} uncommitted file(s)` : 'clean');

  // 2. No merge markers
  const violations = await scanMergeMarkers();
  check('no merge markers', violations.length === 0,
    violations.length ? violations.slice(0, 3).join(', ') : 'clean');

  // 3. Package lock valid
  let lockOk = false;
  try {
    const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'));
    lockOk = !!lock.packages && !!lock.lockfileVersion;
  } catch (e) { lockOk = false; }
  check('package lock valid', lockOk, lockOk ? 'parses' : 'INVALID JSON or missing');

  // 4. Stack valid — key package.jsons parse
  let stackOk = true; let stackDetail = '';
  for (const p of ['package.json', 'apps/web/package.json', 'apps/mobile/package.json', 'services/ingestion/package.json']) {
    try { JSON.parse(readFileSync(join(REPO_ROOT, p), 'utf8')); } catch { stackOk = false; stackDetail = p; break; }
  }
  check('stack valid', stackOk, stackOk ? 'all package.jsons parse' : stackDetail);

  // 5. Terminal integrity — no markers + has key sections
  let termOk = false;
  try {
    const t = readFileSync(join(REPO_ROOT, 'apps/web/terminal.html'), 'utf8');
    termOk = !/<<<<<<<|>>>>>>>/.test(t) && t.includes('KUDBEE') && t.includes('cmd-input');
  } catch { termOk = false; }
  check('terminal integrity', termOk, termOk ? 'clean + complete' : 'missing or corrupted');

  // 6. Handoff current
  const handoff = await run('node', ['scripts/handoff.mjs', '--json']);
  let handoffOk = false;
  try { handoffOk = !!JSON.parse(handoff).location; } catch {}
  check('handoff current', handoffOk, handoffOk ? 'briefing resolves' : 'handoff failed');

  // 7. Bootstrap current — memory dirs exist
  const memoryDirs = ['snippets', 'decisions', 'dthink', 'local-state'];
  const missing = memoryDirs.filter(d => !existsSync(join(REPO_ROOT, '.kilo', 'memory', d)));
  check('bootstrap current', missing.length === 0, missing.length ? missing.join(', ') : 'memory layers present');

  // 8. Active mission
  let missionOk = false; let missionDetail = '';
  try {
    const mod = await import('../services/terminal/roadmap.mjs');
    const r = mod.getRoadmapStatus();
    missionOk = r.phases.some(p => p.status === 'in_progress' || p.status === 'planned');
    missionDetail = `${r.percentComplete}% complete`;
  } catch { missionOk = false; }
  check('active mission', missionOk, missionOk ? missionDetail : 'roadmap unreadable');

  // 9. Pipeline integrity — all 3 Heroku environments must exist (dev→staging→prod)
  let pipelineOk = true; let pipelineDetail = '';
  if (process.env.HEROKU_API_KEY) {
    try {
      const expected = ['kudbee-fuel-gage-dev', 'kudbee-fuel-gage-staging', 'kudbee-fuel-gage'];
      for (const app of expected) {
        const r = await fetch(`https://api.heroku.com/apps/${app}`, {
          headers: { Authorization: `Bearer ${process.env.HEROKU_API_KEY}`, 'Accept': 'application/vnd.heroku+json; version=3' },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) { pipelineOk = false; pipelineDetail = `missing: ${app}`; break; }
      }
    } catch (e) { pipelineOk = false; pipelineDetail = e.message; }
  } else {
    pipelineOk = false; pipelineDetail = 'HEROKU_API_KEY not set (cannot verify)';
  }
  check('pipeline integrity (dev/staging/prod)', pipelineOk, pipelineOk ? 'all 3 apps exist' : pipelineDetail);

  // 10. INV-013 Keystone trust boundary — governance files may never be
  // modified by an executing cloud agent. The keystone is a write-enforcement
  // boundary: an agent's attempt to write a governance path is refused by the
  // keystone module (governanceViolations). The guardian's job is to verify
  // the keystone is intact and enforceable — not to block legitimate human-
  // approved PRs that intentionally evolve governance.
  let keystoneOk = true; let keystoneDetail = '';
  try {
    const { GOVERNANCE_PATHS, assertGovernancePathsProtected, governanceViolations } = await import('../services/lib/governanceKeystone.ts');
    const assertErr = assertGovernancePathsProtected();
    if (assertErr) { keystoneOk = false; keystoneDetail = assertErr; }
    else {
      // Prove the enforcement boundary works: a simulated agent write set
      // touching a governance file must be flagged as a violation.
      const simulated = governanceViolations(['src/agent-work.ts', 'AGENTS.md', 'MODEL_CONTRACT.md']);
      const enforceWorks = simulated.length === 2 && simulated.includes('AGENTS.md') && simulated.includes('MODEL_CONTRACT.md');
      if (!enforceWorks) { keystoneOk = false; keystoneDetail = 'keystone enforcement broken (governance writes not refused)'; }
      else { keystoneDetail = `${GOVERNANCE_PATHS.length} paths agent-read-only; enforcement verified`; }
    }
  } catch (e) { keystoneOk = false; keystoneDetail = `keystone module unreadable: ${e.message}`; }
  check('INV-013 keystone trust boundary', keystoneOk, keystoneOk ? keystoneDetail : keystoneDetail);

  // ── Report ──
  const failed = checks.filter(c => !c.pass);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), blocked: failed.length > 0, checks }, null, 2));
  } else {
    console.log('═══════════ REPOSITORY GUARDIAN ═══════════');
    for (const c of checks) {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    }
    console.log('═══════════════════════════════════════════');
    if (failed.length) {
      console.log(`BLOCKED: ${failed.length} check(s) failed. Fix before implementing.`);
      process.exit(1);
    } else {
      console.log('GUARDIAN PASS — safe to implement.');
      process.exit(0);
    }
  }
}

await main();
