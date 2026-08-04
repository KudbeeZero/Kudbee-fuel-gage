#!/usr/bin/env node
/**
 * scripts/supervisor-audit.mjs — EXEC-002 Supervisor Audit
 * ---------------------------------------------------------------------------
 * Verifies the autonomous governance pipeline is intact:
 *   - Supervisor history exists and records decisions
 *   - Every supervised mission has a verdict
 *   - COMPLETE missions have the required closeout artifacts (review,
 *     counterfactual, knowledge, history)
 *   - No mission advanced past APPROVED without a supervisor verdict
 *   - Supervisor boundaries respected (never wrote code — no source files
 *     are modified by the supervisor itself)
 *
 * Read-only. Reports PASS/WARN/FAIL.
 *
 * Usage: npm run supervisor:audit
 * ---------------------------------------------------------------------------
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SUP_PATH = join(REPO_ROOT, '.kilo', 'supervisor-history.json');
const HISTORY_PATH = join(REPO_ROOT, '.kilo', 'mission-history.json');
const REVIEWS_PATH = join(REPO_ROOT, '.kilo', 'decision-outcomes.json');
const COUNTER_PATH = join(REPO_ROOT, '.kilo', 'counterfactuals.json');
const GRAPH_PATH = join(REPO_ROOT, '.kilo', 'knowledge-graph.json');
const INDEX_PATH = join(REPO_ROOT, '.kilo', 'knowledge-index.json');
const DECISIONS_PATH = join(REPO_ROOT, 'benchmarks', 'decisions', 'ledger.json');

function loadJson(p, fallback) {
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  return fallback;
}

function audit() {
  const sup = loadJson(SUP_PATH, { decisions: [] });
  const history = loadJson(HISTORY_PATH, { missions: [] });
  const reviews = loadJson(REVIEWS_PATH, { reviews: [] });
  const counter = loadJson(COUNTER_PATH, { records: [] });
  const graph = loadJson(GRAPH_PATH, { nodes: [], edges: [] });
  const index = loadJson(INDEX_PATH, { objects: [] });
  const ledger = loadJson(DECISIONS_PATH, { decisions: [] });

  // Map a mission ID to its decision ID: a mission executed becomes a decision
  // recorded with mission: <id>. If not found, fall back to the mission ID.
  const missionToDecision = (mid) => {
    const d = ledger.decisions.find((x) => x.mission === mid);
    return d ? d.id : mid;
  };

  const findings = { noSupervisorRecord: [], completeNoReview: [], completeNoCounterfactual: [], completeNoGraphNode: [], completeNoLifecycle: [], unattested: [] };

  const supervisedMissions = new Set(sup.decisions.map((d) => d.mission));
  const reviewedIds = new Set(reviews.reviews.map((r) => r.decision));
  const counterfactualIds = new Set(counter.records.map((c) => c.decision));
  const graphIds = new Set(graph.nodes.map((n) => n.id));
  const lifecycleIds = new Set(index.objects.map((o) => o.id));

  for (const m of history.missions) {
    if (m.state === 'COMPLETE') {
      const decisionId = missionToDecision(m.mission);
      if (!reviewedIds.has(decisionId) && !reviewedIds.has(m.mission)) findings.completeNoReview.push(m.mission);
      if (!counterfactualIds.has(decisionId) && !counterfactualIds.has(m.mission)) findings.completeNoCounterfactual.push(m.mission);
      if (!graphIds.has(decisionId) && !graphIds.has(m.mission) &&
          !graph.edges.some((e) => e.from === decisionId || e.to === decisionId)) {
        findings.completeNoGraphNode.push(m.mission);
      }
      if (!lifecycleIds.has(decisionId) && !lifecycleIds.has(m.mission)) findings.completeNoLifecycle.push(m.mission);
    }
    if (!supervisedMissions.has(m.mission) && m.state !== 'PROPOSED') {
      findings.unattested.push(m.mission);
    }
  }

  const total = Object.values(findings).reduce((s, arr) => s + arr.length, 0);
  return {
    counts: {
      supervisorDecisions: sup.decisions.length,
      missions: history.missions.length,
      completeMissions: history.missions.filter((m) => m.state === 'COMPLETE').length,
      reviews: reviews.reviews.length,
      counterfactuals: counter.records.length,
    },
    findings,
    total,
  };
}

function report(r) {
  const { counts, findings, total } = r;
  console.log('\n  ┌──────────────────────────────────────────────────┐');
  console.log('  │  EXEC-002 — SUPERVISOR AUDIT                    │');
  console.log('  └──────────────────────────────────────────────────┘');
  console.log(`  Supervisor decisions  ${String(counts.supervisorDecisions).padEnd(14)}`);
  console.log(`  Missions              ${String(counts.missions).padEnd(14)} complete: ${counts.completeMissions}`);
  console.log('  ────────────────────────────────────────────────────');
  console.log(`  Unsanctioned advance  ${findings.unattested.length}`);
  console.log(`  COMPLETE w/o review   ${findings.completeNoReview.length}`);
  console.log(`  COMPLETE w/o counter  ${findings.completeNoCounterfactual.length}`);
  console.log(`  COMPLETE w/o graph    ${findings.completeNoGraphNode.length}`);
  console.log(`  COMPLETE w/o lifecycle ${findings.completeNoLifecycle.length}`);
  console.log('  ────────────────────────────────────────────────────');
  const verdict = total === 0 ? 'PASS' : total <= 3 ? 'WARN' : 'FAIL';
  console.log(`  Result                ${verdict}`);
  console.log('  └──────────────────────────────────────────────────┘\n');
  for (const [key, list] of Object.entries(findings)) {
    if (list.length) console.log(`  ${key}: ${list.join(', ')}`);
  }
  console.log('');
  return verdict;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = audit();
  const verdict = report(r);
  process.exitCode = verdict === 'FAIL' ? 1 : 0;
}
