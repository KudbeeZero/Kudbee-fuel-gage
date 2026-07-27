#!/usr/bin/env node
/**
 * scripts/session-checkpoint.mjs
 * ---------------------------------------------------------------------------
 * Session Checkpoint — auto-commits .kilo/memory/ state to git at session end.
 *
 * Pipeline 1: Object Permanence
 *
 * When the agent process exits (SIGINT, SIGTERM, exit), this script:
 *   1. Dumps current agent fleet state to a formatted commit message
 *   2. Stages all .kilo/memory/ changes
 *   3. Commits with a timestamped message summarizing the session
 *   4. Pusheses to origin (optional, gated by PUSH_CHECKPOINT env var)
 *
 * The next agent booting up runs session-bootstrap.mjs which reads
 * the freshly committed memory files and resumes context seamlessly.
 *
 * Usage:
 *   node scripts/session-checkpoint.mjs setup     Install exit hooks
 *   node scripts/session-checkpoint.mjs commit     Manual checkpoint now
 *   node scripts/session-checkpoint.mjs status     Show pending changes
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MEMORY_DIR = join(REPO_ROOT, '.kilo', 'memory');

// ─── Checkpoint logic ──────────────────────────────────────────────────────

function getMemorySummary() {
  const summary = { agents: 0, decisions: 0, calls: 0, busEvents: 0, snippets: 0, journalEntries: 0, localActions: 0 };

  try {
    const agentsDir = join(REPO_ROOT, '.kilo', 'agents');
    if (existsSync(agentsDir)) summary.agents = readdirSync(agentsDir).filter(f => f.endsWith('.agent')).length;
  } catch {}

  try {
    const decDir = join(MEMORY_DIR, 'decisions');
    if (existsSync(decDir)) summary.decisions = readdirSync(decDir).filter(f => f.endsWith('.json')).length;
  } catch {}

  try {
    const clPath = join(MEMORY_DIR, 'call-log.json');
    if (existsSync(clPath)) {
      const log = JSON.parse(readFileSync(clPath, 'utf8'));
      summary.calls = (log.calls || []).length;
    }
  } catch {}

  try {
    const busIdx = join(MEMORY_DIR, 'bus', 'index.json');
    if (existsSync(busIdx)) {
      const idx = JSON.parse(readFileSync(busIdx, 'utf8'));
      summary.busEvents = (idx.events || []).length;
    }
  } catch {}

  try {
    const snipDir = join(MEMORY_DIR, 'snippets');
    if (existsSync(snipDir)) summary.snippets = readdirSync(snipDir).filter(f => f.endsWith('.snippet')).length;
  } catch {}

  try {
    const jPath = join(MEMORY_DIR, 'journal.json');
    if (existsSync(jPath)) {
      const j = JSON.parse(readFileSync(jPath, 'utf8'));
      summary.journalEntries = (j.journal || []).length;
    }
  } catch {}

  try {
    const lbDir = join(MEMORY_DIR, 'local-bus');
    if (existsSync(lbDir)) summary.localActions = readdirSync(lbDir).filter(f => f.startsWith('act-')).length;
  } catch {}

  return summary;
}

function buildCommitMessage(summary) {
  const ts = new Date().toISOString().slice(0, 19);
  return [
    `checkpoint: session snapshot ${ts}`,
    '',
    `Agents:    ${summary.agents}`,
    `Decisions: ${summary.decisions}`,
    `Calls:     ${summary.calls}`,
    `Bus:       ${summary.busEvents} events`,
    `Snippets:  ${summary.snippets}`,
    `Journal:   ${summary.journalEntries} entries`,
    `Actions:   ${summary.localActions} (local bus)`,
    '',
    `Auto-committed by session-checkpoint.mjs`,
  ].join('\n');
}

function stageMemoryFiles() {
  try {
    // Stage all memory files + .kilo config
    execSync('git add .kilo/memory/ .kilo/agents/ .kilo/skill/ .kilo/cache/ .kilo/command/ .kilo/agent/ .kilo/scripts/ TERMINAL.md AGENTS.md scripts/ --intent-to-add 2>/dev/null', {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

function commitCheckpoint() {
  const summary = getMemorySummary();
  const message = buildCommitMessage(summary);

  const staged = stageMemoryFiles();
  if (!staged) {
    console.log('[checkpoint] Could not stage files — git may not be available');
    return false;
  }

  try {
    execSync(`git commit --allow-empty -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, GIT_AUTHOR_NAME: 'Kudbee Agent', GIT_AUTHOR_EMAIL: 'agent@kudbee.internal', GIT_COMMITTER_NAME: 'Kudbee Agent', GIT_COMMITTER_EMAIL: 'agent@kudbee.internal' },
    });
    console.log(`[checkpoint] ✓ Committed: ${summary.agents} agents, ${summary.decisions} decisions, ${summary.busEvents} bus events, ${summary.calls} calls`);
    return true;
  } catch (err) {
    // No changes to commit is not an error
    if (err.message?.includes('nothing to commit') || err.message?.includes('no changes added')) {
      console.log('[checkpoint] No changes to commit — memory is clean');
      return true;
    }
    console.error(`[checkpoint] ✗ Commit failed: ${err.message?.slice(0, 100)}`);
    return false;
  }
}

function pushCheckpoint() {
  if (process.env.PUSH_CHECKPOINT !== 'true') {
    console.log('[checkpoint] Push skipped (set PUSH_CHECKPOINT=true to auto-push)');
    return;
  }
  try {
    execSync('git push origin HEAD 2>/dev/null || true', { cwd: REPO_ROOT, encoding: 'utf8', timeout: 15000 });
    console.log('[checkpoint] Pushed to origin');
  } catch {
    console.log('[checkpoint] Push failed (non-critical)');
  }
}

// ─── Install hooks ─────────────────────────────────────────────────────────

function installHooks() {
  const checkpointOnExit = () => {
    console.log('\n[checkpoint] Session ending — saving state...');
    commitCheckpoint();
    pushCheckpoint();
    console.log('[checkpoint] State persisted. Next agent will resume from this point.\n');
  };

  // Trap normal exit
  process.on('exit', () => {
    try { commitCheckpoint(); } catch {}
  });

  // Trap signals
  process.on('SIGINT', () => {
    checkpointOnExit();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    checkpointOnExit();
    process.exit(0);
  });

  // Trap uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error(`[checkpoint] Uncaught exception: ${err.message}`);
    try { commitCheckpoint(); } catch {}
    process.exit(1);
  });

  console.log('[checkpoint] ✓ Exit hooks installed — memory will auto-commit on session end');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

switch (cmd) {
  case 'setup':
  case 'install':
    installHooks();
    break;

  case 'commit':
  case 'save': {
    const ok = commitCheckpoint();
    if (ok && process.argv.includes('--push')) pushCheckpoint();
    process.exit(ok ? 0 : 1);
  }

  case 'status':
  case 'pending': {
    const summary = getMemorySummary();
    console.log(`\n  Checkpoint Status:`);
    console.log(`  ─────────────────`);
    console.log(`  Agents:    ${summary.agents}`);
    console.log(`  Decisions: ${summary.decisions}`);
    console.log(`  Calls:     ${summary.calls}`);
    console.log(`  Bus events: ${summary.busEvents}`);
    console.log(`  Snippets:  ${summary.snippets}`);
    console.log(`  Journal:   ${summary.journalEntries} entries`);
    console.log(`  Local bus: ${summary.localActions} actions`);
    console.log();

    try {
      const diff = execSync('git diff --stat .kilo/memory/ 2>/dev/null || echo "(no git)"', { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 });
      console.log(`  Uncommitted changes:\n  ${diff || '(clean)'}`);
    } catch {}
    break;
  }

  default:
    console.log(`
  Session Checkpoint — Object Permanence (Pipeline 1)

  Commands:
    setup     Install exit hooks (auto-commit on SIGINT/SIGTERM/exit)
    commit    Manual checkpoint (commit memory state now)
    status    Show pending changes summary
    commit --push  Checkpoint + push to origin

  Behavior:
    On exit, stages .kilo/memory/ + .kilo/agents/ + TERMINAL.md + AGENTS.md
    Commits with agent count, decision count, bus events, calls
    Next agent reads committed state via session-bootstrap.mjs
`);
}
