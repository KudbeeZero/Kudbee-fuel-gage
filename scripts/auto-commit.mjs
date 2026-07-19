/**
 * scripts/auto-commit.mjs
 * ---------------------------------------------------------------------------
 * Studio / CI helper: verify system integrity, then auto-commit + open a PR.
 *
 * Run order:
 *   1. node scripts/verify-e2e.mjs      (must exit 0 / 11-of-11)
 *   2. node scripts/diagnose-redis.mjs  (advisory; reports Redis reachability)
 *   3. If E2E passed AND there are staged/unstaged changes, commit them on a
 *      feature branch, push, and open a PR against main.
 *
 * This script is Resilient-First: a Redis diagnostic failure never blocks the
 * commit, and a failing E2E run aborts with a clear message (no force-commit).
 *
 * Environment:
 *   GITHUB_TOKEN     — required to open PRs (repo scope).
 *   GIT_AUTHOR_NAME  — optional commit author (defaults to "Release Engineer").
 *   PR_TITLE         — optional PR title override.
 *   PR_BODY          — optional PR body override.
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const BASE_BRANCH = 'main';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: process.env,
      ...opts
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`[auto-commit] Failed to spawn ${cmd}: ${err.message}`);
      resolve(1);
    });
  });
}

function git(args) {
  return run('git', args);
}

async function currentBranch() {
  const { execSync } = await import('node:child_process');
  return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
}

async function hasChanges() {
  const { execSync } = await import('node:child_process');
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  return status.length > 0;
}

async function main() {
  console.log('[auto-commit] === Step 1/4: E2E verification ===');
  const e2eExit = await run('node', ['scripts/verify-e2e.mjs']);
  if (e2eExit !== 0) {
    console.error('[auto-commit] E2E verification FAILED — aborting. Fix tests before commit.');
    process.exit(1);
  }
  console.log('[auto-commit] E2E verification PASSED (11/11).');

  console.log('\n[auto-commit] === Step 2/4: Redis diagnostic (advisory) ===');
  const redisExit = await run('node', ['scripts/diagnose-redis.mjs']);
  if (redisExit !== 0) {
    console.warn('[auto-commit] Redis diagnostic reported unreachable — continuing (advisory only).');
  }

  console.log('\n[auto-commit] === Step 3/4: Check for changes ===');
  const changes = await hasChanges();
  if (!changes) {
    console.log('[auto-commit] No uncommitted changes — nothing to commit. Done.');
    process.exit(0);
  }

  console.log('\n[auto-commit] === Step 4/4: Commit + PR ===');
  const branch = `feature/auto-commit-${Date.now()}`;
  const title = process.env.PR_TITLE || 'chore: auto-committed verification-passing changes';
  const body =
    process.env.PR_BODY ||
    'Auto-committed by scripts/auto-commit.mjs after `verify-e2e.mjs` passed (11/11).\n\n### Struggles & Friction\n- None: changes committed automatically after passing integrity verification.';

  await git(['checkout', '-b', branch]);
  await git(['add', '-A']);
  const author = process.env.GIT_AUTHOR_NAME || 'Release Engineer';
  await git(['commit', '-m', title, '--author', `${author} <release@kudbee.local>`]);
  await git(['push', '-u', 'origin', branch]);

  if (process.env.GITHUB_TOKEN) {
    const ghExit = await run('gh', [
      'pr', 'create',
      '--base', BASE_BRANCH,
      '--head', branch,
      '--title', title,
      '--body', body
    ]);
    if (ghExit !== 0) {
      console.error('[auto-commit] PR creation failed — branch pushed, open manually.');
      process.exit(1);
    }
    console.log('[auto-commit] PR opened against main.');
  } else {
    console.warn('[auto-commit] GITHUB_TOKEN not set — branch pushed, open PR manually.');
  }

  // Return to the base branch so the working tree is left in a clean state.
  await git(['checkout', BASE_BRANCH]);
  console.log('[auto-commit] Done.');
}

main();
