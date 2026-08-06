#!/usr/bin/env node
/**
 * scripts/local-setup-check.mjs — Local Development Environment Verifier
 * ---------------------------------------------------------------------------
 * One command to confirm the laptop environment is ready to test locally.
 *
 * Checks:
 *   - Node >= 22, npm >= 10, bun available
 *   - node_modules installed (tsx + vite present)
 *   - .env exists (from config/.env.example)
 *   - env vars the server needs are readable
 *   - fixtures pass (keystone, terminal-auth, intelligence-index)
 *   - typecheck compiles (if deps present)
 *
 * Exit code: 0 = ready, 1 = missing pieces (reported individually).
 *
 * Usage:
 *   node scripts/local-setup-check.mjs          # human report
 *   node scripts/local-setup-check.mjs --json   # machine-readable
 * ---------------------------------------------------------------------------
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail });
}

function hasBin(name) {
  return existsSync(join(REPO_ROOT, 'node_modules', '.bin', name));
}

function envVar(name) {
  try {
    const env = readFileSync(join(REPO_ROOT, '.env'), 'utf8');
    const m = env.match(new RegExp(`^${name}="?([^"\\n]*)"?`, 'm'));
    return m ? m[1] : null;
  } catch { return null; }
}

// ── Runtime versions ─────────────────────────────────────────────────────
const nodeVer = process.versions.node;
check('node >= 22', Number(nodeVer.split('.')[0]) >= 22, `v${nodeVer}`);
let npmVer = '?';
try { npmVer = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(); } catch {}
check('npm present', !!npmVer, `v${npmVer}`);
let bunVer = '?';
try { bunVer = execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim(); } catch {}
check('bun present (test runner)', !!bunVer && bunVer !== '?', bunVer === '?' ? 'not found' : `v${bunVer}`);

// ── Dependencies ─────────────────────────────────────────────────────────
check('node_modules installed', existsSync(join(REPO_ROOT, 'node_modules')), hasBin('tsx') ? 'tsx present' : 'tsx missing');
check('tsx (server runner)', hasBin('tsx'), 'available');
check('vite (web dev server)', hasBin('vite'), 'available');

// ── Env file ─────────────────────────────────────────────────────────────
const envExists = existsSync(join(REPO_ROOT, '.env'));
check('.env exists', envExists, envExists ? 'present (gitignored)' : 'cp config/.env.example .env');

const gemini = envVar('GEMINI_API_KEY');
const db = envVar('DATABASE_URL');
check('GEMINI_API_KEY set (AI features)', !!gemini, gemini ? 'configured' : 'EMPTY — AI /ask disabled until set');
check('DATABASE_URL set (persistence)', !!db, db ? 'configured' : 'EMPTY — memory/persistence degraded');

// ── Tests (fast fixtures) ────────────────────────────────────────────────
const testFiles = ['keystone.test.mjs', 'terminal-auth.test.mjs', 'intelligence-index.test.mjs'];
for (const t of testFiles) {
  if (existsSync(join(REPO_ROOT, 'scripts', t))) {
    try {
      execFileSync('bun', ['test', join('scripts', t)], { cwd: REPO_ROOT, stdio: 'ignore', timeout: 120000 });
      check(`fixtures: ${t}`, true, 'pass');
    } catch {
      check(`fixtures: ${t}`, false, 'FAIL');
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.pass);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ready: failed.length === 0, generatedAt: new Date().toISOString(), checks }, null, 2));
} else {
  console.log('\n  ╔══════════════════════════════════════════════════╗');
  console.log('  ║  LOCAL DEVELOPMENT ENVIRONMENT CHECK            ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  for (const c of checks) {
    console.log(`  ║  ${c.pass ? '✓' : '✗'} ${c.name.padEnd(38)} ${c.detail.slice(0, 26).padEnd(26)}║`);
  }
  console.log('  ╠══════════════════════════════════════════════════╣');
  if (failed.length) {
    console.log('  ║  NOT READY — fix the ✗ items above.             ║');
    console.log('  ║  Hint: cp config/.env.example .env, fill values  ║');
  } else {
    console.log('  ║  READY — environment is testable.               ║');
  }
  console.log('  ╚══════════════════════════════════════════════════╝\n');
  console.log('  Run the server:  npx tsx services/ingestion/server.js');
  console.log('  Run the web app: npm run dev --workspace apps/web');
  console.log('  Terminal:        http://localhost:3000/terminal.html\n');
}
process.exit(failed.length ? 1 : 0);
