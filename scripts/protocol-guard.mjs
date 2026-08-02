#!/usr/bin/env node
/**
 * scripts/protocol-guard.mjs — THINK Governance Engine enforcement subsystem.
 * ---------------------------------------------------------------------------
 * Evaluates machine-readable policies (.kilo/policies/*.json) at four gates:
 * pre-coding, pre-commit, pre-push, pre-pr. Emits evidence for every decision.
 *
 * Usage:
 *   protocol-guard mission <id> <objective> [pr]   activate mission lock
 *   protocol-guard mission-clear                    end mission + record learning
 *   protocol-guard objective <id> [pr]              declare objective lock
 *   protocol-guard guard                            policy-evaluated pre-commit gate
 *   protocol-guard pre-coding | pre-commit | pre-push | pre-pr
 *   protocol-guard status                           full policy compliance snapshot
 *   protocol-guard recover                          move feature commits off main
 *   protocol-guard evidence                         tail evidence log
 *
 * Exit codes: 0 = safe/warn-only, 1 = blocked, 2 = recovery needed.
 * ---------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const POLICY_DIR = join(ROOT, '.kilo', 'policies');
const MISSION_LOCK = join(ROOT, '.kilo', 'mission-lock.json');
const OBJECTIVE_LOCK = join(ROOT, '.kilo', 'objective-lock.json');
const EVIDENCE_DIR = join(ROOT, '.kilo', 'memory', 'guardian');
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'evidence.jsonl');

const GATE_CATEGORIES = {
  'pre-coding': ['mission', 'branch'],
  'pre-commit': ['mission', 'branch', 'memory', 'commit'],
  'pre-push': ['mission', 'branch', 'merge'],
  'pre-pr': ['merge', 'memory', 'agent', 'dependency'],
};

function sh(cmd) {
  try {
    return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', cwd: ROOT }).trim();
  } catch {
    return null;
  }
}

function currentBranch() {
  return sh('git branch --show-current') ?? 'unknown';
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

function loadPolicies() {
  if (!existsSync(POLICY_DIR)) return [];
  const all = [];
  for (const file of readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json'))) {
    const doc = readJson(join(POLICY_DIR, file));
    if (doc?.policies) all.push(...doc.policies);
  }
  return all;
}

function appendEvidence(record) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const full = {
    id: `ev-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...record,
  };
  appendFileSync(EVIDENCE_LOG, JSON.stringify(full) + '\n', 'utf8');
  return full;
}

/** Build the evaluation context. */
function buildContext() {
  const branch = currentBranch();
  const mission = readJson(MISSION_LOCK);
  const objective = readJson(OBJECTIVE_LOCK);
  const staged = (sh('git diff --cached --name-only 2>/dev/null') ?? '').split('\n').filter(Boolean);
  const runtimePaths = [
    '.kilo/memory/bus/',
    '.kilo/memory/dthink/',
    '.kilo/memory/forge/',
    '.kilo/memory/gate-results.json',
    '.kilo/memory/journal.json',
    '.kilo/thinkbox/',
  ];
  const runtimeMemoryInChangeset = staged.some((f) => runtimePaths.some((p) => f.startsWith(p)));
  return {
    branch,
    missionActive: !!mission && mission.state === 'active',
    missionBranch: mission?.featureBranch ?? null,
    objectiveExists: !!objective,
    objectiveBranch: objective?.branch ?? null,
    runtimeMemoryInChangeset,
    drift: Number(sh('git rev-list --count origin/main..HEAD 2>/dev/null') ?? '0'),
    treeDirty: Number(sh('git status --porcelain | wc -l') ?? '0'),
  };
}

/** Evaluate a single condition against context. Returns bool. */
function evalCondition(cond, ctx) {
  const w = cond.when;
  if (w.branch !== undefined) return ctx.branch === w.branch;
  if (w.branchNotMatch !== undefined) return !new RegExp(`^(${w.branchNotMatch.replace(/\*/g, '.*')})$`).test(ctx.branch);
  if (w.missionActive !== undefined) return ctx.missionActive === w.missionActive;
  if (w.missionBranchMismatch !== undefined) return ctx.missionBranch !== null && ctx.missionBranch !== ctx.branch;
  if (w.objectiveExists !== undefined) return ctx.objectiveExists === w.objectiveExists;
  if (w.objectiveBranchMismatch !== undefined) return ctx.objectiveBranch !== null && ctx.objectiveBranch !== ctx.branch;
  if (w.runtimeMemoryInChangeset !== undefined) return ctx.runtimeMemoryInChangeset === w.runtimeMemoryInChangeset;
  return false;
}

/** Run a gate: evaluate matching policies, emit evidence, return exit code. */
function runGate(gate) {
  const ctx = buildContext();
  const policies = loadPolicies();
  const categories = GATE_CATEGORIES[gate] ?? [];
  const applicable = policies.filter((p) => p.scope?.includes(gate) || categories.some((c) => p.policyId.startsWith(c)));

  let blocked = false;
  const results = [];

  for (const policy of applicable) {
    const failedConditions = policy.conditions.filter((c) => evalCondition(c, ctx));
    if (failedConditions.length > 0) {
      const record = appendEvidence({
        policyId: policy.policyId,
        gate,
        result: policy.severity === 'blocking' ? 'fail' : 'warn',
        context: { branch: ctx.branch },
        message: failedConditions[0].message ?? policy.name,
      });
      results.push(record);
      if (policy.severity === 'blocking') blocked = true;
    } else {
      results.push(appendEvidence({
        policyId: policy.policyId,
        gate,
        result: 'pass',
        context: { branch: ctx.branch },
        message: `${policy.name}: ok`,
      }));
    }
  }

  if (applicable.length === 0) {
    results.push(appendEvidence({ policyId: 'guard:no-policies', gate, result: 'pass', context: {}, message: 'No applicable policies.' }));
  }

  for (const r of results) {
    const icon = r.result === 'pass' ? '✓' : r.result === 'warn' ? '⚠' : '✗';
    console.log(`  ${icon} ${r.policyId}: ${r.message}`);
  }
  console.log(blocked ? `[GOVERNANCE] ${gate} BLOCKED` : `[GOVERNANCE] ${gate} ${ctx.treeDirty > 0 ? 'ok (dirty tree)' : 'ok'}`);
  return blocked ? 1 : 0;
}

// ── Commands ─────────────────────────────────────────────────────────────

function cmdMission(id, objective, pr) {
  const branch = currentBranch();
  const lock = {
    missionId: id,
    name: objective,
    objective,
    featureBranch: branch,
    expectedPr: pr ? Number(pr) : null,
    stackPosition: pr ? 1 : 0,
    owner: 'KILOH',
    state: 'active',
    startedAt: new Date().toISOString(),
    completedAt: null,
    authority: 'Engineering Governance',
    priority: 'P0',
    missionLockVersion: 1,
  };
  writeJson(MISSION_LOCK, lock);
  console.log(`[GOVERNANCE] Mission ${id} active on "${branch}".`);
  return 0;
}

function cmdMissionClear() {
  const mission = readJson(MISSION_LOCK);
  if (mission) {
    mission.state = 'completed';
    mission.completedAt = new Date().toISOString();
    writeJson(MISSION_LOCK, mission);
    appendEvidence({ policyId: 'mission.completed', gate: 'session-end', result: 'pass', context: { mission: mission.missionId }, message: `${mission.missionId} completed` });
    console.log(`[GOVERNANCE] Mission ${mission.missionId} completed.`);
  }
  return 0;
}

function cmdObjective(id, pr) {
  const branch = currentBranch();
  writeJson(OBJECTIVE_LOCK, {
    objectiveId: id,
    prNumber: pr ? Number(pr) : null,
    branch,
    parent: 'main',
    stackPosition: pr ? 1 : 0,
    declaredAt: new Date().toISOString(),
  });
  console.log(`[GOVERNANCE] Objective ${id} locked on "${branch}".`);
  return 0;
}

function cmdStatus() {
  const ctx = buildContext();
  const policies = loadPolicies();
  const mission = readJson(MISSION_LOCK);
  console.log('── THINK GOVERNANCE ENGINE — COMPLIANCE ──');
  console.log(`  Branch:          ${ctx.branch}`);
  console.log(`  Drift:           ${ctx.drift} ahead of main`);
  console.log(`  Dirty files:     ${ctx.treeDirty}`);
  console.log(`  Mission:         ${mission ? `${mission.missionId} [${mission.state}] ${mission.name}` : 'MISSING'}`);
  console.log(`  Objective:       ${ctx.objectiveExists ? ctx.objectiveBranch : 'MISSING'}`);
  console.log(`  Policies loaded: ${policies.length}`);
  console.log(`  Runtime churn:   ${ctx.runtimeMemoryInChangeset ? 'DETECTED' : 'none'}`);
  const ok = ctx.missionActive && ctx.objectiveExists && !ctx.runtimeMemoryInChangeset;
  console.log(`  Compliance:      ${ok ? 'PASS' : 'FAIL'}`);
  return ok ? 0 : 1;
}

function cmdRecover() {
  if (currentBranch() !== 'main') {
    console.error('[GOVERNANCE] Recovery must run while on main.');
    return 1;
  }
  const ahead = Number(sh('git rev-list --count origin/main..HEAD 2>/dev/null') ?? '0');
  if (ahead === 0) {
    console.log('[GOVERNANCE] main is clean — no recovery needed.');
    return 0;
  }
  const mission = readJson(MISSION_LOCK);
  const target = mission?.featureBranch ?? `feature/recovered-${Date.now()}`;
  try {
    sh(`git checkout -b "${target}"`);
    sh('git checkout main');
    sh('git reset --hard origin/main');
    appendEvidence({ policyId: 'branch.recover', gate: 'pre-coding', result: 'pass', context: { target }, message: `Feature commits moved to ${target}` });
    console.log(`[GOVERNANCE] Recovered: commits on "${target}", main reset.`);
    return 0;
  } catch (e) {
    console.error(`[GOVERNANCE] Recovery failed: ${e.message}`);
    return 2;
  }
}

function cmdEvidence() {
  if (!existsSync(EVIDENCE_LOG)) {
    console.log('No evidence recorded yet.');
    return 0;
  }
  const lines = readFileSync(EVIDENCE_LOG, 'utf8').trim().split('\n').slice(-15);
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      console.log(`${r.timestamp.slice(11, 19)} ${r.gate.padEnd(12)} ${(r.result || '').padEnd(5)} ${r.policyId}: ${r.message}`);
    } catch {
      /* skip malformed */
    }
  }
  return 0;
}

function cmdDependabotClassify(prNumber) {
  // Classify a Dependabot PR by semver from its title, per dependency policy.
  const title = sh(`gh pr view ${prNumber} --json title --jq .title 2>/dev/null`) ?? '';
  // e.g. "build(deps): bump react from 18.2.0 to 19.0.0"
  const m = title.match(/bump\s+([\w@/.-]+)\s+from\s+(\d+)\.(\d+)\.(\d+)\s+to\s+(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    console.log(`[DEPENDENCY] PR #${prNumber}: ${title || 'unknown'} — could not parse semver.`);
    return 0;
  }
  const pkg = m[1];
  const fromMajor = Number(m[2]);
  const toMajor = Number(m[5]);
  const toMinor = m[6];
  const toPatch = m[7];
  const cls = toMajor > fromMajor ? 'major' : 'minor';
  const verdict = cls === 'major'
    ? 'BLOCKED — major upgrade requires compatibility assessment (DEPENDABOT_PR' + prNumber + '_ANALYSIS.md)'
    : 'ALLOWED — minor/patch with green CI may auto-approve';
  console.log(`[DEPENDENCY] PR #${prNumber}: ${pkg} → v${toMajor}.${toMinor}.${toPatch} — ${cls} — ${verdict}`);
  return cls === 'major' ? 1 : 0;
}

const command = process.argv[2];

switch (command) {
  case 'mission': {
    const id = process.argv[3];
    const obj = process.argv[4];
    if (!id || !obj) { console.error('Usage: protocol-guard mission <id> <objective> [pr]'); process.exit(1); }
    process.exit(cmdMission(id, obj, process.argv[5]));
  }
  case 'mission-clear':
    process.exit(cmdMissionClear());
  case 'objective': {
    const id = process.argv[3];
    if (!id) { console.error('Usage: protocol-guard objective <id> [pr]'); process.exit(1); }
    process.exit(cmdObjective(id, process.argv[4]));
  }
  case 'guard':
  case 'pre-commit':
    process.exit(runGate('pre-commit'));
  case 'pre-coding':
    process.exit(runGate('pre-coding'));
  case 'pre-push':
    process.exit(runGate('pre-push'));
  case 'pre-pr':
    process.exit(runGate('pre-pr'));
  case 'status':
    process.exit(cmdStatus());
  case 'recover':
    process.exit(cmdRecover());
  case 'evidence':
    process.exit(cmdEvidence());
  case 'dependabot-classify': {
    const pr = process.argv[3];
    if (!pr) { console.error('Usage: protocol-guard dependabot-classify <pr>'); process.exit(1); }
    process.exit(cmdDependabotClassify(pr));
  }
  default:
    console.error(`
THINK GOVERNANCE ENGINE — Protocol Guardian

Commands:
  mission <id> <objective> [pr]   activate mission lock
  mission-clear                    end mission
  objective <id> [pr]              declare objective lock
  guard / pre-commit               pre-commit gate (policy-evaluated)
  pre-coding                       session start gate
  pre-push                         push gate
  pre-pr                           PR gate
  status                           full compliance snapshot
  recover                          move feature commits off main
  evidence                         tail evidence log
`);
    process.exit(1);
}
