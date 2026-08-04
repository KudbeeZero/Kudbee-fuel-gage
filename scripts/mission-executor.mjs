#!/usr/bin/env node
/**
 * scripts/mission-executor.mjs — EXEC-001 Mission Execution Framework
 * ---------------------------------------------------------------------------
 * Converts every mission into a structured execution contract. Every cloud
 * agent follows the same lifecycle; no ad hoc implementation, no skipping.
 *
 *   PROPOSED → APPROVED → BRANCH_CREATED → IMPLEMENTING → VERIFYING →
 *   READY_FOR_PR → MERGED → OBSERVING → COMPLETE
 *
 * History is append-only and immutable after completion. Guards refuse to
 * advance unless the required preconditions are met.
 *
 * Usage:
 *   npm run mission:start <id>       PROPOSED → APPROVED (validates contract)
 *   npm run mission:status           show all missions
 *   npm run mission:advance <id>     next lifecycle state (with guards)
 *   npm run mission:complete <id>    → COMPLETE (locks the mission)
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContract, canTransition, progressFor, guardFor } from './mission-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const HISTORY_PATH = join(REPO_ROOT, '.kilo', 'mission-history.json');
const QUEUE_PATH = join(REPO_ROOT, '.kilo', 'mission-queue.json');
const STATE_PATH = join(REPO_ROOT, 'engineering_state.yaml');

function loadHistory() {
  try {
    if (existsSync(HISTORY_PATH)) return JSON.parse(readFileSync(HISTORY_PATH, 'utf8'));
  } catch {}
  return { version: 1, createdAt: new Date().toISOString(), missions: [] };
}

function saveHistory(h) {
  writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2), 'utf8');
}

function loadQueue() {
  try {
    if (existsSync(QUEUE_PATH)) return JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  } catch {}
  return { missions: [] };
}

function now() {
  return new Date().toISOString();
}

/** Pull the mission's planner metadata (objective, evidence) from the queue. */
function queueMeta(id) {
  const q = loadQueue();
  const m = q.missions.find((x) => x.id === id);
  if (!m) return {};
  return {
    mission: m.id,
    objective: m.title,
    evidence: m.evidenceRefs || [],
    priority: m.priority,
    reason: m.reason,
    estimated_files: m.estimatedFiles || 0,
    estimated_loc: m.estimatedLoc || 0,
  };
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

/** Validate that the guarded preconditions are actually met. */
function checkGuards(mission, state) {
  const guards = guardFor(state);
  const results = {};
  for (const g of guards) {
    switch (g) {
      case 'branch_exists': results.branch_exists = branchExists(mission.branch); break;
      case 'remote_branch_exists': results.remote_branch_exists = remoteBranchExists(mission.branch); break;
      case 'rollback_documented': results.rollback_documented = !!mission.rollback && mission.rollback !== 'git revert <sha>'; break;
      case 'verification_commands_defined': results.verification_commands_defined = mission.verification?.length > 0; break;
      case 'success_metrics_defined': results.success_metrics?.length > 0 || (results.success_metrics_defined = mission.success_metrics?.length > 0); break;
      case 'verification_passed': results.verification_passed = mission.verification_passed === true; break;
      case 'pr_merged': results.pr_merged = mission.pr_merged === true; break;
      default: results[g] = null;
    }
  }
  const passed = Object.values(results).every((v) => v === true);
  return { passed, results };
}

function start(id, contract) {
  const h = loadHistory();
  if (h.missions.some((m) => m.mission === id)) {
    throw new Error(`Mission ${id} already exists in history`);
  }
  const meta = queueMeta(id);
  const full = {
    mission: id,
    objective: contract?.objective || meta.objective,
    owner: contract?.owner || 'KILO',
    branch: contract?.branch || `feature/${id.toLowerCase()}`,
    estimated_files: contract?.estimated_files ?? meta.estimated_files ?? 0,
    estimated_loc: contract?.estimated_loc ?? meta.estimated_loc ?? 0,
    rollback: contract?.rollback || null,
    verification: contract?.verification || [],
    success_metrics: contract?.success_metrics || [],
    evidence: meta.evidence || [],
    priority: meta.priority ?? null,
    reason: meta.reason || '',
    state: 'PROPOSED',
    createdAt: now(),
    transitions: [{ from: null, to: 'PROPOSED', at: now(), by: contract?.owner || 'KILO' }],
    immutable: false,
  };

  const v = validateContract(full);
  if (!v.valid) {
    throw new Error(`Contract invalid — missing: ${v.missing.join(', ')}. Mission remains PROPOSED.`);
  }

  h.missions.push(full);
  saveHistory(h);
  updateStateFile(id, 'PROPOSED');
  return full;
}

function advance(id, by = 'KILO') {
  const h = loadHistory();
  const m = h.missions.find((x) => x.mission === id);
  if (!m) throw new Error(`Mission not found: ${id}`);
  if (m.immutable) throw new Error(`Mission ${id} is immutable (COMPLETE)`);

  const from = m.state;
  const to = LIFECYCLE_NEXT(from);
  if (!to) throw new Error(`${id} is already COMPLETE`);

  // Before READY_FOR_PR: run the mission's verification commands and record
  // the evidence. This is the "execution with evidence" bridge — no manual flag.
  if (to === 'READY_FOR_PR') {
    m.verification_passed = runVerification(m);
    m.lastVerification = { at: now(), commands: m.verification || [], passed: m.verification_passed };
  }

  const guards = checkGuards(m, to);
  if (!guards.passed) {
    const failed = Object.entries(guards.results).filter(([, v]) => v !== true).map(([k]) => k);
    throw new Error(`${id} cannot advance to ${to} — guards not met: ${failed.join(', ')}`);
  }

  m.state = to;
  m.transitions.push({ from, to, at: now(), by });
  if (to === 'COMPLETE') m.immutable = true;
  saveHistory(h);
  updateStateFile(id, to);
  return m;
}

/** Execute the mission's verification commands; all must exit 0. */
function runVerification(m) {
  const commands = m.verification || [];
  if (commands.length === 0) return false;
  const results = [];
  for (const cmd of commands) {
    // Commands are npm script names (e.g. "knowledge:audit", "graph:audit").
    // "npm run <name>" and "node <path>" forms are also accepted.
    let argv;
    if (cmd.startsWith('npm run ')) argv = ['run', cmd.slice(8).trim()];
    else if (cmd.startsWith('npm ')) argv = ['run', cmd.slice(4).trim()];
    else if (cmd.startsWith('node ')) argv = [process.execPath, cmd.slice(5).trim()];
    else argv = ['run', cmd.trim()]; // bare npm script name
    try {
      if (argv[0] === process.execPath) {
        execFileSync(process.execPath, [argv[1]], { stdio: 'ignore', timeout: 120000 });
      } else {
        execFileSync('npm', argv, { stdio: 'ignore', timeout: 120000 });
      }
      results.push({ cmd, ok: true });
    } catch {
      results.push({ cmd, ok: false });
    }
  }
  m.verificationResults = results;
  return results.every((r) => r.ok);
}

function LIFECYCLE_NEXT(state) {
  const order = ['PROPOSED', 'APPROVED', 'BRANCH_CREATED', 'IMPLEMENTING', 'VERIFYING', 'READY_FOR_PR', 'MERGED', 'OBSERVING', 'COMPLETE'];
  const i = order.indexOf(state);
  return i === -1 || i === order.length - 1 ? null : order[i + 1];
}

function updateStateFile(id, state) {
  try {
    let raw = readFileSync(STATE_PATH, 'utf8');
    raw = raw.replace(/(current_mission:\s*)\S+/, `$1${id}`);
    raw = raw.replace(/(mission_state:\s*)\S+/, `$1${state}`);
    if (!raw.includes('mission_state:')) {
      raw += `  mission_state: ${state}\n`;
    }
    writeFileSync(STATE_PATH, raw, 'utf8');
  } catch {}
}

const args = process.argv.slice(2);
const cmd = args[0];
const id = args[1];

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    switch (cmd) {
      case 'start': {
        if (!id) { console.error('Usage: start <mission-id>'); process.exit(1); }
        const contract = {};
        // Accept inline contract via --objective, --owner, --branch, --rollback, --verification "a,b", --metrics "a,b"
        const flag = (n) => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; };
        if (flag('--objective')) contract.objective = flag('--objective');
        if (flag('--owner')) contract.owner = flag('--owner');
        if (flag('--branch')) contract.branch = flag('--branch');
        if (flag('--rollback')) contract.rollback = flag('--rollback');
        if (flag('--verification')) contract.verification = flag('--verification').split(',');
        if (flag('--metrics')) contract.success_metrics = flag('--metrics').split(',');
        const m = start(id, contract);
        console.log(`\n  [EXEC] ${m.mission} started: ${m.state} → ${id === 'APPROVED' ? 'APPROVED' : 'PROPOSED'}`);
        console.log(`  objective:   ${m.objective}`);
        console.log(`  owner:       ${m.owner}`);
        console.log(`  branch:      ${m.branch}`);
        console.log(`  contract:    ${validateContract(m).valid ? 'valid' : 'INVALID'}`);
        console.log(`  evidence:    ${m.evidence.length ? m.evidence.join(', ') : '—'}\n`);
        break;
      }

      case 'advance': {
        if (!id) { console.error('Usage: advance <mission-id>'); process.exit(1); }
        const m = advance(id);
        console.log(`\n  [EXEC] ${m.mission}: → ${m.state}  (progress ${progressFor(m.state)}%)\n`);
        break;
      }

      case 'complete': {
        if (!id) { console.error('Usage: complete <mission-id>'); process.exit(1); }
        const m = advance(id);
        console.log(`\n  [EXEC] ${m.mission} COMPLETE — immutable. progress 100%\n`);
        break;
      }

      case 'status': {
        const h = loadHistory();
        console.log('\n  ┌─────────────────────────────────────────────────────────┐');
        console.log('  │  EXEC-001 — MISSION STATUS                              │');
        console.log('  └─────────────────────────────────────────────────────────┘');
        for (const m of h.missions) {
          const p = progressFor(m.state);
          console.log(`  ${m.mission.padEnd(10)} [${m.state.padEnd(14)}] ${String(p).padStart(3)}%  branch=${m.branch}`);
          if (m.transitions.length > 1) {
            console.log(`              last: ${m.transitions[m.transitions.length - 1].from} → ${m.transitions[m.transitions.length - 1].to} @ ${m.transitions[m.transitions.length - 1].at.slice(11, 19)}`);
          }
        }
        if (h.missions.length === 0) console.log('  (no missions started)');
        console.log('  └─────────────────────────────────────────────────────────┘\n');
        break;
      }

      default:
        console.log(`
  EXEC-001 Mission Execution Framework

  Commands:
    start <id> [--objective ...] [--owner ...] [--branch ...] [--rollback ...] [--verification "a,b"] [--metrics "a,b"]
    advance <id>
    complete <id>
    status

  Lifecycle: PROPOSED → APPROVED → BRANCH_CREATED → IMPLEMENTING → VERIFYING
             → READY_FOR_PR → MERGED → OBSERVING → COMPLETE
`);
        process.exit(1);
    }
  } catch (e) {
    console.error(`[EXEC] ${e.message}`);
    process.exit(1);
  }
}
