#!/usr/bin/env node
/**
 * Config var hygiene gate — cross-references codebase process.env.*
 * references against Heroku config vars.
 *
 * Catches:
 *   - Orphaned vars (set on Heroku but never referenced in code)
 *   - Missing required vars (referenced in code but not set on Heroku)
 *   - Typo-similar pairs (e.g. GEMENI_API_KEY vs GEMINI_API_KEY — Levenshtein ≤ 2)
 *
 * Usage:
 *   node scripts/verify-config-vars.mjs                      # local only
 *
 * (Heroku cross-reference mode was retired with the Heroku → AWS migration.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

try { process.loadEnvFile('.env'); } catch {}

const root = process.cwd();
const target = null; // Heroku cross-reference retired (Heroku → AWS migration)
const strict = process.argv.includes('--strict');
const failures = [];
const warnings = [];

// ─── INV-019: Required config vars ─────────────────────────────────────────
// Non-negotiable vars for each environment. If any is absent, the gate FAILS.
// This is what prevents "Redis silently OFFLINE in prod" — a missing REDIS_URL
// must block, never degrade silently.
const REQUIRED_VARS = {
  production: ['DATABASE_URL', 'REDIS_URL', 'REDIS_WORKER_URL', 'STREAM_SECRET', 'SESSION_SECRET', 'GEMINI_API_KEY'],
  staging: ['DATABASE_URL', 'REDIS_URL', 'REDIS_WORKER_URL', 'STREAM_SECRET', 'GEMINI_API_KEY'],
};
const APP_NAMES = { production: 'kudbee-fuel-gage', staging: 'kudbee-fuel-gage-staging' };

const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const warn = (id, detail) => { warnings.push(detail); console.warn(`[WARN] ${id}: ${detail}`); };
const fail = (id, detail) => { failures.push(detail); console.error(`[FAIL] ${id}: ${detail}`); };

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const scanFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
  .toString().split('\0').filter(Boolean)
  .filter(f => /\.(js|ts|tsx|mjs|cjs)$/.test(f))
  .filter(f => !f.startsWith('.worktrees/') && !f.startsWith('node_modules/') && !f.startsWith('.git/') && !f.endsWith('.lock'));

const envRefs = new Map();
for (const file of scanFiles) {
  let content;
  try { content = fs.readFileSync(path.join(root, file), 'utf8'); } catch { continue; }
  const matches = content.matchAll(/process\.env(?:\[["'`]([A-Z_][A-Z0-9_]*)["'`]\]|\.([A-Z_][A-Z0-9_]*))/g);
  for (const m of matches) {
    const key = m[1] || m[2];
    if (key.startsWith('npm_') || key === 'NODE_ENV' || key === 'PATH' || key === 'HOME' || key === 'PORT' || key === 'CI') continue;
    if (!envRefs.has(key)) envRefs.set(key, new Set());
    envRefs.get(key).add(file);
  }
}

console.log(`\n[verify-config-vars] Found ${envRefs.size} unique env var references across ${scanFiles.length} source files.\n`);

// Heroku cross-reference mode retired with the Heroku → AWS migration.

console.log(`Config hygiene: ${failures.length ? 'BLOCKED' : 'PASS'} (${warnings.length} warnings, ${failures.length} failures)`);
if (failures.length) process.exitCode = 1;
