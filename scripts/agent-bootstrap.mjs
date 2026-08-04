#!/usr/bin/env node
/**
 * scripts/agent-bootstrap.mjs — Universal Agent Tap-In
 * ---------------------------------------------------------------------------
 * Lets ANY agent (local, Heroku, cloud, CI runner) plug into the Kudbee
 * system and immediately BOTH learn from AND contribute to it.
 *
 *   agent-bootstrap.mjs discover   → detect environment + endpoints
 *   agent-bootstrap.mjs register   → register this agent in the swarm
 *   agent-bootstrap.mjs learn      → pull knowledge (snippets, decisions, DTHINK)
 *   agent-bootstrap.mjs contribute → push a decision/insight into the pipeline
 *   agent-bootstrap.mjs loop       → full autonomous loop (learn→decide→contribute)
 *
 * Environment detection order: local (file-based) → Heroku API → public API.
 * Works with ZERO configuration: every layer degrades gracefully.
 * ---------------------------------------------------------------------------
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MEMORY_DIR = join(REPO_ROOT, '.kilo', 'memory');
const LOCAL_STATE_DIR = join(MEMORY_DIR, 'local-state');

// ── Environment detection ────────────────────────────────────────────────────

const KNOWN_ENVS = [
  { id: 'production', url: 'https://kudbee-fuel-gage-330ade653a62.herokuapp.com' },
  { id: 'staging', url: 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com' },
  { id: 'local', url: 'http://127.0.0.1:3000' },
];

async function detectEnv() {
  const explicit = process.env.KUDBEE_ENV || process.env.APP_ENV;
  if (explicit) return KNOWN_ENVS.find(e => e.id === explicit) || KNOWN_ENVS[1];

  // 1. Running on Heroku?
  if (process.env.DYNO) {
    return process.env.DYNO.includes('staging') ? KNOWN_ENVS[1] : KNOWN_ENVS[0];
  }
  // 2. Heroku API key present?
  if (process.env.HEROKU_API_KEY) {
    try {
      const res = await fetch('https://api.heroku.com/apps/kudbee-fuel-gage', {
        headers: { Authorization: `Bearer ${process.env.HEROKU_API_KEY}`, 'Accept': 'application/vnd.heroku+json; version=3' },
      });
      if (res.ok) return KNOWN_ENVS[0];
    } catch {}
  }
  // 3. Probe which env responds
  for (const env of KNOWN_ENVS) {
    try {
      const res = await fetch(`${env.url}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return env;
    } catch {}
  }
  return { id: 'unknown', url: '' };
}

// ── State helpers (file-based; Redis-independent) ────────────────────────────

function localStateFile(agentId) {
  return join(LOCAL_STATE_DIR, `${agentId}.json`);
}

function readLocalState(agentId) {
  const f = localStateFile(agentId);
  if (!existsSync(f)) return { registered: false, joinedAt: null, lastLearn: null, lastContribute: null, insights: 0 };
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; }
}

function writeLocalState(agentId, state) {
  if (!existsSync(LOCAL_STATE_DIR)) mkdirSync(LOCAL_STATE_DIR, { recursive: true });
  writeFileSync(localStateFile(agentId), JSON.stringify(state, null, 2));
}

// ── Operations ───────────────────────────────────────────────────────────────

async function discover() {
  const env = await detectEnv();
  console.log(`[bootstrap] environment: ${env.id} (${env.url || 'no endpoint'})`);
  console.log(`[bootstrap] agent count (file): ${existsSync(join(MEMORY_DIR, 'local-state')) ? readdirCount(join(MEMORY_DIR, 'local-state')) : 0}`);
  console.log(`[bootstrap] memory dir: ${existsSync(MEMORY_DIR) ? 'present' : 'missing'}`);
  console.log(`[bootstrap] endpoints: /health, /api/terminal/execute, /api/system/health-deep`);
  return env;
}

function readdirCount(dir) {
  try { return readdirSync(dir).length; } catch { return 0; }
}

async function register(agentId = process.env.AGENT_ID || 'tap-in-agent') {
  const env = await detectEnv();
  const state = readLocalState(agentId);
  state.registered = true;
  state.joinedAt = state.joinedAt || new Date().toISOString();
  state.environment = env.id;
  writeLocalState(agentId, state);
  console.log(`[bootstrap] agent "${agentId}" registered → ${env.id}`);
  console.log(`[bootstrap] state persisted at .kilo/memory/local-state/${agentId}.json`);
  // Also announce on serial bus if available
  try {
    const { execFile } = await import('node:child_process');
    execFile('node', ['scripts/serial-bus.mjs', 'publish', 'agent:registered', agentId], { cwd: REPO_ROOT, timeout: 10000 }, () => {});
  } catch {}
  return state;
}

async function learn(agentId = process.env.AGENT_ID || 'tap-in-agent') {
  const env = await detectEnv();
  const state = readLocalState(agentId);
  const learned = [];

  // Pull knowledge from the live system (if reachable)
  if (env.url) {
    try {
      const r = await fetch(`${env.url}/api/system/health-deep`, { signal: AbortSignal.timeout(8000) });
      const h = await r.json();
      learned.push(`system: ${h.status} (postgres ${h.services?.postgres?.status}, redis ${h.services?.redis?.status})`);
    } catch { learned.push('system: unreachable — using local memory only'); }
  }

  // Local knowledge always available
  const snippets = join(MEMORY_DIR, 'snippets');
  if (existsSync(snippets)) {
    const files = readdirSync(snippets).filter(f => f.endsWith('.snippet') || f.endsWith('.md'));
    learned.push(`snippets: ${files.length} knowledge cards`);
  }
  const decisions = join(MEMORY_DIR, 'decisions');
  if (existsSync(decisions)) {
    learned.push(`decisions: ${readdirSync(decisions).filter(f => f.endsWith('.json')).length} past decisions`);
  }

  state.lastLearn = new Date().toISOString();
  writeLocalState(agentId, state);
  console.log(`[bootstrap] learned from system:`);
  learned.forEach(l => console.log(`  • ${l}`));
  return learned;
}

async function contribute(agentId = process.env.AGENT_ID || 'tap-in-agent', insight = '') {
  const env = await detectEnv();
  const state = readLocalState(agentId);
  state.insights = (state.insights || 0) + 1;
  state.lastContribute = new Date().toISOString();
  writeLocalState(agentId, state);

  const payload = {
    id: `insight-${Date.now()}`,
    agent: agentId,
    insight: insight || 'Agent tapped in and is contributing to the system.',
    environment: env.id,
    timestamp: new Date().toISOString(),
  };

  // 1. Local DTHINK feed (always works)
  try {
    const { execFile } = await import('node:child_process');
    await new Promise(res => execFile('node', ['scripts/dthink-pipeline.mjs', 'feed', 'agent:contribution', payload.insight],
      { cwd: REPO_ROOT, timeout: 15000 }, () => res()));
  } catch {}

  // 2. Live system feed (if reachable)
  if (env.url) {
    try {
      await fetch(`${env.url}/api/terminal/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `/ask ${payload.insight}` }), signal: AbortSignal.timeout(15000),
      }).catch(() => {});
    } catch {}
  }

  console.log(`[bootstrap] contribution #${state.insights} recorded: ${payload.insight.slice(0, 60)}`);
  return payload;
}

async function loop(agentId = process.env.AGENT_ID || 'tap-in-agent') {
  console.log('═══ AUTONOMOUS LOOP — tap in, learn, contribute ═══');
  await register(agentId);
  await learn(agentId);
  await contribute(agentId, 'Autonomous agent loop executed — learning and contributing.');
  const state = readLocalState(agentId);
  console.log(`═══ LOOP COMPLETE — agent "${agentId}" active, ${state.insights} contributions ═══`);
  return state;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const action = process.argv[2] || 'discover';
switch (action) {
  case 'discover': await discover(); break;
  case 'register': await register(process.argv[3]); break;
  case 'learn': await learn(process.argv[3]); break;
  case 'contribute': await contribute(process.argv[3], process.argv.slice(4).join(' ')); break;
  case 'loop': await loop(process.argv[3]); break;
  default:
    console.log('Usage: agent-bootstrap.mjs <discover|register|learn|contribute|loop> [agentId] [insight...]');
}
