#!/usr/bin/env node
/**
 * scripts/graph-builder.mjs — DTHINK Graph Builder (DGE-1)
 * Auto-creates graph nodes from DTHINK events, decisions, and EDRs.
 * Never mutates. Corrections create new nodes with SUPERSEDES edges.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const GRAPH_FILE = join(ROOT, '.kilo', 'memory', 'graph.json');
const STREAM_FILE = join(ROOT, '.kilo', 'memory', 'dthink', 'stream.jsonl');
const DECISIONS_DIR = join(ROOT, '.kilo', 'memory', 'decisions');

function loadGraph() {
  if (!existsSync(GRAPH_FILE)) return { nodes: {}, edges: [] };
  return JSON.parse(readFileSync(GRAPH_FILE, 'utf8'));
}

function saveGraph(g) {
  writeFileSync(GRAPH_FILE, JSON.stringify(g, null, 2), 'utf8');
}

function nodeId(type, id) {
  return `${type}:${id}`;
}

function addNode(g, type, id, data) {
  const nid = nodeId(type, id);
  if (g.nodes[nid]) return g; // immutable — never overwrite
  g.nodes[nid] = { type, id, ...data, created: new Date().toISOString() };
  return g;
}

function addEdge(g, from, to, relationship, meta = {}) {
  const fid = typeof from === 'string' ? from : nodeId(from.type, from.id);
  const tid = typeof to === 'string' ? to : nodeId(to.type, to.id);
  const existing = g.edges.find(e => e.from === fid && e.to === tid && e.relationship === relationship);
  if (existing) return g; // deduplicate
  g.edges.push({
    from: fid, to: tid, relationship,
    valid_from: new Date().toISOString(), valid_to: null,
    confidence: meta.confidence || 100,
    source: meta.source || 'graph-builder'
  });
  return g;
}

function buildFromStream() {
  let g = loadGraph();
  const stream = readFileSync(STREAM_FILE, 'utf8').split('\n').filter(Boolean);
  
  for (const line of stream) {
    try {
      const evt = JSON.parse(line);
      const eid = evt.id || `evt-${evt.timestamp}`;
      g = addNode(g, 'event', eid, {
        type: evt.type, agent: evt.agentId, summary: evt.summary,
        timestamp: evt.timestamp, evidence: evt.data?.evidenceLevel || 3
      });
      // Link to mission
      const msnId = evt.mission || evt.data?.mission || 'active';
      g = addNode(g, 'mission', msnId, { name: msnId });
      g = addEdge(g, { type: 'event', id: eid }, { type: 'mission', id: msnId }, 'DEPENDS_ON', { confidence: 90 });
    } catch {}
  }
  saveGraph(g);
  return g;
}

function buildFromDecisions() {
  let g = loadGraph();
  if (!existsSync(DECISIONS_DIR)) return g;
  for (const f of readdirSync(DECISIONS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const d = JSON.parse(readFileSync(join(DECISIONS_DIR, f), 'utf8'));
      // EDRs use the edr- prefix
      if (d.id && d.id.startsWith('edr-')) {
        g = addNode(g, 'decision', d.id, {
          objective: d.intent?.objective || d.summary,
          choice: d.decision?.choice || d.status,
          confidence: d.evidence?.confidence || 80,
          timestamp: d.timestamp
        });
        // Link to mission
        const msnId = d.mission || 'active';
        g = addNode(g, 'mission', msnId, { name: msnId });
        g = addEdge(g, { type: 'decision', id: d.id }, { type: 'mission', id: msnId }, 'DEPENDS_ON');
        // Link gates
        if (d.governance?.gates_failed) {
          for (const gate of d.governance.gates_failed) {
            g = addNode(g, 'gate', gate, { status: 'FAILED' });
            g = addEdge(g, { type: 'decision', id: d.id }, { type: 'gate', id: gate }, 'BLOCKED_BY');
          }
        }
        if (d.governance?.gates_passed) {
          for (const gate of d.governance.gates_passed) {
            g = addNode(g, 'gate', gate, { status: 'PASSED' });
            g = addEdge(g, { type: 'decision', id: d.id }, { type: 'gate', id: gate }, 'VERIFIED_BY');
          }
        }
      }
    } catch {}
  }
  saveGraph(g);
  return g;
}

function queryGraph(g, question) {
  const results = [];
  const q = question.toLowerCase();
  
  // "why blocked?"
  if (q.includes('blocked') && (q.includes('pr') || q.includes('promotion'))) {
    for (const e of g.edges) {
      if (e.relationship === 'BLOCKED_BY') {
        const from = g.nodes[e.from];
        const to = g.nodes[e.to];
        results.push(`${from?.summary || from?.id || e.from} BLOCKED_BY ${e.to} (${to?.status || '?'})`);
      }
    }
  }
  
  // Stats
  results.push(`Nodes: ${Object.keys(g.nodes).length} | Edges: ${g.edges.length}`);
  return results;
}

// --- CLI ---
const cmd = process.argv[2] || 'build';
if (cmd === 'build') {
  let g = buildFromStream();
  g = buildFromDecisions();
  console.log(`Graph: ${Object.keys(g.nodes).length} nodes, ${g.edges.length} edges`);
  const blocked = g.edges.filter(e => e.relationship === 'BLOCKED_BY');
  if (blocked.length) {
    console.log(`\nBlocked relationships:`);
    for (const e of blocked) console.log(`  ${e.from} BLOCKED_BY ${e.to}`);
  }
} else if (cmd === 'query') {
  const q = process.argv.slice(3).join(' ');
  const g = loadGraph();
  queryGraph(g, q).forEach(r => console.log(r));
} else if (cmd === 'stats') {
  const g = loadGraph();
  const types = {};
  for (const [id, n] of Object.entries(g.nodes)) { types[n.type] = (types[n.type] || 0) + 1; }
  console.log('Node types:');
  for (const [t, c] of Object.entries(types)) console.log(`  ${t}: ${c}`);
  const rels = {};
  for (const e of g.edges) { rels[e.relationship] = (rels[e.relationship] || 0) + 1; }
  console.log('\nRelationships:');
  for (const [r, c] of Object.entries(rels)) console.log(`  ${r}: ${c}`);
}
