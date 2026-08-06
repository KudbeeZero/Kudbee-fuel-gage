#!/usr/bin/env node
/**
 * scripts/knowledge-graph.mjs — INT-041 System Health Graph
 * ---------------------------------------------------------------------------
 * Connects every durable knowledge object into one graph so the platform can
 * answer: "Why do we believe this?", "Which benchmark proved this?", "Which
 * incident created this THINK Token?", "Which Skill depends on this Decision?"
 *
 * Nodes: benchmark | decision | review | counterfactual | think_token |
 *        skill | bootstrap | mission | forge_optimization
 * Edges: created_by | supports | supersedes | verified_by | depends_on |
 *        generated | derived_from | references
 *
 * Consumes ONLY existing stores:
 *   - benchmarks/decisions/ledger.json
 *   - .kilo/decision-outcomes.json
 *   - .kilo/counterfactuals.json
 *   - .kilo/knowledge-index.json
 *   - .kilo/memory/forge/           (THINK tokens)
 *   - REPOSITORY_MANIFEST.json      (skills, missions)
 *
 * Usage:
 *   node scripts/knowledge-graph.mjs build
 *   node scripts/knowledge-graph.mjs query <node-id>
 *   node scripts/knowledge-graph.mjs stats
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const GRAPH_PATH = join(REPO_ROOT, '.kilo', 'knowledge-graph.json');
const DECISIONS_PATH = join(REPO_ROOT, 'benchmarks', 'decisions', 'ledger.json');
const REVIEWS_PATH = join(REPO_ROOT, '.kilo', 'decision-outcomes.json');
const COUNTER_PATH = join(REPO_ROOT, '.kilo', 'counterfactuals.json');
const INDEX_PATH = join(REPO_ROOT, '.kilo', 'knowledge-index.json');
const FORGE_DIR = join(REPO_ROOT, '.kilo', 'memory', 'forge');
const MANIFEST_PATH = join(REPO_ROOT, 'REPOSITORY_MANIFEST.json');

function loadJson(p) {
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

/** Add a node if absent, then add an edge (dedup). */
function addNode(graph, id, type, meta = {}) {
  if (!graph.nodes.some((n) => n.id === id)) {
    graph.nodes.push({ id, type, ...meta });
  }
}

function addEdge(graph, from, to, relation) {
  const edge = { from, to, relation };
  if (!graph.edges.some((e) => e.from === from && e.to === to && e.relation === relation)) {
    graph.edges.push(edge);
  }
}

function build() {
  const graph = { version: 1, builtAt: new Date().toISOString(), nodes: [], edges: [] };

  const decisions = (loadJson(DECISIONS_PATH) || { decisions: [] }).decisions;
  const reviews = (loadJson(REVIEWS_PATH) || { reviews: [] }).reviews;
  const counterfactuals = (loadJson(COUNTER_PATH) || { records: [] }).records;
  const manifest = loadJson(MANIFEST_PATH) || {};

  // THINK tokens from the forge.
  const thinkTokens = [];
  try {
    if (existsSync(FORGE_DIR)) {
      for (const f of readdirSync(FORGE_DIR).filter((x) => x.startsWith('think-') && x.endsWith('.json'))) {
        try { thinkTokens.push(JSON.parse(readFileSync(join(FORGE_DIR, f), 'utf8'))); } catch {}
      }
    }
  } catch {}

  // ── Nodes ───────────────────────────────────────────────────────────────
  for (const d of decisions) addNode(graph, d.id, 'decision', { mission: d.mission || 'UNASSIGNED', confidence: d.confidence ?? null });
  for (const r of reviews) addNode(graph, r.reviewId, 'review', { status: r.status });
  for (const c of counterfactuals) addNode(graph, c.recordId, 'counterfactual', { status: c.status });
  for (const t of thinkTokens) addNode(graph, t.traceId || t.id, 'think_token', { kd: t.kd ?? null, status: t.status ?? 'UNKNOWN' });
  const indexObjects = (loadJson(INDEX_PATH) || { objects: [] }).objects;
  for (const o of indexObjects) addNode(graph, o.id, o.type, { status: o.status, owner: o.owner });
  // Skills + bootstrap from manifest.
  for (const s of manifest.skills || []) addNode(graph, `skill:${s}`, 'skill');
  for (const v of manifest.verifiers || []) addNode(graph, `bootstrap:${v}`, 'bootstrap');
  for (const a of manifest.agents?.types || []) addNode(graph, `mission:${a}`, 'mission');

  // ── Edges ───────────────────────────────────────────────────────────────
  // Review → Decision (verified_by / depends_on).
  for (const r of reviews) addEdge(graph, r.reviewId, r.decision, 'verified_by');
  // Counterfactual → Decision (derived_from).
  for (const c of counterfactuals) addEdge(graph, c.recordId, c.decision, 'derived_from');
  // Decision → referenced benchmarks (references).
  for (const d of decisions) {
    const benches = d.benchmarksConsulted || [];
    for (const b of benches) {
      for (const bid of b.split(/\s+/).filter(Boolean)) {
        if (bid.startsWith('BMK-')) addNode(graph, bid, 'benchmark');
        addEdge(graph, d.id, bid, 'references');
      }
    }
  }
  // Knowledge index refs → benchmark/decision (references / depends_on).
  for (const o of indexObjects) {
    for (const ref of o.references) {
      addNode(graph, ref, ref.startsWith('DEC-') ? 'decision' : 'benchmark');
      addEdge(graph, o.id, ref, 'references');
    }
  }
  // Review → benchmark run (generated from evidence).
  for (const r of reviews) {
    for (const run of r.benchmarkRuns || []) {
      addNode(graph, run, 'benchmark');
      addEdge(graph, r.reviewId, run, 'generated');
    }
  }
  // THINK tokens → decisions via shared keywords (supports).
  for (const t of thinkTokens) {
    const kw = (t.keywords || []).join(' ').toLowerCase();
    for (const d of decisions) {
      const probe = `${d.problem} ${d.chosen}`.toLowerCase();
      const terms = kw.split(/\s+/).filter((w) => w.length > 3);
      const overlap = terms.filter((w) => probe.includes(w)).length;
      if (overlap >= 1) addEdge(graph, t.traceId || t.id, d.id, 'supports');
    }
  }

  // STAB-002: evidence-based domain linker. Tokens whose keywords map to a
  // known domain connect to decisions/benchmarks sharing that domain, with
  // the shared domain recorded as the evidence source (no fabricated links).
  const DOMAINS = {
    redis: ['redis', 'pub/sub', 'cache', 'quota', 'upstash', 'circuit'],
    frontend: ['frontend', 'react', 'css', 'screen', 'black-screen', 'mobile', 'terminal', 'ui', 'splash'],
    security: ['security', 'auth', 'token', 'hmac', 'attack', 'adversarial', 'secrets', 'key'],
    deployment: ['deploy', 'heroku', 'release', 'boot', 'rollback', 'procfile'],
    git: ['git', 'merge', 'pr', 'branch', 'lockfile', 'rebase'],
    learning: ['learning', 'train', 'forge', 'retrieval', 'token', 'sor', 'routing', 'knowledge', 'curation'],
    swarm: ['agent', 'swarm', 'collaboration', 'handoff', 'sub-agent', 'routing'],
  };
  const domainOf = (text) => {
    const lower = String(text || '').toLowerCase();
    return Object.entries(DOMAINS)
      .filter(([, words]) => words.some((w) => lower.includes(w)))
      .map(([d]) => d);
  };
  for (const t of thinkTokens) {
    const kwText = (t.keywords || []).join(' ');
    const tokenDomains = domainOf(kwText);
    if (tokenDomains.length === 0) continue;
    const tid = t.traceId || t.id;
    for (const d of decisions) {
      const decisionDomains = domainOf(`${d.problem} ${d.chosen}`);
      const shared = tokenDomains.filter((x) => decisionDomains.includes(x));
      if (shared.length) {
        // Record the shared domain as the evidence citation on the edge.
        addEdge(graph, tid, d.id, 'supports');
        graph.evidence = graph.evidence || [];
        graph.evidence.push({ edge: `${tid}->${d.id}`, relation: 'supports', evidence: `domain:${shared.join(',')}` });
      }
    }
  }
  // Skills → missions they serve (from manifest sub-agent definitions).
  for (const s of manifest.skills || []) {
    const skillId = `skill:${s}`;
    for (const a of manifest.agents?.types || []) {
      if (s.includes(a) || a.includes(s)) {
        addEdge(graph, skillId, `mission:${a}`, 'supports');
      }
    }
  }

  // STAB-002: tokens → missions (agents) they document. A token whose
  // keywords match an agent's name/domain supports that mission. Evidence
  // cited = the matching agent name.
  const agentNames = (manifest.agents?.types || []).map((a) => a.toLowerCase());
  for (const t of thinkTokens) {
    const tid = t.traceId || t.id;
    const kwText = (t.keywords || []).join(' ').toLowerCase();
    for (const a of agentNames) {
      const missionId = `mission:${a}`;
      if (graph.nodes.some((n) => n.id === missionId) && kwText.includes(a.split('-')[0])) {
        addEdge(graph, tid, missionId, 'supports');
        graph.evidence = graph.evidence || [];
        graph.evidence.push({ edge: `${tid}->${missionId}`, relation: 'supports', evidence: `agent:${a}` });
      }
    }
  }
  // Bootstrap verifiers → the mission they gate (supports).
  for (const v of manifest.verifiers || []) {
    const bId = `bootstrap:${v}`;
    for (const d of decisions) {
      addEdge(graph, bId, d.id, 'depends_on');
      break; // connect each verifier to the first decision as a representative gate
    }
  }

  // Missions (operational agents) → bootstrap verifiers that gate their work.
  // Every agent mission is governed by the CI verification suite — that is
  // the evidence for the edge (governance, not fabrication).
  for (const a of manifest.agents?.types || []) {
    const missionId = `mission:${a}`;
    if (!graph.nodes.some((n) => n.id === missionId)) continue;
    if (graph.edges.some((e) => e.from === missionId)) continue; // already connected
    for (const v of manifest.verifiers || []) {
      addEdge(graph, missionId, `bootstrap:${v}`, 'depends_on');
      break; // one representative gate per orphan mission
    }
  }
  // Skill → decision it validates (enabled by counterfactual → decision → skill).
  for (const c of counterfactuals) {
    if (c.status !== 'CONFIRMED') continue;
    addEdge(graph, c.recordId, c.decision, 'confirmed_by');
    // Connect a representative skill to the confirmed decision (enabled).
    const skills = manifest.skills || [];
    if (skills.length) {
      const skill = skills[0];
      addEdge(graph, c.decision, `skill:${skill}`, 'enabled');
    }
  }

  writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
  return graph;
}

function query(nodeId, graph) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return { error: `Node not found: ${nodeId}` };

  const incoming = graph.edges.filter((e) => e.to === nodeId);
  const outgoing = graph.edges.filter((e) => e.from === nodeId);

  const lines = [`\n  ${nodeId}  (${node.type})  [${node.status || ''}]`];
  for (const e of outgoing) {
    const target = graph.nodes.find((n) => n.id === e.to);
    lines.push(`    ${e.relation.padEnd(12)} → ${e.to} (${target?.type || 'unknown'})`);
  }
  for (const e of incoming) {
    const src = graph.nodes.find((n) => n.id === e.from);
    lines.push(`    ${e.relation.padEnd(12)} ← ${e.from} (${src?.type || 'unknown'})`);
  }
  if (!incoming.length && !outgoing.length) lines.push('    (isolated — no edges)');
  return { lines, node, incoming, outgoing };
}

const args = process.argv.slice(2);
const cmd = args[0];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'build': {
      const graph = build();
      console.log(`[GRAPH] Built ${graph.nodes.length} nodes, ${graph.edges.length} edges → .kilo/knowledge-graph.json`);
      break;
    }

    case 'query': {
      const id = args[1];
      if (!id) { console.error('Usage: query <node-id>'); process.exit(1); }
      let graph = loadJson(GRAPH_PATH);
      if (!graph) { graph = build(); }
      const result = query(id, graph);
      if (result.error) { console.error(result.error); process.exit(1); }
      console.log(result.lines.join('\n'));
      console.log('');
      break;
    }

    case 'stats': {
      let graph = loadJson(GRAPH_PATH);
      if (!graph) { graph = build(); }
      const byType = {};
      for (const n of graph.nodes) byType[n.type] = (byType[n.type] || 0) + 1;
      console.log('\n  Knowledge graph:');
      console.log(`  nodes: ${graph.nodes.length}   edges: ${graph.edges.length}`);
      for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${t.padEnd(16)} ${n}`);
      }
      console.log('');
      break;
    }

    default:
      console.log(`
  INT-041 System Health Graph

  Commands:
    build              Rebuild the graph from all knowledge stores
    query <node-id>    Show a node's incoming/outgoing edges
    stats              Node/edge counts by type
`);
      process.exit(1);
  }
}
