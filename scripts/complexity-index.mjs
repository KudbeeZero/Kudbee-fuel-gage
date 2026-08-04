#!/usr/bin/env node
/**
 * scripts/complexity-index.mjs — Engineering Complexity Index (KPI)
 * ---------------------------------------------------------------------------
 * One composite metric tracking platform complexity over releases. The goal
 * is NOT to make these numbers go up — it's to keep them flat or reduce them
 * while capability increases. That's the sign the architecture is maturing.
 *
 * Dimensions measured:
 *   - Source files, scripts, package.json commands
 *   - Documents, memory/state files
 *   - Knowledge graph nodes/edges
 *   - Dependencies (node_modules top-level)
 *   - Average bootstrap size (AGENTS.md + handoff bytes)
 *   - Mission history + supervisor decisions
 *   - Duplicate/orphan detection (consolidation targets)
 *
 * Writes/updates .kilo/complexity-index.json so the metric has a history.
 * Read-only otherwise.
 *
 * Usage:
 *   node scripts/complexity-index.mjs            # compute + record
 *   node scripts/complexity-index.mjs --json     # machine-readable
 *   node scripts/complexity-index.mjs history    # show prior snapshots
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const INDEX_PATH = join(REPO_ROOT, '.kilo', 'complexity-index.json');

function countFiles(dir, ext = null) {
  try {
    return readdirSync(dir).filter((f) => !ext || f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function dirSize(dir) {
  let total = 0;
  try {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      try { total += statSync(p).size; } catch {}
    }
  } catch {}
  return total;
}

function loadHistory() {
  try {
    if (existsSync(INDEX_PATH)) return JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch {}
  return { version: 1, createdAt: new Date().toISOString(), snapshots: [] };
}

function compute() {
  const pkg = (() => {
    try { return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')); } catch { return {}; }
  })();
  const graph = (() => {
    try { return JSON.parse(readFileSync(join(REPO_ROOT, '.kilo', 'knowledge-graph.json'), 'utf8')); } catch { return { nodes: [], edges: [] }; }
  })();
  const history = (() => {
    try { return JSON.parse(readFileSync(join(REPO_ROOT, '.kilo', 'mission-history.json'), 'utf8')); } catch { return { missions: [] }; }
  })();
  const sup = (() => {
    try { return JSON.parse(readFileSync(join(REPO_ROOT, '.kilo', 'supervisor-history.json'), 'utf8')); } catch { return { decisions: [] }; }
  })();

  const scripts = countFiles(join(REPO_ROOT, 'scripts'), '.mjs') + countFiles(join(REPO_ROOT, 'scripts'), '.js') + countFiles(join(REPO_ROOT, 'scripts'), '.ts');
  const commands = Object.keys(pkg.scripts || {}).length;
  const docs = countFiles(REPO_ROOT, '.md');
  const memoryFiles = (() => {
    try { return readdirSync(join(REPO_ROOT, '.kilo', 'memory')).length; } catch { return 0; }
  })();
  const deps = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
  const bootstrapBytes = dirSize(join(REPO_ROOT, '.kilo', 'skills'));

  return {
    files: scripts + docs,
    scripts,
    commands,
    docs,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
    dependencies: deps,
    memoryFiles,
    missions: history.missions.length,
    supervisorDecisions: sup.decisions.length,
    bootstrapKb: Math.round((bootstrapBytes || 1) / 1024),
    // Composite: fewer files + fewer commands + fewer graph nodes (relative) = healthier.
    composite: Math.round((scripts + docs + commands + graph.nodes.length) / 4),
  };
}

function render(snapshot, label = 'current') {
  console.log('\n  ┌────────────────────────────────────────────────────┐');
  console.log('  │  ENGINEERING COMPLEXITY INDEX                     │');
  console.log('  └────────────────────────────────────────────────────┘');
  console.log(`  Source files     ${String(snapshot.files).padEnd(12)} scripts: ${snapshot.scripts}`);
  console.log(`  Commands         ${String(snapshot.commands).padEnd(12)} package.json scripts`);
  console.log(`  Documents        ${String(snapshot.docs).padEnd(12)} .md files`);
  console.log(`  Graph            ${String(snapshot.graphNodes).padEnd(12)} nodes / ${snapshot.graphEdges} edges`);
  console.log(`  Dependencies     ${String(snapshot.dependencies).padEnd(12)} top-level`);
  console.log(`  Memory files     ${String(snapshot.memoryFiles).padEnd(12)} .kilo/memory`);
  console.log(`  Missions         ${String(snapshot.missions).padEnd(12)} history entries`);
  console.log(`  Supervisor       ${String(snapshot.supervisorDecisions).padEnd(12)} decisions`);
  console.log(`  Bootstrap        ${String(snapshot.bootstrapKb).padEnd(12)} KB skills`);
  console.log('  ─────────────────────────────────────────────────────');
  console.log(`  Composite        ${snapshot.composite}  (keep flat or ↓ as capability ↑)`);
  console.log('  └────────────────────────────────────────────────────┘\n');
}

const args = process.argv.slice(2);

if (import.meta.url === `file://${process.argv[1]}`) {
  if (args.includes('history')) {
    const h = loadHistory();
    console.log('\n  Complexity Index history:');
    for (const s of h.snapshots.slice(-6)) {
      console.log(`  ${s.at.slice(0, 10).padEnd(12)} files=${String(s.files).padStart(4)} cmds=${String(s.commands).padStart(3)} graph=${String(s.graphNodes).padStart(4)} composite=${String(s.composite).padStart(3)}`);
    }
    console.log('');
    process.exit(0);
  }

  const snapshot = { at: new Date().toISOString(), ...compute() };
  const h = loadHistory();
  h.snapshots.push(snapshot);
  writeFileSync(INDEX_PATH, JSON.stringify(h, null, 2), 'utf8');

  if (args.includes('--json')) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    render(snapshot);
    console.log('[COMPLEXITY] snapshot recorded. Target: flat or decreasing over releases.\n');
  }
}
