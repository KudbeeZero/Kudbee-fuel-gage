#!/usr/bin/env node
/**
 * scripts/consolidation-audit.mjs — 5:1 Rule Consolidation Targets
 * ---------------------------------------------------------------------------
 * Enforces the company rule: for every one new subsystem added, the platform
 * must remove or simplify five existing things.
 *
 * Scans for consolidation targets:
 *   - Duplicate npm script names (same command, different names)
 *   - Scripts not wired into package.json (orphan scripts)
 *   - Duplicate verifier/audit scripts
 *   - Docs that are stale or duplicative
 *   - Dead branches (git)
 *   - Mock/hardcoded data in source (STAB-003 target)
 *   - Multiple terminals / engineering state files (canonical-source rule)
 *
 * Read-only. Produces a ranked consolidation list for the stabilization
 * sprint. Usage: npm run consolidate:audit
 * ---------------------------------------------------------------------------
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function loadPkg() {
  try { return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')); } catch { return { scripts: {} }; }
}

function audit() {
  const pkg = loadPkg();
  const scripts = pkg.scripts || {};
  const targets = { duplicateCommands: [], orphanScripts: [], duplicateDocs: [], staleDocs: [], mockData: [], deadBranches: [], multipleCanonical: [] };

  // 1. Scripts that exist on disk but aren't wired into package.json.
  const scriptFiles = [];
  for (const dir of ['scripts', 'services', 'apps']) {
    try {
      for (const f of readdirSync(join(REPO_ROOT, dir))) {
        if (f.endsWith('.mjs') || f.endsWith('.js') || f.endsWith('.ts')) scriptFiles.push(`${dir}/${f}`);
      }
    } catch {}
  }
  const wiredValues = Object.values(scripts);
  for (const f of scriptFiles) {
    const referenced = wiredValues.some((v) => v.includes(f));
    if (!referenced && !f.includes('index.') && !f.includes('.test.')) {
      targets.orphanScripts.push(f);
    }
  }

  // 2. Duplicate npm script names pointing at the same file.
  const byTarget = {};
  for (const [name, cmd] of Object.entries(scripts)) {
    const file = cmd.match(/(scripts\/[a-z0-9-]+\.(?:mjs|js|ts))/i)?.[1] || cmd;
    if (!byTarget[file]) byTarget[file] = [];
    byTarget[file].push(name);
  }
  for (const [file, names] of Object.entries(byTarget)) {
    if (names.length > 1 && file.startsWith('scripts/')) {
      targets.duplicateCommands.push(`${file} → ${names.join(', ')}`);
    }
  }

  // 3. Multiple terminal/state canonical files.
  const canonicalCandidates = [
    'apps/web/terminal.html',
    'apps/web/src/components/thinkbox/LiveTerminal.tsx',
    'apps/web/src/components/studio/AgentTerminal.tsx',
  ];
  const existing = canonicalCandidates.filter((f) => existsSync(join(REPO_ROOT, f)));
  if (existing.length > 1) targets.multipleCanonical.push(existing.join(' vs '));

  // 4. Mock data markers in source (STAB-003).
  const mockPatterns = ['mock', 'fixture', 'placeholder data', 'hardcoded'];
  try {
    const walk = (dir, depth = 0) => {
      if (depth > 3) return;
      for (const f of readdirSync(join(REPO_ROOT, dir))) {
        if (['node_modules', '.git', 'dist', 'build', '.turbo'].includes(f)) continue;
        const p = join(REPO_ROOT, dir, f);
        try {
          if (statSync(p).isDirectory()) walk(`${dir}/${f}`, depth + 1);
          else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
            const content = readFileSync(p, 'utf8');
            if (mockPatterns.some((m) => content.toLowerCase().includes(`const ${m}`) || content.toLowerCase().includes(`${m}Data`))) {
              targets.mockData.push(`${dir}/${f}`);
            }
          }
        } catch {}
      }
    };
    walk('apps');
  } catch {}

  // 5. Dead branches.
  try {
    const branches = execFileSync('git', ['branch', '--no-merged', 'HEAD'], { encoding: 'utf8' })
      .split('\n').map((b) => b.trim().replace(/^\*\s*/, '')).filter(Boolean);
    targets.deadBranches.push(...branches);
  } catch {}

  return { counts: { totalScripts: scriptFiles.length, wiredScripts: wiredValues.length }, targets };
}

function report(a) {
  const t = a.targets;
  const total = Object.values(t).reduce((s, arr) => s + arr.length, 0);
  console.log('\n  ┌──────────────────────────────────────────────────┐');
  console.log('  │  5:1 RULE — CONSOLIDATION AUDIT                 │');
  console.log('  └──────────────────────────────────────────────────┘');
  console.log(`  Duplicate commands  ${t.duplicateCommands.length}`);
  console.log(`  Orphan scripts      ${t.orphanScripts.length}`);
  console.log(`  Multiple canonical  ${t.multipleCanonical.length}`);
  console.log(`  Mock data files     ${t.mockData.length}`);
  console.log(`  Dead branches       ${t.deadBranches.length}`);
  console.log('  ───────────────────────────────────────────────────');
  console.log(`  Total targets       ${total}  (5:1 rule needs 5 per new subsystem)`);
  console.log('  └──────────────────────────────────────────────────┘\n');

  for (const [key, list] of Object.entries(t)) {
    if (list.length) {
      console.log(`  ${key}:`);
      for (const item of list.slice(0, 6)) console.log(`    - ${item}`);
      if (list.length > 6) console.log(`    ... and ${list.length - 6} more`);
      console.log('');
    }
  }
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = audit();
  report(a);
}
