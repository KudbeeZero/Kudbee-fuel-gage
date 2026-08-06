#!/usr/bin/env node
/**
 * scripts/mission-supervisor.mjs — EXEC-002 Autonomous Mission Supervisor
 * ---------------------------------------------------------------------------
 * Governs the Planner → Supervisor → Executor → Verifier → Reviewer → Closeout
 * pipeline. The Supervisor NEVER writes code — it only governs.
 *
 * Six questions before any mission begins:
 *   1. Should this mission exist?
 *   2. Is there already an identical mission?
 *   3. Is evidence sufficient?
 *   4. Is rollback defined?
 *   5. Are success metrics measurable?
 *   6. Is another mission higher priority?
 *
 * If any answer is NO, the mission stays APPROVED and never transitions to
 * IMPLEMENTING.
 *
 * Supervision state: APPROVED | BLOCKED | DEFERRED | REJECTED | REQUEST_EVIDENCE
 *   | REQUEST_ROLLBACK | RECOMMEND_MERGE
 *
 * Usage:
 *   npm run supervisor:check <mission-id>
 *   npm run supervisor:queue
 *   npm run supervisor:history
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const HISTORY_PATH = join(REPO_ROOT, '.kilo', 'mission-history.json');
const QUEUE_PATH = join(REPO_ROOT, '.kilo', 'mission-queue.json');
const SUP_PATH = join(REPO_ROOT, '.kilo', 'supervisor-history.json');
const STATE_PATH = join(REPO_ROOT, 'engineering_state.yaml');

function loadJson(p, fallback) {
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  return fallback;
}

function loadSupervisorHistory() {
  return loadJson(SUP_PATH, { version: 1, createdAt: new Date().toISOString(), decisions: [] });
}

function saveSupervisorHistory(h) {
  writeFileSync(SUP_PATH, JSON.stringify(h, null, 2), 'utf8');
}

function branchExists(branch) {
  try {
    const out = execFileSync('git', ['rev-parse', '--verify', '--quiet', branch], { encoding: 'utf8' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function remoteBranchExists(branch) {
  try {
    const out = execFileSync('git', ['branch', '-r', '--contains', branch], { encoding: 'utf8' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Compute a 0-100 mission health score from the 10 dimensions. */
export function missionHealth(mission) {
  const dims = {
    evidence: mission.evidence?.length ? Math.min(100, 50 + mission.evidence.length * 10) : 20,
    rollback: mission.rollback && mission.rollback !== 'git revert <sha>' ? 90 : 20,
    verification: mission.verification?.length ? Math.min(100, 50 + mission.verification.length * 15) : 20,
    complexity: mission.estimated_loc && mission.estimated_loc < 300 ? 80 : 40,
    risk: mission.priority && mission.priority > 75 ? 60 : 85, // high-priority = higher scrutiny
    dependencies: mission.evidence?.length ? 70 : 30,
    owner: mission.owner ? 100 : 20,
    branch: mission.branch && branchExists(mission.branch) ? 90 : 30,
    status: mission.immutable ? 100 : 50,
    confidence: mission.priority ? Math.min(100, mission.priority + 10) : 30,
  };
  const weights = {
    evidence: 0.15, rollback: 0.15, verification: 0.15, complexity: 0.10,
    risk: 0.10, dependencies: 0.05, owner: 0.10, branch: 0.10, status: 0.05, confidence: 0.05,
  };
  const score = Math.round(Object.entries(weights).reduce((s, [k, w]) => s + w * dims[k], 0));
  return { score, dims };
}

/**
 * Answer the six governance questions for a mission.
 * Returns { verdict, decisions[], answers }.
 */
export function superviseMission(mission, queue) {
  const answers = {};
  const decisions = [];

  // Q1: Should this mission exist? (has objective + evidence)
  answers.exists = !!(mission.objective || mission.mission) && (mission.evidence?.length > 0 || mission.priority != null);
  if (!answers.exists) decisions.push('REJECTED: no objective or evidence');

  // Q2: Identical mission already exists? (same objective in history)
  const history = loadJson(HISTORY_PATH, { missions: [] }).missions;
  const identical = history.some(
    (m) => m.mission !== mission.mission && m.objective === mission.objective && m.state === 'COMPLETE'
  );
  answers.unique = !identical;
  if (identical) decisions.push('DEFERRED: identical completed mission exists');

  // Q3: Evidence sufficient?
  answers.evidence = (mission.evidence?.length ?? 0) >= 1;
  if (!answers.evidence) decisions.push('REQUEST_EVIDENCE: no evidence sources cited');

  // Q4: Rollback defined?
  answers.rollback = !!mission.rollback && mission.rollback !== 'git revert <sha>';
  if (!answers.rollback) decisions.push('REQUEST_ROLLBACK: rollback not defined');

  // Q5: Success metrics measurable?
  answers.metrics = (mission.success_metrics?.length ?? 0) >= 1;
  if (!answers.metrics) decisions.push('BLOCKED: no success metrics');

  // Q6: Another mission higher priority?
  const higher = queue.missions.some((q) => q.id !== mission.mission && (q.priority ?? 0) > (mission.priority ?? 0));
  answers.priority = !higher;
  if (higher) decisions.push('DEFERRED: higher-priority mission in queue');

  const allPass = Object.values(answers).every(Boolean);
  const verdict = allPass ? 'APPROVED' : decisions[0]?.split(':')[0] || 'BLOCKED';

  return { verdict, decisions: decisions.length ? decisions : ['APPROVED: all six questions pass'], answers };
}

function check(missionId) {
  const history = loadJson(HISTORY_PATH, { missions: [] });
  const queue = loadJson(QUEUE_PATH, { missions: [] });
  const mission = history.missions.find((m) => m.mission === missionId);

  if (!mission) {
    // Not started yet — supervise from the queue proposal.
    const q = queue.missions.find((m) => m.id === missionId);
    if (!q) return { error: `Mission not found: ${missionId}` };
    const proposed = {
      mission: q.id,
      objective: q.title,
      evidence: q.evidenceRefs || [],
      rollback: null,
      success_metrics: [],
      owner: null,
      branch: `feature/${q.id.toLowerCase()}`,
      priority: q.priority,
      estimated_loc: q.estimatedLoc,
    };
    const result = superviseMission(proposed, queue);
    const health = missionHealth(proposed);
    return { mission: proposed, ...result, health };
  }

  const result = superviseMission(mission, queue);
  const health = missionHealth(mission);
  return { mission, ...result, health };
}

const args = process.argv.slice(2);
const cmd = args[0];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'check': {
      const id = args[1];
      if (!id) { console.error('Usage: check <mission-id>'); process.exit(1); }
      const r = check(id);
      if (r.error) { console.error(r.error); process.exit(1); }

      const h = loadSupervisorHistory();
      const record = {
        decisionId: `SUP-${h.decisions.length + 1}`,
        mission: id,
        verdict: r.verdict,
        health: r.health.score,
        answers: r.answers,
        decisions: r.decisions,
        at: new Date().toISOString(),
      };
      h.decisions.push(record);
      saveSupervisorHistory(h);

      console.log('\n  ┌─────────────────────────────────────────────────────┐');
      console.log('  │  EXEC-002 — MISSION SUPERVISOR                      │');
      console.log('  └─────────────────────────────────────────────────────┘');
      console.log(`  Mission       ${id}`);
      console.log(`  State         ${r.mission.state || 'PROPOSED'}`);
      console.log(`  Verdict       ${r.verdict}`);
      console.log(`  Health        ${r.health.score}/100`);
      for (const [dim, v] of Object.entries(r.health.dims)) {
        console.log(`    ${dim.padEnd(13)} ${v}`);
      }
      console.log('  ──────────────────────────────────────────────────────');
      for (const d of r.decisions) console.log(`  • ${d}`);
      console.log('  └─────────────────────────────────────────────────────┘\n');
      break;
    }

    case 'queue': {
      const queue = loadJson(QUEUE_PATH, { missions: [] });
      console.log('\n  Supervisor — mission queue review:');
      for (const q of queue.missions.slice(0, 8)) {
        const r = check(q.id);
        const v = r.error ? 'UNKNOWN' : r.verdict;
        console.log(`  ${q.id.padEnd(14)} pri ${String(q.priority).padStart(5)}  ${v.padEnd(16)} ${(q.title || '').slice(0, 40)}`);
      }
      console.log('');
      break;
    }

    case 'history': {
      const h = loadSupervisorHistory();
      console.log('\n  Supervisor history:');
      for (const d of h.decisions.slice(-10)) {
        console.log(`  ${d.decisionId.padEnd(10)} ${d.mission.padEnd(12)} ${d.verdict.padEnd(16)} health=${d.health}`);
      }
      console.log(`  total decisions: ${h.decisions.length}\n`);
      break;
    }

    default:
      console.log(`
  EXEC-002 Autonomous Mission Supervisor

  Commands:
    check <mission-id>   Supervise one mission (answers the six questions)
    queue                Review the mission queue
    history              Supervisor decision history
`);
      process.exit(1);
  }
}
