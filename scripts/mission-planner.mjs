#!/usr/bin/env node
/**
 * scripts/mission-planner.mjs — INT-042 Autonomous Mission Planner
 * ---------------------------------------------------------------------------
 * Wakes up, inspects the entire evidence graph (knowledge graph, decision
 * ledger, outcomes, counterfactuals, benchmark coverage, lifecycle, CI, git,
 * manifest), then produces ONE ranked engineering mission backed entirely by
 * evidence. No roadmap guessing — the evidence chooses the next mission.
 *
 * Candidate missions are derived from recorded evidence findings:
 *   - GRAPH-AUDIT orphan nodes        → connect knowledge
 *   - KNOWLEDGE-AUDIT findings        → lifecycle repair
 *   - BENCHMARK-COVERAGE low domains  → grow benchmark suite
 *   - DECISION ledger gaps            → outcome measurement
 *   - engineering_state.yaml risks    → operational debt
 *   - CI/manifest state               → stability
 *
 * Deterministic: identical inputs → identical output.
 *
 * Usage: npm run mission:next
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreMission } from './mission-score.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const GRAPH_PATH = join(REPO_ROOT, '.kilo', 'knowledge-graph.json');
const DECISIONS_PATH = join(REPO_ROOT, 'benchmarks', 'decisions', 'ledger.json');
const OUTCOMES_PATH = join(REPO_ROOT, '.kilo', 'decision-outcomes.json');
const COUNTER_PATH = join(REPO_ROOT, '.kilo', 'counterfactuals.json');
const INDEX_PATH = join(REPO_ROOT, '.kilo', 'knowledge-index.json');
const QUEUE_PATH = join(REPO_ROOT, '.kilo', 'mission-queue.json');
const MANIFEST_PATH = join(REPO_ROOT, 'REPOSITORY_MANIFEST.json');
const STATE_PATH = join(REPO_ROOT, 'engineering_state.yaml');

function loadJson(p) {
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

function loadYamlState() {
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    const risks = [];
    const lines = raw.split('\n');
    let inRisks = false;
    for (const line of lines) {
      if (line.trim() === 'risks:') { inRisks = true; continue; }
      if (inRisks && /^\s+-\s+/.test(line)) risks.push(line.trim().replace(/^-\s+/, ''));
      if (inRisks && line.trim() && !/^\s+-/.test(line) && !line.startsWith(' ')) inRisks = false;
    }
    const missionMatch = raw.match(/current_mission:\s*(\S+)/);
    return { risks, currentMission: missionMatch ? missionMatch[1] : null };
  } catch {
    return { risks: [], currentMission: null };
  }
}

/** Compute graph orphan count by reading node/edge sets. */
function graphMetrics() {
  const g = loadJson(GRAPH_PATH);
  if (!g) return { nodes: 0, edges: 0, orphans: 0 };
  const connected = new Set();
  for (const e of g.edges) { connected.add(e.from); connected.add(e.to); }
  const orphans = g.nodes.filter((n) => !connected.has(n.id)).length;
  return { nodes: g.nodes.length, edges: g.edges.length, orphans };
}

/** Build candidate missions from recorded evidence. */
function buildCandidates() {
  const candidates = [];

  const graph = graphMetrics();
  const index = loadJson(INDEX_PATH) || { objects: [] };
  const decisions = (loadJson(DECISIONS_PATH) || { decisions: [] }).decisions;
  const reviews = (loadJson(OUTCOMES_PATH) || { reviews: [] }).reviews;
  const counterfactuals = (loadJson(COUNTER_PATH) || { records: [] }).records;
  const manifest = loadJson(MANIFEST_PATH) || {};
  const state = loadYamlState();

  // 1. Orphan THINK tokens (from the graph audit — the strongest evidence).
  if (graph.orphans > 0) {
    candidates.push({
      id: 'STAB-002',
      title: 'Connect orphan knowledge nodes to incidents/decisions/benchmarks',
      impact: 80, evidence: 95, risk: 20, complexity: 35, cost: 30, learning: 85, confidence: 93,
      reason: `${graph.orphans} orphan nodes (${graph.nodes} total) reduce retrieval quality`,
      evidenceRefs: ['GRAPH-AUDIT', 'KNOWLEDGE-AUDIT'],
      estimatedFiles: 4, estimatedLoc: 220,
      kpi: 'Retrieval precision/recall',
    });
  }

  // 2. Decisions without measured outcomes.
  const noOutcome = decisions.filter((d) => !reviews.some((r) => r.decision === d.id));
  if (noOutcome.length > 0) {
    candidates.push({
      id: 'INT-039-GAP',
      title: `Measure outcomes for ${noOutcome.length} decisions without reviews`,
      impact: 70, evidence: 85, risk: 25, complexity: 40, cost: 35, learning: 80, confidence: 88,
      reason: `${noOutcome.length} decisions lack outcome reviews — cannot judge correctness`,
      evidenceRefs: ['DECISION-LEDGER', 'OUTCOMES'],
      estimatedFiles: 2, estimatedLoc: 60,
      kpi: 'Decision confidence calibration',
    });
  }

  // 3. Counterfactuals that could not be judged.
  const noData = counterfactuals.filter((c) => c.status === 'INSUFFICIENT_DATA');
  if (noData.length > 0) {
    candidates.push({
      id: 'INT-029-GAP',
      title: `Replay ${noData.length} counterfactuals with measured evidence`,
      impact: 65, evidence: 80, risk: 25, complexity: 45, cost: 35, learning: 75, confidence: 84,
      reason: `${noData.length} counterfactuals are INSUFFICIENT_DATA — need measured deltas`,
      evidenceRefs: ['COUNTERFACTUALS'],
      estimatedFiles: 2, estimatedLoc: 80,
      kpi: 'Counterfactual confidence',
    });
  }

  // 4. Knowledge lifecycle objects missing evidence.
  const missingEvidence = index.objects.filter((o) => !o.evidence && o.type !== 'bootstrap');
  if (missingEvidence.length > 0) {
    candidates.push({
      id: 'KNOWLEDGE-GAP',
      title: `Attach evidence to ${missingEvidence.length} lifecycle objects`,
      impact: 60, evidence: 75, risk: 25, complexity: 30, cost: 25, learning: 70, confidence: 82,
      reason: `${missingEvidence.length} knowledge objects lack supporting evidence`,
      evidenceRefs: ['KNOWLEDGE-LIFECYCLE'],
      estimatedFiles: 1, estimatedLoc: 30,
      kpi: 'Knowledge evidence coverage',
    });
  }

  // 5. Recorded risks from engineering_state.yaml (operational debt).
  for (const risk of state.risks || []) {
    candidates.push({
      id: `RISK-${candidates.length + 1}`,
      title: `Resolve recorded risk: ${risk}`,
      impact: 75, evidence: 70, risk: 35, complexity: 50, cost: 40, learning: 60, confidence: 78,
      reason: `Recorded risk in engineering_state.yaml: ${risk}`,
      evidenceRefs: ['ENGINEERING-STATE'],
      estimatedFiles: 3, estimatedLoc: 120,
      kpi: 'Operational risk reduction',
    });
  }

  // 6. CI/manifest stability baseline (STAB-005).
  if (!manifest.status || manifest.status.ci !== 'green') {
    candidates.push({
      id: 'STAB-005',
      title: 'Establish performance baselines (token usage, CI runtime, benchmark runtime, graph latency)',
      impact: 70, evidence: 80, risk: 20, complexity: 40, cost: 40, learning: 85, confidence: 86,
      reason: 'No measured baselines for platform performance — cannot prove improvement',
      evidenceRefs: ['MANIFEST', 'CI'],
      estimatedFiles: 5, estimatedLoc: 300,
      kpi: 'Performance baselines established',
    });
  }

  return candidates;
}

/** Rank candidates deterministically (stable sort by priority desc, then id). */
function rank(candidates) {
  return candidates
    .map((c) => ({ ...c, ...scoreMission(c) }))
    .sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : 1));
}

function saveQueue(ranked) {
  const queue = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'evidence-graph',
    missions: ranked,
  };
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  return queue;
}

// ─── CLI ──────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const ranked = rank(buildCandidates());
  const queue = saveQueue(ranked);
  const top = ranked[0];

  console.log('\n  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  INT-042 — MISSION RECOMMENDATION                    │');
  console.log('  └─────────────────────────────────────────────────────┘');
  if (top) {
    console.log(`  Mission       ${top.id}`);
    console.log(`  Title         ${top.title}`);
    console.log(`  Priority      ${top.priority}`);
    console.log(`  Reason        ${top.reason}`);
    console.log(`  Expected ROI  ${top.kpi}`);
    console.log(`  Estimated     ${top.estimatedFiles} files / ${top.estimatedLoc} LOC`);
    console.log(`  Evidence      ${top.evidenceRefs.join(', ')}`);
    console.log(`  Confidence    ${top.confidence}%`);
  } else {
    console.log('  No candidate missions found — evidence graph is clean.');
  }
  console.log('  ──────────────────────────────────────────────────────');
  console.log(`  Queue (${queue.missions.length} candidates):`);
  for (const m of queue.missions.slice(0, 6)) {
    console.log(`    ${m.id.padEnd(16)} priority ${String(m.priority).padStart(5)}  ${m.reason.slice(0, 50)}`);
  }
  console.log('  └─────────────────────────────────────────────────────┘\n');
}
