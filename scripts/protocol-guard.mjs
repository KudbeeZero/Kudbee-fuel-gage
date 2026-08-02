#!/usr/bin/env node
/**
 * scripts/protocol-guard.mjs
 * ---------------------------------------------------------------------------
 * PROTOCOL GUARDIAN — executable THINK Protocol enforcement.
 *
 * A lightweight role that enforces engineering discipline. It never writes
 * business logic — it protects the workflow.
 *
 * Responsibilities:
 *   - Protect main (Rule 1, 3)
 *   - Branch guard before session work (Rule 2)
 *   - Objective lock verification (Rule 4)
 *   - Session initialization checks (Rule 5)
 *   - Session termination checks (Rule 6)
 *   - Automatic recovery of feature commits on main (Rule 7)
 *
 * Usage:
 *   node scripts/protocol-guard.mjs guard          # pre-commit guard (refuses main)
 *   node scripts/protocol-guard.mjs session-start   # Rule 5 checks
 *   node scripts/protocol-guard.mjs session-end      # Rule 6 checks
 *   node scripts/protocol-guard.mjs objective <id>   # declare/verify objective lock
 *   node scripts/protocol-guard.mjs recover          # Rule 7 auto-recovery
 *   node scripts/protocol-guard.mjs status           # full compliance snapshot
 *
 * Exit codes: 0 = safe, 1 = blocked, 2 = needs recovery.
 * ---------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OBJECTIVE_LOCK = join(ROOT, '.kilo', 'objective-lock.json');

const PROTECTED_BRANCHES = new Set(['main']);

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

function isProtected(branch) {
  return PROTECTED_BRANCHES.has(branch);
}

function hasFeatureCommitsOnMain() {
  if (currentBranch() !== 'main') return false;
  // main ahead of origin/main = un-pushed commits (likely feature work)
  const ahead = Number(sh('git rev-list --count origin/main..HEAD 2>/dev/null') ?? '0');
  return ahead > 0;
}

function readLock() {
  if (!existsSync(OBJECTIVE_LOCK)) return null;
  try {
    return JSON.parse(readFileSync(OBJECTIVE_LOCK, 'utf8'));
  } catch {
    return null;
  }
}

function writeLock(lock) {
  writeFileSync(OBJECTIVE_LOCK, JSON.stringify(lock, null, 2), 'utf8');
}

/** Rule 2 + 3: refuse coding on main. */
function guard() {
  const branch = currentBranch();
  if (isProtected(branch)) {
    console.error(`[PROTOCOL] BLOCKED: feature work on "${branch}" is forbidden (Rule 1/3).`);
    console.error('[PROTOCOL]   Create a feature branch first:');
    console.error('[PROTOCOL]     git checkout -b feature/<objective>');
    return 1;
  }
  const lock = readLock();
  if (!lock?.objectiveId) {
    console.error('[PROTOCOL] BLOCKED: no objective lock declared (Rule 4).');
    console.error('[PROTOCOL]   Run: node scripts/protocol-guard.mjs objective <id>');
    return 1;
  }
  console.log(`[PROTOCOL] OK: on "${branch}" for objective ${lock.objectiveId} (${lock.prNumber ? `PR #${lock.prNumber}` : 'no PR yet'}).`);
  return 0;
}

/** Rule 5: session initialization checks. */
function sessionStart() {
  const branch = currentBranch();
  const drift = sh('git rev-list --count origin/main..HEAD 2>/dev/null') ?? '?';
  const dirty = sh('git status --porcelain | wc -l') ?? '?';
  console.log('── Session Initialization (Rule 5) ──');
  console.log(`  Branch:    ${branch}`);
  console.log(`  Drift:     ${drift} commits ahead of main`);
  console.log(`  Dirty:     ${dirty} files`);

  if (isProtected(branch)) {
    console.log('[PROTOCOL] STOP: on main. Select an objective and create a feature branch.');
    return 1;
  }
  console.log('[PROTOCOL] OK: safe to begin work.');
  return 0;
}

/** Rule 6: session termination checks. */
function sessionEnd() {
  const dirty = Number(sh('git status --porcelain | wc -l') ?? '1');
  const drift = Number(sh('git rev-list --count origin/main..HEAD 2>/dev/null') ?? '0');
  const lock = readLock();

  let code = 0;
  if (dirty > 0) {
    console.error(`[PROTOCOL] ${dirty} uncommitted files remain (Rule 6).`);
    code = 1;
  }
  if (!lock) {
    console.error('[PROTOCOL] No objective lock recorded.');
    code = 1;
  }
  if (code === 0) {
    console.log(`[PROTOCOL] Session clean: ${drift} commits ahead, memory recorded, ready for PR.`);
  }
  return code;
}

/** Rule 4: declare/verify the objective lock for the current branch. */
function declareObjective(objectiveId, prNumber) {
  const branch = currentBranch();
  if (isProtected(branch)) {
    console.error('[PROTOCOL] BLOCKED: cannot declare an objective on main.');
    return 1;
  }
  const lock = {
    objectiveId,
    prNumber: prNumber ?? null,
    branch,
    parent: 'main',
    stackPosition: prNumber ? 1 : 0,
    declaredAt: new Date().toISOString(),
  };
  writeLock(lock);
  console.log(`[PROTOCOL] Objective locked: ${objectiveId} on "${branch}"${prNumber ? ` (PR #${prNumber})` : ''}.`);
  return 0;
}

/** Rule 7: move feature commits off main onto a feature branch. */
function recover() {
  if (!hasFeatureCommitsOnMain()) {
    console.log('[PROTOCOL] main is clean — no recovery needed.');
    return 0;
  }
  const branch = currentBranch();
  if (branch !== 'main') {
    console.error('[PROTOCOL] Recovery must run while on main.');
    return 1;
  }
  const lock = readLock();
  const target = lock?.branch ?? `feature/${lock?.objectiveId ?? 'recovered'}`;

  console.log(`[PROTOCOL] Recovery: moving commits off main → "${target}"...`);
  try {
    sh(`git checkout -b "${target}"`);
    sh('git checkout main');
    sh('git reset --hard origin/main');
    console.log(`[PROTOCOL] Recovered. Commits now on "${target}". Main reset to protected state.`);
    console.log(`[PROTOCOL]   Next: push branch + open PR (one PR per branch).`);
    return 0;
  } catch (e) {
    console.error(`[PROTOCOL] Recovery failed: ${e.message}`);
    return 2;
  }
}

/** Full compliance snapshot. */
function status() {
  const branch = currentBranch();
  const drift = sh('git rev-list --count origin/main..HEAD 2>/dev/null') ?? '?';
  const dirty = sh('git status --porcelain | wc -l') ?? '?';
  const lock = readLock();
  const onProtected = isProtected(branch);

  console.log('── PROTOCOL COMPLIANCE ──');
  console.log(`  Branch:          ${branch}${onProtected ? '  [PROTECTED]' : ''}`);
  console.log(`  Drift:           ${drift} ahead of main`);
  console.log(`  Dirty files:     ${dirty}`);
  console.log(`  Objective lock:  ${lock ? `${lock.objectiveId} (PR ${lock.prNumber ?? 'none'})` : 'MISSING'}`);
  console.log(`  Main protected:  ${onProtected ? 'VIOLATION' : 'ok'}`);
  console.log(`  Recovery needed: ${hasFeatureCommitsOnMain() ? 'YES' : 'no'}`);
  const ok = !onProtected && lock && !hasFeatureCommitsOnMain();
  console.log(`  Compliance:      ${ok ? 'PASS' : 'FAIL'}`);
  return ok ? 0 : 1;
}

const command = process.argv[2];

switch (command) {
  case 'guard':
    process.exit(guard());
  case 'session-start':
    process.exit(sessionStart());
  case 'session-end':
    process.exit(sessionEnd());
  case 'objective': {
    const id = process.argv[3];
    const pr = process.argv[4]?.replace(/^#/, '');
    if (!id) {
      console.error('Usage: protocol-guard objective <id> [prNumber]');
      process.exit(1);
    }
    process.exit(declareObjective(id, pr));
  }
  case 'recover':
    process.exit(recover());
  case 'status':
    process.exit(status());
  default:
    console.error(`
PROTOCOL GUARDIAN — executable THINK Protocol enforcement

Commands:
  guard               Pre-commit guard (refuses main / missing objective)
  session-start       Rule 5: session initialization checks
  session-end         Rule 6: session termination checks
  objective <id> [pr] Rule 4: declare objective lock for current branch
  recover             Rule 7: move feature commits off main
  status              Full compliance snapshot

Exit codes: 0 = safe, 1 = blocked, 2 = needs recovery.
`);
    process.exit(1);
}
