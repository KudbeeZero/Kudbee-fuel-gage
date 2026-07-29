/**
 * scripts/deploy-log.mjs
 * ---------------------------------------------------------------------------
 * Deployment logging and trigger system.
 *
 * Captures every deploy's metadata — what triggered it, what changed,
 * commit context, CI status, and operator notes — into the memory journal
 * so the system learns from every release.
 *
 * Modes:
 *   log    — append a deploy entry with metadata
 *   list   — show recent deploy history
 *   status — show current deploy status
 *   trigger — create a deploy trigger (manual, CI, scheduler, HITL, autorecovery)
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const MEMORY_DIR = join(process.cwd(), '.kilo', 'memory');
const DEPLOY_LOG = join(MEMORY_DIR, 'deploy-log.json');
const TRIGGERS_LOG = join(MEMORY_DIR, 'deploy-triggers.json');

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadJson(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  } catch {}
  return null;
}

function saveJson(path, data) {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function getDeployContext() {
  return {
    timestamp: new Date().toISOString(),
    branch: git('branch --show-current'),
    commit: git('log -1 --format=%H'),
    message: git('log -1 --format=%s'),
    author: git('log -1 --format=%an'),
    changedFiles: git('diff --name-only HEAD~1').split('\n').filter(Boolean),
    remoteCommit: git('log -1 --format=%H origin/main'),
    herokuRelease: process.env.HEROKU_RELEASE_VERSION || 'unknown',
    herokuSlug: process.env.HEROKU_SLUG_COMMIT || 'unknown',
    nodeVersion: process.version,
    pid: process.pid,
  };
}

function getTriggerContext() {
  return loadJson(TRIGGERS_LOG) || { triggers: [], lastCleanedAt: null };
}

const command = process.argv[2];
const args = process.argv.slice(3);

if (command === 'log') {
  const note = args.join(' ') || 'deploy';

  let existing = loadJson(DEPLOY_LOG);
  if (!existing || !Array.isArray(existing.entries)) {
    existing = { entries: [], count: 0 };
  }

  const ctx = getDeployContext();
  const entry = {
    id: `deploy-${Date.now()}`,
    ...ctx,
    note,
    trigger: process.env.DEPLOY_TRIGGER || 'manual',
    operator: process.env.OPERATOR || 'kilo',
    previousDeploy: existing.entries[0]?.id || null,
  };

  existing.entries.unshift(entry);
  existing.count = existing.entries.length;
  existing.lastDeploy = entry.timestamp;
  saveJson(DEPLOY_LOG, existing);

  console.log(JSON.stringify({ status: 'logged', deployId: entry.id, commit: ctx.commit.slice(0, 7) }));
} else if (command === 'list') {
  const existing = loadJson(DEPLOY_LOG);
  if (!existing?.entries?.length) {
    console.log('No deployments logged.');
    process.exit(0);
  }
  const limit = parseInt(args[0]) || 10;
  const recent = existing.entries.slice(0, limit);
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`  DEPLOYMENT HISTORY (${existing.count} total, showing ${recent.length})`);
  console.log(`${'─'.repeat(80)}`);
  for (const e of recent) {
    const ts = e.timestamp.slice(0, 19).replace('T', ' ');
    const c = e.commit.slice(0, 7);
    const trigger = e.trigger || 'manual';
    const note = e.note.length > 50 ? e.note.slice(0, 50) + '…' : e.note;
    console.log(`  ${ts}  ${c}  [${trigger}]  ${note}`);
  }
} else if (command === 'status') {
  const existing = loadJson(DEPLOY_LOG);
  if (!existing?.lastDeploy) {
    console.log('No deployments logged.');
    process.exit(0);
  }
  const last = existing.entries[0];
  console.log(JSON.stringify({
    lastDeploy: last.timestamp,
    commit: last.commit.slice(0, 7),
    message: last.message,
    trigger: last.trigger,
    note: last.note,
    totalDeploys: existing.count,
  }, null, 2));
} else if (command === 'trigger') {
  const triggerType = args[0] || 'manual';
  const reason = args.slice(1).join(' ') || 'operator-initiated';

  let triggers = getTriggerContext();
  const trigger = {
    id: `trigger-${Date.now()}`,
    type: triggerType,
    reason,
    source: process.env.OPERATOR || 'kilo',
    branch: git('branch --show-current'),
    commit: git('log -1 --format=%H').slice(0, 7),
    timestamp: new Date().toISOString(),
  };
  triggers.triggers.unshift(trigger);
  if (triggers.triggers.length > 100) triggers.triggers = triggers.triggers.slice(0, 100);
  saveJson(TRIGGERS_LOG, triggers);

  process.env.DEPLOY_TRIGGER = `${triggerType}:${reason}`;
  console.log(JSON.stringify({ status: 'triggered', triggerId: trigger.id, type: triggerType }));
} else if (command === 'triggers') {
  const triggers = getTriggerContext();
  console.log(`\n  DEPLOY TRIGGERS (${triggers.triggers.length}):`);
  for (const t of triggers.triggers.slice(0, 20)) {
    const ts = t.timestamp.slice(0, 19).replace('T', ' ');
    console.log(`  ${ts}  [${t.type}]  ${t.reason}  (${t.commit})`);
  }
} else if (command === 'heroku-branch-check') {
  const herokuBranch = git('ls-remote heroku HEAD');
  const mainBranch = git('ls-remote origin main');
  console.log(JSON.stringify({
    herokuHEAD: herokuBranch || 'unknown',
    originMain: mainBranch || 'unknown',
    localBranch: git('branch --show-current'),
    note: 'Heroku deploys from whatever branch is pushed as main.',
  }));
} else {
  console.log(`
  Deploy Log System
  ─────────────────────────────────────────────────────────
  Usage: node scripts/deploy-log.mjs <command> [args]

  Commands:
    log [note]              Log current deploy with optional note
    list [limit]            Show recent deploy history
    status                  Show last deploy status
    trigger <type> <reason> Create a deploy trigger
    triggers                List deploy triggers
    heroku-branch-check     Verify Heroku branch alignment
  `);
}
