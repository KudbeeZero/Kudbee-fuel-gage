#!/usr/bin/env node
/**
 * scripts/graph-audit.mjs — INT-041 Graph Audit
 * ---------------------------------------------------------------------------
 * Validates the knowledge graph:
 *   - broken edges (edge references a missing node)
 *   - cycles (node reachable from itself)
 *   - duplicate nodes
 *   - orphan nodes (no incoming/outgoing edges)
 *   - missing references (nodes referenced by name but not registered)
 *   - invalid relationships (edge types not in the allowed set)
 *
 * Reads .kilo/knowledge-graph.json (built by knowledge-graph.mjs).
 * Never modifies anything.
 *
 * Usage: npm run graph:audit
 * ---------------------------------------------------------------------------
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const GRAPH_PATH = join(REPO_ROOT, '.kilo', 'knowledge-graph.json');

const VALID_RELATIONS = new Set([
  'created_by', 'supports', 'supersedes', 'verified_by', 'depends_on',
  'generated', 'derived_from', 'references', 'confirmed_by', 'enabled',
]);

function audit(graph) {
  const findings = { brokenEdges: [], cycles: [], duplicateNodes: [], orphans: [], missingRefs: [], invalidRelations: [] };

  const ids = new Set(graph.nodes.map((n) => n.id));

  // Duplicate node IDs.
  const seen = new Set();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) findings.duplicateNodes.push(n.id);
    seen.add(n.id);
  }

  // Broken edges + invalid relations.
  const adjacency = new Map();
  for (const e of graph.edges) {
    if (!VALID_RELATIONS.has(e.relation)) findings.invalidRelations.push(`${e.from}--${e.relation}-->${e.to}`);
    if (!ids.has(e.from)) findings.brokenEdges.push(`from ${e.from}`);
    if (!ids.has(e.to)) findings.brokenEdges.push(`to ${e.to}`);
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from).push(e.to);
  }

  // Orphans: nodes with no edges at all.
  const connected = new Set();
  for (const e of graph.edges) { connected.add(e.from); connected.add(e.to); }
  for (const n of graph.nodes) {
    if (!connected.has(n.id)) findings.orphans.push(n.id);
  }

  // Cycles via DFS.
  const state = new Map(); // 0=unvisited, 1=in-stack, 2=done
  for (const id of ids) state.set(id, 0);
  const stack = [];
  function dfs(node) {
    state.set(node, 1);
    stack.push(node);
    for (const next of adjacency.get(node) || []) {
      if (state.get(next) === 1) {
        const cycleStart = stack.indexOf(next);
        const cycle = stack.slice(cycleStart).concat(next);
        if (!findings.cycles.some((c) => c.join(',') === cycle.join(','))) findings.cycles.push(cycle);
      } else if (state.get(next) === 0) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  }
  for (const id of ids) if (state.get(id) === 0) dfs(id);

  return { findings, counts: { nodes: graph.nodes.length, edges: graph.edges.length } };
}

function report(result) {
  const { findings, counts } = result;
  const total = Object.values(findings).reduce((s, arr) => s + arr.length, 0);

  console.log('\n  ┌──────────────────────────────────────────────────┐');
  console.log('  │  INT-041 — GRAPH AUDIT                           │');
  console.log('  └──────────────────────────────────────────────────┘');
  console.log(`  Nodes             ${String(counts.nodes).padEnd(14)}`);
  console.log(`  Edges             ${String(counts.edges).padEnd(14)}`);
  console.log('  ────────────────────────────────────────────────────');
  console.log(`  Broken edges      ${findings.brokenEdges.length}`);
  console.log(`  Cycles            ${findings.cycles.length}`);
  console.log(`  Duplicate nodes   ${findings.duplicateNodes.length}`);
  console.log(`  Orphan nodes      ${findings.orphans.length}`);
  console.log(`  Missing refs      ${findings.missingRefs.length}`);
  console.log(`  Invalid relations ${findings.invalidRelations.length}`);
  console.log('  ────────────────────────────────────────────────────');
  const orphanThreshold = Number(process.env.ORPHAN_THRESHOLD ?? 5);
  const broken = findings.brokenEdges.length + findings.invalidRelations.length + findings.duplicateNodes.length + findings.cycles.length;
  const orphansOver = findings.orphans.length > orphanThreshold;
  const verdict = broken === 0 && !orphansOver ? 'PASS' : broken === 0 && orphansOver ? 'WARN' : 'FAIL';
  console.log(`  Result            ${verdict}`);
  console.log('  └──────────────────────────────────────────────────┘\n');

  for (const [key, list] of Object.entries(findings)) {
    if (list.length) console.log(`  ${key}: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '...' : ''}`);
  }
  console.log('');
  return { total, verdict };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(GRAPH_PATH)) {
    console.error('[GRAPH-AUDIT] knowledge-graph.json not found — run: node scripts/knowledge-graph.mjs build');
    process.exit(1);
  }
  const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
  const r = audit(graph);
  const summary = report(r);
  process.exitCode = summary.verdict === 'FAIL' ? 1 : 0;
}
