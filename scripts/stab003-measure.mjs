#!/usr/bin/env node
/**
 * scripts/stab003-measure.mjs — STAB-003 Repository Complexity Baseline
 * ---------------------------------------------------------------------------
 * Produces engineering-complexity.json — the measured baseline for the
 * Repository Simplification Sprint. Every consolidation target is measured
 * BEFORE anything is touched.
 *
 * Usage:
 *   node scripts/stab003-measure.mjs            # write engineering-complexity.json
 *   node scripts/stab003-measure.mjs --json     # print to stdout
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_PATH = join(REPO_ROOT, 'engineering-complexity.json');

function walk(dir, exts, depth = 0, out = []) {
  if (depth > 5) return out;
  let entries;
  try { entries = readdirSync(join(REPO_ROOT, dir)); } catch { return out; }
  for (const f of entries) {
    if (['node_modules', '.git', 'dist', 'build', '.turbo', '.next', '.cache'].includes(f)) continue;
    const p = join(dir, f);
    try {
      if (statSync(join(REPO_ROOT, p)).isDirectory()) walk(p, exts, depth + 1, out);
      else if (exts.some((e) => f.endsWith(e))) out.push(p);
    } catch {}
  }
  return out;
}

function countExt(exts) {
  return walk('.', exts).length;
}

function measure() {
  const pkg = (() => {
    try { return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')); } catch { return {}; }
  })();

  const sourceFiles = walk('.', ['.mjs', '.js', '.ts', '.tsx']);
  const scripts = walk('scripts', ['.mjs', '.js', '.ts']);
  const mdDocs = walk('.', ['.md']);
  const workflows = (() => {
    try { return readdirSync(join(REPO_ROOT, '.github', 'workflows')).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')); } catch { return []; }
  })();
  const memoryStores = (() => {
    try { return readdirSync(join(REPO_ROOT, '.kilo', 'memory')); } catch { return []; }
  })();
  const terminalCommands = (() => {
    try {
      const raw = readFileSync(join(REPO_ROOT, 'services', 'terminal', 'commandDispatcher.mjs'), 'utf8');
      const matches = raw.matchAll(/\/([a-z][a-z0-9-]+)/g);
      return [...new Set([...matches].map((m) => m[1]))].filter((c) => c.length > 1);
    } catch { return []; }
  })();

  return {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      total: sourceFiles.length,
      jsTs: sourceFiles.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')).length,
      mjsJs: sourceFiles.filter((f) => f.endsWith('.mjs') || f.endsWith('.js')).length,
    },
    scripts: scripts.length,
    cliCommands: Object.keys(pkg.scripts || {}).length,
    githubWorkflows: workflows.length,
    markdownDocs: mdDocs.length,
    topLevelDocs: mdDocs.filter((f) => !f.includes('/')).length,
    knowledgeStores: memoryStores.length,
    terminalCommands: terminalCommands.length,
    nodeDependencies: Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length,
    packageSizeKb: Math.round((statSync(join(REPO_ROOT, 'package.json')).size || 0) / 1024),
    bootstrapKb: (() => {
      try { return Math.round(statSync(join(REPO_ROOT, 'AGENTS.md')).size / 1024); } catch { return 0; }
    })(),
    graph: (() => {
      try {
        const g = JSON.parse(readFileSync(join(REPO_ROOT, '.kilo', 'knowledge-graph.json'), 'utf8'));
        return { nodes: g.nodes.length, edges: g.edges.length };
      } catch { return { nodes: 0, edges: 0 }; }
    })(),
    // 10% file / 15% script / 30% doc reduction targets (STAB-003 acceptance).
    targets: {
      files_10pct: Math.round(sourceFiles.length * 0.1),
      scripts_15pct: Math.round(scripts.length * 0.15),
      docs_30pct: Math.round(mdDocs.length * 0.3),
      bootstrap_25pct: Math.round(((statSync(join(REPO_ROOT, 'AGENTS.md')).size || 0) / 1024) * 0.25),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = measure();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log('\n  ┌────────────────────────────────────────────────────┐');
    console.log('  │  STAB-003 — REPOSITORY COMPLEXITY BASELINE         │');
    console.log('  └────────────────────────────────────────────────────┘');
    console.log(`  Source files     ${String(report.sourceFiles.total).padEnd(10)} (${report.sourceFiles.jsTs} ts/tsx, ${report.sourceFiles.mjsJs} js/mjs)`);
    console.log(`  Scripts          ${String(report.scripts).padEnd(10)} in scripts/`);
    console.log(`  CLI commands     ${String(report.cliCommands).padEnd(10)} package.json`);
    console.log(`  Workflows        ${String(report.githubWorkflows).padEnd(10)} GitHub Actions`);
    console.log(`  Markdown docs    ${String(report.markdownDocs).padEnd(10)} (${report.topLevelDocs} top-level)`);
    console.log(`  Knowledge stores ${String(report.knowledgeStores).padEnd(10)} .kilo/memory`);
    console.log(`  Terminal cmds    ${String(report.terminalCommands).padEnd(10)} dispatcher`);
    console.log(`  Dependencies     ${String(report.nodeDependencies).padEnd(10)} top-level`);
    console.log(`  Bootstrap        ${String(report.bootstrapKb).padEnd(10)} KB (AGENTS.md)`);
    console.log(`  Graph            ${String(report.graph.nodes).padEnd(10)} nodes / ${report.graph.edges} edges`);
    console.log('  ─────────────────────────────────────────────────────');
    console.log(`  TARGETS: 10% files=${report.targets.files_10pct}  15% scripts=${report.targets.scripts_15pct}  30% docs=${report.targets.docs_30pct}`);
    console.log('  └────────────────────────────────────────────────────┘\n');
    console.log(`[STAB-003] baseline written to engineering-complexity.json\n`);
  }
}
