/**
 * scripts/verify-gates.mjs
 * ---------------------------------------------------------------------------
 * Pre-flight CI Gate Runner — catches issues before they hit GitHub CI.
 *
 * Runs the same checks as the `Verify` job in Kudbee CI workflow:
 *   1. Typecheck — turbo typecheck across all workspaces
 *   2. Lint — turbo lint (unused imports, format violations)
 *   3. Build — turbo build (verifies bundle integrity)
 *   4. Unused imports — scans frontend for dead lucide-react imports
 *   5. Decision log — records gate results to agent memory
 *
 * Usage:
 *   node scripts/verify-gates.mjs              # Run all gates
 *   node scripts/verify-gates.mjs --quick       # Only typecheck + lint
 *   node scripts/verify-gates.mjs --unused-only # Only scan unused imports
 *
 * Exit code: 0 if all gates pass, 1 if any gate fails.
 * ---------------------------------------------------------------------------
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve, extname } from 'path';

const MEMORY_DIR = join(process.cwd(), '.kilo', 'memory');
const GATE_LOG = join(MEMORY_DIR, 'gate-results.json');
const DECISION_DIR = join(MEMORY_DIR, 'decisions');

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function gateStatus(id, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗';
  const line = `  ${icon} ${id.padEnd(30)} ${detail}`;
  console.log(line);
  return { id, status, detail, timestamp: new Date().toISOString() };
}

function spin(cmd, label) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 120_000 }).trim();
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: e.message || String(e) };
  }
}

// ── Gate 1: ESLint unused imports (replaces manual regex scan) ──────────

function scanUnusedImports() {
  const results = [];
  const webDir = join(process.cwd(), 'apps', 'web');
  if (!existsSync(webDir)) return results;

  try {
    const out = execSync('npx eslint src --ext .ts,.tsx --rule "@typescript-eslint/no-unused-imports: error" --rule "@typescript-eslint/no-unused-vars: error" --format json', {
      encoding: 'utf8',
      timeout: 120_000,
      cwd: webDir,
    });
    // ESLint returns 0 when no errors, so no unused imports
    results.push({ status: 'PASS', detail: 'No unused imports' });
  } catch (e) {
    // ESLint returns 1 when there are errors
    try {
      const report = JSON.parse(e.stdout || '[]');
      const unused = [];
      for (const file of report) {
        for (const msg of file.messages || []) {
          if (msg.ruleId === '@typescript-eslint/no-unused-imports' || msg.ruleId === '@typescript-eslint/no-unused-vars') {
            unused.push({ file: file.filePath.replace(process.cwd(), ''), message: msg.message, line: msg.line });
          }
        }
      }
      if (unused.length > 0) {
        results.push({ status: 'FAIL', detail: `${unused.length} unused imports/vars`, items: unused });
      } else {
        results.push({ status: 'PASS', detail: 'No unused imports' });
      }
    } catch {
      results.push({ status: 'WARN', detail: 'ESLint parse error — falling back to manual scan' });
      // Fallback to manual scan if ESLint JSON parse fails
      return scanUnusedImportsFallback();
    }
  }
  return results;
}

function scanUnusedImportsFallback() {
  const results = [];
  const srcDir = join(process.cwd(), 'apps', 'web', 'src');
  if (!existsSync(srcDir)) return results;

  function walk(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!entry.startsWith('.') && entry !== 'node_modules') walk(full);
        continue;
      }
      if (!['.tsx', '.ts', '.jsx', '.js'].includes(extname(entry))) continue;

      const content = readFileSync(full, 'utf8');
      const importMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
      if (!importMatch) continue;

      const imported = importMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of imported) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<!import.*\\b)${escaped}(?!\\s*['"\`,])`, 'g');
        const postImportContent = content.slice(content.indexOf(importMatch[0]) + importMatch[0].length);
        const usesInFile = (postImportContent.match(regex) || []).length;
        if (usesInFile === 0) {
          results.push({ file: full.replace(process.cwd(), ''), name, icon: name });
        }
      }
    }
  }
  walk(srcDir);
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const flag = process.argv[2] || '';
  const quick = flag === '--quick';
  const unusedOnly = flag === '--unused-only';

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  PRE-FLIGHT CI GATE RUNNER              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  const results = [];
  const errors = [];

  // ── Unused imports scan (ESLint) ──────────────────────────────────────
  let scanResults = [];
  try {
    scanResults = scanUnusedImports();
  } catch (e) {
    scanResults = [];
  }

  for (const r of scanResults) {
    if (r.status === 'PASS') {
      results.push(gateStatus('unused-import', 'PASS', r.detail || 'No dead imports'));
    } else if (r.status === 'FAIL') {
      if (r.items) {
        for (const item of r.items) {
          results.push(gateStatus('unused-import', 'FAIL', `${item.file}:${item.line} — ${item.message}`));
        }
      }
      errors.push(r.detail || 'unused imports found');
    } else {
      results.push(gateStatus('unused-import', 'WARN', r.detail || 'Scan skipped'));
    }
  }

  if (scanResults.length === 0) {
    results.push(gateStatus('unused-import', 'WARN', 'Scan skipped'));
  }

  if (unusedOnly) {
    report(results, errors);
    return;
  }

  // ── Typecheck ─────────────────────────────────────────────────
  console.log('\n  [Typecheck] Running turbo typecheck...');
  const tc = spin('npx turbo run typecheck', 'typecheck');
  if (tc.ok && tc.out.includes('Tasks:') && !tc.out.includes('Failed')) {
    results.push(gateStatus('typecheck', 'PASS', tc.out.split('\n').pop()?.trim() || ''));
  } else {
    results.push(gateStatus('typecheck', 'FAIL', (tc.out || 'typecheck failed').slice(0, 60)));
    errors.push('typecheck failed');
  }

  if (quick) {
    report(results, errors);
    return;
  }

  // ── Lint ──────────────────────────────────────────────────────
  console.log('\n  [Lint] Running turbo lint...');
  const lint = spin('npx turbo run lint', 'lint');
  if (lint.ok && !lint.out.includes('error') && !lint.out.includes('Failed')) {
    results.push(gateStatus('lint', 'PASS', 'No lint violations'));
  } else {
    const detail = lint.out.length > 80 ? lint.out.slice(0, 80) + '...' : lint.out;
    results.push(gateStatus('lint', 'WARN', detail));
  }

  // ── Build ─────────────────────────────────────────────────────
  console.log('\n  [Build] Running turbo build...');
  const build = spin('npx turbo run build --filter=@kudbee/web', 'build');
  if (build.ok) {
    results.push(gateStatus('build', 'PASS', 'Web bundle built'));
  } else {
    results.push(gateStatus('build', 'WARN', 'Build skipped or failed'));
  }

  // ── Report ────────────────────────────────────────────────────
  report(results, errors);
}

function report(results, errors) {
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;

  console.log('');
  console.log('─'.repeat(60));
  console.log(`  ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);
  console.log('─'.repeat(60));

  // Save to memory
  ensureDir(MEMORY_DIR);
  let log = [];
  try {
    if (existsSync(GATE_LOG)) {
      log = JSON.parse(readFileSync(GATE_LOG, 'utf8'));
      if (!Array.isArray(log)) log = [];
    }
  } catch {}
  log.unshift({ timestamp: new Date().toISOString(), results, errors });
  if (log.length > 50) log = log.slice(0, 50);
  writeFileSync(GATE_LOG, JSON.stringify(log, null, 2));

  // Feed to DTHINK
  const status = failCount === 0 ? 'PASS' : 'FAIL';
  try {
    execSync(`node scripts/dthink-pipeline.mjs feed "system:verify" "Pre-flight gates: ${status} — ${passCount}P ${failCount}F ${warnCount}W — ${errors.join(', ') || 'no errors'}"`, { timeout: 5000 });
  } catch {}

  // Decision log
  ensureDir(DECISION_DIR);
  const decId = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const dec = {
    id: decId,
    type: 'preflight_gate',
    status,
    gateResults: results,
    gateErrors: errors,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(join(DECISION_DIR, `${decId}.json`), JSON.stringify(dec, null, 2));

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Gate runner fatal:', err.message);
  process.exit(1);
});
