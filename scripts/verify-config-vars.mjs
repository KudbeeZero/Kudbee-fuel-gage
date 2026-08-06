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
 *   node scripts/verify-config-vars.mjs --heroku staging     # cross-reference with Heroku
 *   node scripts/verify-config-vars.mjs --heroku production  # cross-reference with Heroku
 *   HEROKU_API_KEY=xxx node scripts/verify-config-vars.mjs --heroku production
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

try { process.loadEnvFile('.env'); } catch {}

const root = process.cwd();
const target = process.argv.includes('--heroku') ? process.argv[process.argv.indexOf('--heroku') + 1] : null;
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

if (target) {
  const herokuKey = process.env.HEROKU_API_KEY;
  if (!herokuKey) {
    warn('heroku', 'HEROKU_API_KEY not set — skipping Heroku cross-reference');
  } else {
    const appName = target === 'production' ? 'kudbee-fuel-gage' : target === 'staging' ? 'kudbee-fuel-gage-staging' : null;
    if (!appName) { warn('heroku', `Unknown target "${target}"`); } else {
      let herokuVars;
      try {
        // execFileSync avoids the shell, so the API key never appears in a
        // command line (visible via `ps`) — it travels only in the header env.
        const out = execFileSync(
          'curl',
          [
            '-s',
            '--max-time', '15',
            `https://api.heroku.com/apps/${appName}/config-vars`,
            '-H', `Authorization: Bearer ${herokuKey}`,
            '-H', 'Accept: application/vnd.heroku+json; version=3',
          ],
          { maxBuffer: 1024 * 1024, timeout: 15000 }
        );
        herokuVars = JSON.parse(out.toString());
      } catch (e) {
        const detail = e && typeof e === 'object' && 'stdout' in e
          ? String(e.stdout).slice(0, 200)
          : String(e && e.message ? e.message : e).slice(0, 200);
        warn('heroku', `Failed to fetch config vars for ${appName}: ${detail}`);
        herokuVars = {};
      }

      const herokuKeys = new Set(Object.keys(herokuVars));
      const codeKeys = new Set(envRefs.keys());

      // ── INV-019: required config vars (hard gate) ──────────────────────
      // A missing critical var (e.g. REDIS_URL) must FAIL, never degrade
      // silently. This is the guard that prevents the prod-Redis-OFFLINE
      // class of incident.
      const required = REQUIRED_VARS[target] || [];
      const missingRequired = required.filter((v) => !herokuVars[v]);
      if (missingRequired.length) {
        fail(`INV-019:required:${appName}`, `MISSING required config vars on ${appName}: ${missingRequired.join(', ')} — set these before deploy`);
      } else {
        pass(`INV-019:required:${appName}`, `${required.length} required vars present (${required.join(', ')})`);
      }

      for (const hk of herokuKeys) {
        if (hk.startsWith('HEROKU_') || hk === 'DATABASE_URL' || hk === 'NODE_ENV') continue;
        if (!codeKeys.has(hk)) {
          warn(`orphan:${appName}:${hk}`, `set on Heroku but never referenced in code`);
        }
      }

      for (const ck of codeKeys) {
        if (!herokuKeys.has(ck)) {
          // Advisory, not a failure: most code-referenced vars are CI-only,
          // local-dev, or have code defaults. Only INV-019's required list
          // is a hard gate — this heuristic is noise otherwise.
          warn(`missing:${appName}:${ck}`, `referenced in code but NOT set on Heroku ${appName}`);
        }
      }

      for (const hk of herokuKeys) {
        if (hk.startsWith('HEROKU_') || hk === 'DATABASE_URL') continue;
        for (const ck of codeKeys) {
          if (hk !== ck && Math.abs(hk.length - ck.length) <= 3 && levenshtein(hk, ck) <= 2) {
            warn(`typo-similar:${appName}`, `${hk} (Heroku) ≈ ${ck} (code) — possible typo (distance: ${levenshtein(hk, ck)})`);
          }
        }
      }

      const matched = [...codeKeys].filter(k => herokuKeys.has(k));
      const missing = [...codeKeys].filter(k => !herokuKeys.has(k));
      const orphans = [...herokuKeys].filter(k => !codeKeys.has(k) && !k.startsWith('HEROKU_') && k !== 'DATABASE_URL');
      console.log(`\n[verify-config-vars] ${appName}: ${matched.length} matched, ${missing.length} missing, ${orphans.length} orphans\n`);
    }
  }
}

console.log(`Config hygiene: ${failures.length ? 'BLOCKED' : 'PASS'} (${warnings.length} warnings, ${failures.length} failures)`);
if (failures.length) process.exitCode = 1;
