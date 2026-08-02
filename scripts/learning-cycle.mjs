#!/usr/bin/env node
/**
 * scripts/learning-cycle.mjs
 * ---------------------------------------------------------------------------
 * THINK Protocol — Continuous Engineering Learning cycle.
 *
 * Initiated by KILOH at the end of every engineering session. Each core agent
 * reports what happened; KILOH classifies the knowledge and writes durable
 * learning records.
 *
 * Usage:
 *   node scripts/learning-cycle.mjs run          # full learning cycle
 *   node scripts/learning-cycle.mjs report <agent>  # agent learning report
 *   node scripts/learning-cycle.mjs classify     # classify open learnings
 *
 * Durable store: .kilo/memory/learnings/ (git-committed engineering knowledge)
 * ---------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LEARNINGS_DIR = join(ROOT, '.kilo', 'memory', 'learnings');
const AGENTS = ['pipeline-guardian', 'ci-watcher', 'knowledge-curator'];

export const KNOWLEDGE_CLASSIFICATIONS = [
  'architecture',
  'implementation-pattern',
  'bug-fix',
  'performance-optimization',
  'workflow-improvement',
  'testing-strategy',
  'deployment',
  'security',
  'dependency-management',
  'operational-runbook',
];

function ensureDir() {
  mkdirSync(LEARNINGS_DIR, { recursive: true });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function run(cmd) {
  try {
    return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', cwd: ROOT }).trim();
  } catch {
    return null;
  }
}

/** Generate a learning report for one agent (best-effort, no DTHINK dependency). */
function agentReport(agentId) {
  const decisions = run(`ls .kilo/memory/decisions/dec-*.json 2>/dev/null | wc -l`) ?? '0';
  const snippets = run(`ls .kilo/skill/${agentId}/LEARNINGS.json 2>/dev/null && node -e "try{const d=JSON.parse(require('fs').readFileSync('.kilo/skill/${agentId}/LEARNINGS.json','utf8'));console.log(d.patterns.totalActions||0)}catch{}"`) ?? '0';
  return {
    agentId,
    timestamp: new Date().toISOString(),
    decisionsLogged: decisions,
    actionsRecorded: snippets,
    status: 'reported',
  };
}

/** Write a classified learning record (durable engineering knowledge). */
function writeLearning(record) {
  ensureDir();
  const id = `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const file = join(LEARNINGS_DIR, `${id}.json`);
  const full = { id, createdAt: new Date().toISOString(), ...record };
  writeFileSync(file, JSON.stringify(full, null, 2), 'utf8');
  return full;
}

/** Run the full learning cycle for all core agents. */
function runCycle() {
  ensureDir();
  const reports = AGENTS.map(agentReport);
  const sessionId = run(`node scripts/session-bootstrap.mjs 2>/dev/null | grep -o 'ses-[0-9]*-[a-f0-9]*' | head -1`) ?? `ses-${Date.now()}`;

  const cycle = {
    type: 'learning-cycle',
    agentId: 'kiloh',
    sessionId,
    date: today(),
    summary: `Learning cycle: ${reports.length} agents reported`,
    data: { reports },
    contractVersion: '1.0.0',
  };

  writeLearning(cycle);

  // Record in DTHINK (best-effort)
  try {
    execFileSync('node', ['scripts/dthink-pipeline.mjs', 'feed', 'agent:learning', cycle.summary], { timeout: 5000 });
  } catch {
    /* best-effort */
  }

  return cycle;
}

const command = process.argv[2];

switch (command) {
  case 'run': {
    const cycle = runCycle();
    console.log(`Learning cycle complete — ${cycle.data.reports.length} agents reported`);
    for (const r of cycle.data.reports) {
      console.log(`  ${r.agentId}: ${r.decisionsLogged} decisions, ${r.actionsRecorded} actions`);
    }
    console.log(`Recorded: ${LEARNINGS_DIR}/`);
    break;
  }
  case 'report': {
    const agentId = process.argv[3];
    if (!agentId) {
      console.error('Usage: learning-cycle report <agent>');
      process.exit(1);
    }
    console.log(JSON.stringify(agentReport(agentId), null, 2));
    break;
  }
  case 'classify': {
    console.log('Knowledge classifications:');
    for (const c of KNOWLEDGE_CLASSIFICATIONS) console.log(`  - ${c}`);
    break;
  }
  default: {
    console.error(`
THINK Protocol — Continuous Engineering Learning

Commands:
  run                Run full learning cycle (all core agents)
  report <agent>     Generate one agent's learning report
  classify           List knowledge classifications
`);
    process.exit(1);
  }
}
