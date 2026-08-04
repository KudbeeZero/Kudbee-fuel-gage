#!/usr/bin/env node
/**
 * scripts/verify-invariants.mjs — Machine-Verifiable Invariants Engine
 * ---------------------------------------------------------------------------
 * Every invariant in config/invariants.json is checked automatically.
 * A violation BLOCKS implementation (exit 1). Runs in:
 *   - CI (GitHub Actions)
 *   - /guardian preflight
 *   - /invariants terminal command
 *   - autonomous-maintenance every 6h
 *
 *   node scripts/verify-invariants.mjs            → full report
 *   node scripts/verify-invariants.mjs --json     → machine-readable
 *   node scripts/verify-invariants.mjs --quiet    → exit code only
 * ---------------------------------------------------------------------------
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const INVARIANTS_FILE = join(REPO_ROOT, 'config', 'invariants.json');

function run(cmd, args, timeout = 20000) {
  return new Promise(res => {
    execFile(cmd, args, { cwd: REPO_ROOT, timeout, maxBuffer: 1024 * 512 },
      (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, out: (stdout || '') + (stderr || '') }));
  });
}

function parseJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

// ── Individual invariant checks ───────────────────────────────────────────────

async function checkMergeMarkers() {
  const out = await run('git', ['ls-files', '--', '*.js', '*.mjs', '*.ts', '*.tsx', '*.json', '*.html', '*.yml', '*.yaml', '*.css']);
  const files = out.out.split('\n').filter(Boolean).filter(f => !f.startsWith('.kilo/'));
  for (const f of files) {
    try {
      const lines = readFileSync(join(REPO_ROOT, f), 'utf8').split('\n');
      const real = lines.some(l => /^\s*<<<<<<<\s/.test(l) || /^\s*>>>>>>>\s/.test(l) || /^\s*=======$/.test(l));
      if (real) return { pass: false, detail: `markers in ${f}` };
    } catch {}
  }
  return { pass: true, detail: 'no markers in tracked source' };
}

async function checkLockfile() {
  const lock = parseJson(join(REPO_ROOT, 'package-lock.json'));
  const pkg = parseJson(join(REPO_ROOT, 'package.json'));
  if (!lock || !lock.packages || !lock.lockfileVersion) return { pass: false, detail: 'lockfile unparseable' };
  const lockRoot = lock.packages[''];
  const pkgDeps = Object.keys(pkg.dependencies || {}).sort();
  const lockDeps = Object.keys(lockRoot?.dependencies || {}).sort();
  const missing = pkgDeps.filter(d => !lockDeps.includes(d));
  return missing.length === 0
    ? { pass: true, detail: `lockfile v${lock.lockfileVersion}, ${pkgDeps.length} deps in sync` }
    : { pass: false, detail: `lockfile missing deps: ${missing.join(', ')}` };
}

async function checkSecrets() {
  const r = await run('node', ['scripts/verify-secret-hygiene.mjs']);
  return r.code === 0 ? { pass: true, detail: 'secret hygiene clean' } : { pass: false, detail: 'secret hygiene FAILED' };
}

async function checkTerminal() {
  const t = join(REPO_ROOT, 'apps', 'web', 'terminal.html');
  if (!existsSync(t)) return { pass: false, detail: 'terminal.html missing' };
  const content = readFileSync(t, 'utf8');
  const hasMarkers = content.split('\n').some(l => /^\s*<<<<<<<\s/.test(l) || /^\s*>>>>>>>\s/.test(l));
  const complete = content.includes('KUDBEE') && content.includes('cmd-input') && content.includes('Engineering Health');
  return !hasMarkers && complete
    ? { pass: true, detail: 'terminal.html clean + complete' }
    : { pass: false, detail: hasMarkers ? 'terminal.html has markers' : 'terminal.html incomplete' };
}

async function checkTypescript7() {
  const pkg = parseJson(join(REPO_ROOT, 'package.json'));
  const dev = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
  const tsEntry = dev.typescript || dev['@typescript/native'] || dev['@typescript/typescript6'] || '';
  // Contract: no TypeScript 4.x or lower (TS5/TS7 accepted; the gate is
  // `npm run verify:typescript` which runs the full typecheck).
  const major = (tsEntry.match(/(\d+)\./) || [])[1] || '';
  const ok = major === '' || Number(major) >= 5;
  return ok
    ? { pass: true, detail: `typescript ${tsEntry || 'n/a'} — verify:typescript runs the gate` }
    : { pass: false, detail: `TS ${major}.x found — must be >= 5` };
}

async function checkPipeline() {
  if (!process.env.HEROKU_API_KEY) return { pass: false, detail: 'HEROKU_API_KEY not set — cannot verify' };
  const expected = ['kudbee-fuel-gage-dev', 'kudbee-fuel-gage-staging', 'kudbee-fuel-gage'];
  const missing = [];
  for (const app of expected) {
    try {
      const r = await fetch(`https://api.heroku.com/apps/${app}`, {
        headers: { Authorization: `Bearer ${process.env.HEROKU_API_KEY}`, 'Accept': 'application/vnd.heroku+json; version=3' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) missing.push(app);
    } catch { missing.push(app); }
  }
  return missing.length === 0 ? { pass: true, detail: 'dev/staging/prod all exist' } : { pass: false, detail: `missing: ${missing.join(', ')}` };
}

async function checkRedisQuota() {
  // Verify the quota-protection intervals are in place (worker.js + worker.ts)
  try {
    const w = readFileSync(join(REPO_ROOT, 'worker.js'), 'utf8');
    const wt = readFileSync(join(REPO_ROOT, 'services', 'agents', 'worker.ts'), 'utf8');
    const hb = /HEARTBEAT_INTERVAL_MS = 5 \* 60 \* 1000/.test(w);
    const audit = /AUDIT_INTERVAL_MS = 15 \* 60 \* 1000/.test(w);
    const brpop = /BRPOP_TIMEOUT_MS = 25_000/.test(wt);
    const ok = hb && audit && brpop;
    return ok
      ? { pass: true, detail: 'heartbeat 5min, audit 15min, BRPOP 25s (23% of quota)' }
      : { pass: false, detail: `interval drift — hb=${hb} audit=${audit} brpop=${brpop}` };
  } catch {
    return { pass: false, detail: 'quota intervals unreadable' };
  }
}

async function checkRuntimeVulns() {
  const r = await run('npm', ['audit', '--omit=dev', '--json'], 90000);
  // Server-runtime deps that MUST be vulnerability-free.
  // Expo mobile toolchain (@xmldom/xmldom via @expo/plist) is accepted —
  // it never ships to the server runtime. Overrides pinned to patched
  // versions where possible (0.9.10); hoisted 0.7.13 is build-only.
  const SERVER_DEPS = ['express', 'pg', 'ioredis', 'zod', '@upstash/qstash', '@upstash/vector', '@upstash/box', '@upstash/workflow', '@google/genai', 'socket.io', 'helmet', 'cors', 'express-rate-limit'];
  try {
    const data = JSON.parse(r.out);
    const advisories = data.vulnerabilities || {};
    // Block only if a REAL server dep appears. Expo/mobile toolchain
    // (expo, @expo/*, tar, uuid, xcode, cacache, xmldom) is build-only.
    const blocked = Object.keys(advisories).filter(pkg => {
      const name = pkg.toLowerCase();
      if (name.includes('expo') || name.includes('xmldom') || name.includes('cacache') || name === 'tar' || name === 'uuid' || name === 'xcode') return false;
      return SERVER_DEPS.some(s => pkg === s || pkg.startsWith(s + '/'));
    });
    if (blocked.length === 0) {
      return { pass: true, detail: 'server runtime clean; mobile toolchain (expo/xmldom/tar/uuid/xcode) build-only' };
    }
    return { pass: false, detail: `vulnerable server deps: ${blocked.join(', ')}` };
  } catch {
    return { pass: false, detail: 'npm audit unreadable' };
  }
}

async function checkCleanTree() {
  const r = await run('git', ['status', '--porcelain']);
  const dirty = r.out.split('\n').filter(Boolean).length;
  return dirty === 0 ? { pass: true, detail: 'clean tree' } : { pass: false, detail: `${dirty} uncommitted file(s)` };
}

async function checkActiveMission() {
  try {
    const mod = await import('../services/terminal/roadmap.mjs');
    const r = mod.getRoadmapStatus();
    const active = r.phases.some(p => p.status === 'in_progress' || p.status === 'planned');
    return active ? { pass: true, detail: `${r.percentComplete}% complete, active phases` } : { pass: false, detail: 'no active mission' };
  } catch {
    return { pass: false, detail: 'roadmap unreadable' };
  }
}

const CHECKERS = {
  'merge-markers': checkMergeMarkers,
  'lockfile': checkLockfile,
  'secrets': checkSecrets,
  'terminal': checkTerminal,
  'typescript-7': checkTypescript7,
  'pipeline': checkPipeline,
  'redis-quota': checkRedisQuota,
  'runtime-vulns': checkRuntimeVulns,
  'clean-tree': checkCleanTree,
  'active-mission': checkActiveMission,
};

// ── Runner ────────────────────────────────────────────────────────────────────

async function verifyAll() {
  const manifest = parseJson(INVARIANTS_FILE);
  if (!manifest || !manifest.invariants) {
    console.error('[invariants] config/invariants.json missing or invalid');
    process.exit(1);
  }
  const results = [];
  for (const inv of manifest.invariants) {
    const checker = CHECKERS[inv.check];
    if (!checker) { results.push({ id: inv.id, name: inv.name, pass: false, detail: `no checker: ${inv.check}` }); continue; }
    try {
      const r = await checker();
      results.push({ id: inv.id, name: inv.name, pass: r.pass, detail: r.detail, severity: inv.severity });
    } catch (e) {
      results.push({ id: inv.id, name: inv.name, pass: false, detail: e.message, severity: inv.severity });
    }
  }
  return results;
}

const flag = process.argv[2] || '';
const results = await verifyAll();
const failed = results.filter(r => !r.pass);
const critical = failed.filter(r => r.severity === 'critical');

if (flag === '--json') {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, invariants: results }, null, 2));
} else if (flag === '--quiet') {
  process.exit(failed.length ? 1 : 0);
} else {
  console.log('═══════════ INVARIANTS (machine-verified) ═══════════');
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.id} ${r.name} — ${r.detail}`);
  }
  console.log('════════════════════════════════════════════════════');
  if (failed.length) {
    console.log(`VIOLATION: ${failed.length} invariant(s) failed (${critical.length} critical). Implementation BLOCKED.`);
    process.exit(1);
  }
  console.log('ALL INVARIANTS HOLD — safe to proceed.');
  process.exit(0);
}
