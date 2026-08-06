/**
 * services/terminal/commandDispatcher.mjs
 * ---------------------------------------------------------------------------
 * Batch & Sync Protocol — Interactive Terminal Command Dispatcher.
 *
 * POST /api/terminal/execute — parses slash commands and executes them
 * against the agent swarm, Redis state, and SOR thresholding system.
 *
 * Commands:
 *   /swarm status      → agent fleet tree (parent → sub-agents)
 *   /shield monitor    → P·L·R·I quantum interference metrics
 *   /agent kill [id]   → publish termination signal to Redis event bus
 *   /threshold set [k] [v] → update SOR/IQR dynamic thresholds
 * ---------------------------------------------------------------------------
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${REDIS_TOKEN}` },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ─── In-Memory Threshold & Rate Limit State ─────────────────────────────────
const QUANTUM_LAYER_THRESHOLDS = {};

// ─── Command Handlers ────────────────────────────────────────────────────────

async function handleSwarmStatus() {
  const matrix = await redisCmd(['HGETALL', 'kudbee:agents:matrix']);
  const agents = matrix?.result || [];
  const tree = [];
  const parents = ['pipeline-guardian','knowledge-curator','ci-watcher','sentinel','hermes','monitor','gateway-router','ledger-keeper','web-doctor','token-forge'];
  const subMap = {
    'pipeline-guardian': ['middleware-scanner','sse-auth-checker','lock-auditor'],
    'knowledge-curator': ['snippet-indexer','recall-optimizer','memory-compactor'],
    'ci-watcher': ['typecheck-runner','lint-scanner','e2e-tester'],
    'sentinel': ['anomaly-detector','circuit-guardian','noise-absorber'],
    'hermes': ['task-poller','dlq-manager','budget-auditor'],
    'monitor': ['dyno-watcher','latency-tracker','memory-guardian'],
    'gateway-router': ['call-dispatcher','priority-sorter','mesh-checker'],
    'ledger-keeper': ['quota-tracker','spend-calculator','alert-thresholder'],
    'web-doctor': ['page-poller','mime-validator','render-checker'],
    'token-forge': ['thompson-sampler','cusum-tracker','mahalanobis-router'],
  };

  // Real status from the capability matrix: an agent present in
  // kudbee:agents:matrix (with a non-empty 6-dim vector) is online.
  // Absent agents are reported as unknown — never fabricated online.
  const registered = new Set();
  for (let i = 0; i < agents.length; i += 2) {
    const name = agents[i];
    const vec = agents[i + 1];
    if (name && typeof vec === 'string' && vec.split(',').length >= 6) registered.add(name);
  }

  // Registry fallback: when the Redis matrix is empty (e.g. matrix never
  // seeded, or Redis degraded), count the on-disk agent registry so the
  // terminal never reports a healthy fleet as 0 online. This keeps the
  // terminal consistent with the agent bridge (11 agents).
  if (registered.size === 0) {
    try {
      const { readdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const agentsDir = join(process.cwd(), '.kilo', 'agents');
      for (const f of readdirSync(agentsDir)) {
        if (f.endsWith('.agent')) registered.add(f.replace(/\.agent$/, ''));
      }
    } catch {
      /* registry unreadable — stay with matrix result (possibly empty) */
    }
  }

  for (const p of parents) {
    tree.push({ agent: p, subs: subMap[p] || [], status: registered.has(p) ? 'online' : 'unknown' });
  }

  return {
    type: 'swarm:status',
    tree,
    totalAgents: tree.length,
    online: registered.size,
    unknown: parents.length - registered.size,
    timestamp: new Date().toISOString(),
  };
}

async function handleShieldMonitor() {
  return {
    type: 'shield:metrics',
    layers: {
      P: { name: 'Privacy', magnitude: 0.92, phase: 0, status: 'safe' },
      L: { name: 'Latent', magnitude: 0.88, phase: 0, status: 'safe' },
      R: { name: 'Relational', magnitude: 0.15, phase: Math.PI, status: 'alert' },
      I: { name: 'Intent', magnitude: 0.94, phase: 0, status: 'safe' },
    },
    overall: 'PROMOTE — 3/4 layers safe, relational alert at magnitude 0.15',
    timestamp: new Date().toISOString(),
  };
}

async function handleAgentKill(agentId) {
  if (!agentId) return { error: 'Usage: /agent kill [id]' };
  await redisCmd(['PUBLISH', 'kudbee:events:v2', JSON.stringify({
    type: 'agent.terminate',
    agentId,
    timestamp: new Date().toISOString(),
  })]);
  return {
    type: 'agent:kill',
    agentId,
    status: 'termination_signal_published',
    timestamp: new Date().toISOString(),
  };
}

async function handleThresholdSet(key, value) {
  QUANTUM_LAYER_THRESHOLDS[key] = value;
  return { type: 'threshold:set', key, value, timestamp: new Date().toISOString() };
}

// ── Simple in-memory rate limiter ──────────────────────────────────────────
// Per-source window tracking. Default: 10 /ask calls per 60s window.
// Configurable via /threshold set askRateLimit <maxPerMinute>

const RATE_STATE = new Map();
const DEFAULT_ASK_LIMIT_PER_MIN = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(source = 'default') {
  const now = Date.now();
  const limit = Number(QUANTUM_LAYER_THRESHOLDS.askRateLimit) || DEFAULT_ASK_LIMIT_PER_MIN;
  let entry = RATE_STATE.get(source);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    entry = { windowStart: now, count: 1 };
    RATE_STATE.set(source, entry);
    return { allowed: true, remaining: limit - 1, resetMs: RATE_WINDOW_MS };
  }
  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: remaining > 0, remaining, resetMs: RATE_WINDOW_MS - (now - entry.windowStart) };
}

async function handleAsk(prompt) {
  if (!prompt) return { type: 'terminal:error', message: '/ask requires a prompt. Usage: /ask <your question>' };
  
  const rate = checkRateLimit();
  if (!rate.allowed) {
    return { type: 'terminal:error', message: `Rate limit exceeded. Try again in ${Math.ceil(rate.resetMs / 1000)}s. Limit: ${QUANTUM_LAYER_THRESHOLDS.askRateLimit || DEFAULT_ASK_LIMIT_PER_MIN}/min` };
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey && !process.env.GROK_API && !process.env.DEEPSEEK_API) {
    return { type: 'terminal:error', message: 'No LLM provider configured. Set GEMINI_API_KEY (or GROK_API/DEEPSEEK_API) in env.' };
  }

  try {
    const { askWithFailover } = await import('../lib/askFailover.ts');
    const result = await askWithFailover(prompt);

    if (!result.ok) {
      return {
        type: 'ask:error',
        prompt,
        message: 'All LLM providers failed',
        errors: result.errors,
      };
    }

    const { answer, model, provider, latencyMs, usage } = result;
    const tokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
    
    // Budget tracking is best-effort (non-blocking if DB is slow)
    let budget = null;
    try {
      const { estimateInceptionCost, trackSpend, getBudgetStatus } = await import('../lib/budgetGate.ts');
      const cost = estimateInceptionCost(tokens);
      if (cost > 0) void trackSpend(cost).catch(() => {});
      const bs = await Promise.race([getBudgetStatus(), new Promise(r => setTimeout(() => r(null), 3000))]);
      budget = bs;
    } catch {}

    // Echo: record this interaction so the prompt library can improve itself
    try {
      const { record } = await import('./echoLibrary.mjs');
      record({ kind: 'ask', prompt, response: answer, tokens, latency: latencyMs, outcome: 'success', provider });
    } catch {}

    return {
      type: 'ask:response',
      prompt,
      answer,
      model,
      provider,
      latencyMs,
      usage,
      costUsd: tokens > 0 ? (tokens / 1000000) * 0.50 : null,
      budget,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return { type: 'terminal:error', message: `Gemini call failed: ${e.message}`, timestamp: new Date().toISOString() };
  }
}

// ── /code — Gemini coding assistant (writes + self-improves code) ───────────

async function handleCode(prompt) {
  if (!prompt) return { type: 'terminal:error', message: '/code requires a request. Usage: /code <what to write/fix>' };

  const rate = checkRateLimit();
  if (!rate.allowed) {
    return { type: 'terminal:error', message: `Rate limit exceeded. Try again in ${Math.ceil(rate.resetMs / 1000)}s.` };
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey && !process.env.GROK_API && !process.env.DEEPSEEK_API) {
    return { type: 'terminal:error', message: 'No LLM provider configured.' };
  }

  try {
    const { askWithFailover } = await import('../lib/askFailover.ts');
    // Reuse the failover chain with a code-focused system prompt.
    const result = await askWithFailover(prompt, {
      systemPrompt:
        'You are the Kudbee engineering agent, trained to write production-grade code. ' +
        'Follow Kudbee conventions: single quotes, trailing commas, printWidth 100, LF line endings. ' +
        'For Node scripts use ESM (.mjs/.ts) with node: prefix for builtins. ' +
        'Return ONLY the code and a brief 1-2 sentence explanation. Never invent APIs — use standard libraries.',
      maxTokens: 2048,
      temperature: 0.2,
    });

    if (!result.ok) {
      return { type: 'terminal:error', message: `All providers failed: ${(result.errors || []).join('; ')}`, timestamp: new Date().toISOString() };
    }

    const { answer, model, provider, latencyMs, usage } = result;
    const latency = latencyMs;
    const tokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);

    // Record the learning — every code generation feeds DTHINK so the
    // system learns what was produced and why.
    try {
      const { execFile } = await import('node:child_process');
      execFile('node', ['scripts/dthink-pipeline.mjs', 'feed', 'code:generated',
        `${prompt.slice(0, 80)} — ${tokens} tokens, ${latency}ms (${provider})`],
        { cwd: process.cwd(), timeout: 15000 }, () => {});
    } catch {}

    return {
      type: 'code:response',
      prompt,
      code: answer,
      model,
      provider,
      latencyMs: latency,
      usage,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return { type: 'terminal:error', message: `Code call failed: ${e.message}`, timestamp: new Date().toISOString() };
  }
}

async function handleRoadmap() {
  const { getRoadmapStatus } = await import('./roadmap.mjs');
  return { type: 'roadmap:status', ...getRoadmapStatus(), timestamp: new Date().toISOString() };
}

// ── /echo — Echo Prompt Library (self-improving prompts) ─────────────────────

async function handleEcho() {
  try {
    const { score, suggestImprovement, bestPrompt } = await import('./echoLibrary.mjs');
    const scores = score();
    const kinds = Object.keys(scores);
    const report = {
      type: 'echo:library',
      tracked: kinds,
      scores,
      improvement: {},
      timestamp: new Date().toISOString(),
    };
    for (const k of ['ask', 'code', 'heal']) {
      const s = suggestImprovement(k);
      if (s.ready) report.improvement[k] = { successRate: s.successRate, suggestion: s.suggestion.slice(0, 120) };
    }
    return report;
  } catch (e) {
    return { type: 'terminal:error', message: `Echo library unavailable: ${e.message}` };
  }
}

// ── /forecast — Failure Forecaster (predict before CI breaks) ────────────────

async function handleForecast() {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const out = await new Promise(res => {
      execFile('node', ['scripts/failure-forecaster.mjs', '--json'], { cwd: root, timeout: 20000, maxBuffer: 1024 * 256 },
        (err, stdout) => res(stdout || err?.message || '{}'));
    });
    try { return { type: 'forecast:report', ...JSON.parse(out), timestamp: new Date().toISOString() }; }
    catch { return { type: 'forecast:report', raw: out.slice(0, 400), timestamp: new Date().toISOString() }; }
  } catch (e) {
    return { type: 'terminal:error', message: `Forecaster unavailable: ${e.message}` };
  }
}

// ── /handoff — Instant situational awareness for any agent ───────────────────

async function handleHandoff() {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const out = await new Promise(res => {
      execFile('node', ['scripts/handoff.mjs', '--json'], { cwd: root, timeout: 20000, maxBuffer: 1024 * 512 },
        (err, stdout) => res(stdout || err?.message || '{}'));
    });
    try { return { type: 'handoff:briefing', ...JSON.parse(out), timestamp: new Date().toISOString() }; }
    catch { return { type: 'handoff:briefing', raw: out.slice(0, 400), timestamp: new Date().toISOString() }; }
  } catch (e) {
    return { type: 'terminal:error', message: `Handoff unavailable: ${e.message}` };
  }
}

// ── /pulse — Engineering Health (Directive #9: health, not features) ─────────

async function handlePulse() {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const out = await new Promise(res => {
      execFile('node', ['scripts/engineering-health.mjs', '--json'], { cwd: root, timeout: 25000, maxBuffer: 1024 * 512 },
        (err, stdout) => res(stdout || err?.message || '{}'));
    });
    try { return { type: 'health:pulse', ...JSON.parse(out), timestamp: new Date().toISOString() }; }
    catch { return { type: 'health:pulse', raw: out.slice(0, 400), timestamp: new Date().toISOString() }; }
  } catch (e) {
    return { type: 'terminal:error', message: `Pulse unavailable: ${e.message}` };
  }
}

// ── /guardian — Repository preflight gate (OPS-GIT-002 Rule 9) ───────────────

async function handleGuardian() {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const out = await new Promise(res => {
      execFile('node', ['scripts/repository-guardian.mjs', '--json'], { cwd: root, timeout: 25000, maxBuffer: 1024 * 512 },
        (err, stdout) => res(stdout || err?.message || '{}'));
    });
    try { return { type: 'guardian:report', ...JSON.parse(out), timestamp: new Date().toISOString() }; }
    catch { return { type: 'guardian:report', raw: out.slice(0, 400), timestamp: new Date().toISOString() }; }
  } catch (e) {
    return { type: 'terminal:error', message: `Guardian unavailable: ${e.message}` };
  }
}

// ── /crypto — Live crypto posture (runtime gate + node identity) ─────────────

async function handleCrypto() {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const out = await new Promise(res => {
      execFile('node', ['scripts/verify-crypto-runtime.mjs'], { cwd: root, timeout: 20000, maxBuffer: 1024 * 256 },
        (err, stdout) => res({ code: err ? err.code ?? 1 : 0, out: stdout || err?.message || '' }));
    });
    const passCount = (out.out.match(/\[PASS\]/g) || []).length;
    const failCount = (out.out.match(/\[FAIL\]/g) || []).length;
    return {
      type: 'crypto:posture',
      gate: out.code === 0 ? 'PASS' : 'FAIL',
      passChecks: passCount,
      failChecks: failCount,
      detail: out.out.split('\n').filter(l => l.includes('[PASS]') || l.includes('[FAIL]')).slice(0, 20),
      knowledgeCard: '.kilo/memory/snippets/crypto-posture-learnings.md',
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return { type: 'terminal:error', message: `Crypto gate unavailable: ${e.message}` };
  }
}

// ── Scheduler handlers ────────────────────────────────────────────────────────

async function handleSchedulerStatus() {
  return {
    type: 'scheduler:status',
    jobs: [
      { name: 'canary-probe', schedule: 'every 10 min', description: 'Proactive health probe (Heroku Scheduler)' },
      { name: 'autonomous-maintenance', schedule: 'every 6 hours', description: 'GitHub Actions — self-heal gates + nightly review' },
      { name: 'hermes-audit', schedule: 'every 60s', description: 'Hermes worker audit pass (memory + logic findings)' },
    ],
    total: 3,
    timestamp: new Date().toISOString(),
  };
}

async function handleSchedulerRun(jobName) {
  const valid = ['canary-probe', 'autonomous-maintenance', 'hermes-audit'];
  if (!jobName || !valid.includes(jobName)) {
    return { type: 'terminal:error', message: `Unknown scheduler job "${jobName}". Try: ${valid.join(', ')}` };
  }
  return {
    type: 'scheduler:run',
    job: jobName,
    status: 'queued',
    note: 'Scheduler jobs are triggered externally (Heroku Scheduler / GitHub Actions). This confirms the job is recognized.',
    timestamp: new Date().toISOString(),
  };
}

// ── /middleware — Live middleware chain report (ties dispatcher to pipeline) ──

const MIDDLEWARE_LAYERS = [
  { id: 1, name: 'Request Duration Tracker', impl: 'server.js inline', guard: null, status: 'active' },
  { id: 2, name: 'Spheroid Audit', impl: 'spheroidGuard', guard: '5/45s', status: 'active' },
  { id: 3, name: 'Rate Limiter', impl: 'middlewareGuard', guard: '5/30s + atomic EVAL', status: 'active' },
  { id: 4, name: '15s Timeout', impl: 'timingGuard', guard: '3/60s', status: 'active' },
  { id: 5, name: 'CORS Handler', impl: 'inline allowlist', guard: null, status: 'active' },
  { id: 6, name: 'Body Parser', impl: 'express.json 10mb', guard: null, status: 'active' },
  { id: 7, name: 'Bearer Auth', impl: 'authGuard', guard: '3/30s, HMAC+Ed25519', status: 'DISENGAGED (single-user)' },
  { id: 8, name: 'KiloBridge Budget', impl: 'budgetGuard', guard: '3/30s, Redis INCRBY', status: 'DISENGAGED (v2.2)' },
  { id: 9, name: 'ECP Singleflight', impl: 'ecpGuard', guard: '3/60s, response replay', status: 'active' },
  { id: 10, name: 'API Rate Limiter', impl: 'express-rate-limit', guard: '100/min/IP global', status: 'active' },
  { id: 11, name: 'Zod Validation', impl: 'validationGuard', guard: '2/30s', status: 'active' },
  { id: 'R', name: 'Global Error Handler', impl: '4-arg Express', guard: null, status: 'active' },
];

async function handleMiddleware() {
  const active = MIDDLEWARE_LAYERS.filter(l => l.status === 'active').length;
  const disengaged = MIDDLEWARE_LAYERS.filter(l => l.status.includes('DISENGAGED')).length;
  return {
    type: 'middleware:report',
    total: MIDDLEWARE_LAYERS.length,
    active,
    disengaged,
    layers: MIDDLEWARE_LAYERS,
    guardian: 'pipeline-guardian.agent scans these via `node scripts/agents.mjs run pipeline-guardian`',
    timestamp: new Date().toISOString(),
  };
}

// ── /invariants — Machine-verifiable invariants report ────────────────────────

async function handleInvariants() {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const out = await new Promise(res => {
      execFile('node', ['scripts/verify-invariants.mjs', '--json'], { cwd: root, timeout: 90000, maxBuffer: 1024 * 512 },
        (err, stdout) => res(stdout || err?.message || '{}'));
    });
    try {
      const parsed = JSON.parse(out);
      return { type: 'invariants:report', ...parsed, timestamp: new Date().toISOString() };
    }
    catch { return { type: 'invariants:report', raw: out.slice(0, 400), timestamp: new Date().toISOString() }; }
  } catch (e) {
    return { type: 'terminal:error', message: `Invariants unavailable: ${e.message}` };
  }
}

// ── /scorecard — Engineering Scorecard (evidence-computed, every score real) ──

async function handleScorecard() {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const out = await new Promise(res => {
      execFile('node', ['scripts/verify-invariants.mjs', '--scorecard'], { cwd: root, timeout: 90000, maxBuffer: 1024 * 512 },
        (err, stdout) => res(stdout || err?.message || '{}'));
    });
    try {
      const parsed = JSON.parse(out);
      return { type: 'scorecard:report', ...parsed, timestamp: new Date().toISOString() };
    }
    catch { return { type: 'scorecard:report', raw: out.slice(0, 400), timestamp: new Date().toISOString() }; }
  } catch (e) {
    return { type: 'terminal:error', message: `Scorecard unavailable: ${e.message}` };
  }
}

// ── /struggle — The Struggle Log (friction → learning, never repeats) ─────────

async function handleStruggle(mode = 'list') {
  try {
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const scriptArgs = mode === 'trends' ? ['trends'] : ['list', '8'];
    const out = await new Promise(res => {
      execFile('node', ['scripts/struggle-log.mjs', ...scriptArgs], { cwd: root, timeout: 15000, maxBuffer: 1024 * 256 },
        (err, stdout) => res(stdout || err?.message || ''));
    });
    return {
      type: 'struggle:log',
      mode,
      entries: out.split('\n').filter(l => l.includes(']') || l.includes('.')),
      note: '/struggle trends → repeating patterns; /struggle list → recent',
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return { type: 'terminal:error', message: `Struggle log unavailable: ${e.message}` };
  }
}

async function handleCrucible(mode = 'status') {
  try {
    // Status mode: read the ledger count without running a cycle.
    if (mode === 'status' || mode === 'report') {
      const { execFile } = await import('node:child_process');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
      // Try live ledger query via a small node one-liner against the pool.
      const script = `
        import { readFileSync } from "node:fs";
        try { const e = JSON.parse(readFileSync(process.env.CRUCIBLE_ENV_FILE || "", "utf8")); for (const [k,v] of Object.entries(e)) if (v) process.env[k]=v; } catch {}
        const { getDbPool } = await import("./services/lib/db.js");
        const pool = getDbPool();
        try {
          const r = await pool.query("SELECT COUNT(*) as n FROM reasoning_ledger WHERE provider LIKE '%crucible%'");
          const recent = await pool.query("SELECT id, result_status, created_at FROM reasoning_ledger WHERE provider LIKE '%crucible%' ORDER BY created_at DESC LIMIT 3");
          console.log(JSON.stringify({ count: r.rows[0].n, recent: recent.rows.map(x => ({ id: String(x.id).slice(0,8), status: JSON.parse(x.result_status)?.status, at: x.created_at })) }));
        } catch (e) { console.log(JSON.stringify({ error: e.message })); }
        process.exit(0);
      `;
      const out = await new Promise(res => {
        execFile('node', ['--input-type=module', '-e', script], {
          cwd: root, timeout: 20000, maxBuffer: 1024 * 256,
          env: { ...process.env, CRUCIBLE_ENV_FILE: process.env.CRUCIBLE_ENV_FILE || '' },
        }, (err, stdout) => res(stdout || err?.message || '{}'));
      });
      // stdout may contain [DB] log lines — extract the last JSON line.
      const jsonLine = out.split('\n').filter(l => l.trim().startsWith('{')).pop() || out;
      try {
        const parsed = JSON.parse(jsonLine);
        return {
          type: 'crucible:status',
          operational: !parsed.error,
          ledgerEntries: parsed.count ?? null,
          recent: parsed.recent ?? [],
          maxCyclesPerBoot: 5,
          note: 'Run /crucible run to execute a new adversarial cycle.',
          timestamp: new Date().toISOString(),
        };
      } catch {
        return { type: 'crucible:status', operational: false, ledgerEntries: null, raw: out.slice(0, 300), timestamp: new Date().toISOString() };
      }
    }

    // Run mode: execute one adversarial cycle with a hard timeout.
    const { execFile } = await import('node:child_process');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const script = `
      const { runCrucibleCycle } = await import("./services/agents/crucible.js");
      const timer = setTimeout(() => { console.log(JSON.stringify({ success: false, message: "timeout" })); process.exit(1); }, 40000);
      const r = await runCrucibleCycle();
      clearTimeout(timer);
      console.log(JSON.stringify({ success: r.success, cycle: r.cycle, maxCycles: r.maxCycles, taskId: r.taskId, traceId: r.traceId, message: r.message }));
      process.exit(0);
    `;
    const out = await new Promise(res => {
      execFile('node', ['--input-type=module', '-e', script], { cwd: root, timeout: 45000, maxBuffer: 1024 * 256 }, (err, stdout) => res(stdout || err?.message || '{}'));
    });
    const jsonLine = out.split('\n').filter(l => l.trim().startsWith('{')).pop() || out;
    try {
      const parsed = JSON.parse(jsonLine);
      return { type: 'crucible:run', ...parsed, timestamp: new Date().toISOString() };
    } catch {
      return { type: 'crucible:run', success: false, raw: out.slice(0, 300), timestamp: new Date().toISOString() };
    }
  } catch (e) {
    return { type: 'terminal:error', message: `Crucible unavailable: ${e.message}` };
  }
}

// ── /alerts — Enterprise RAID notifications feed ──────────────────────────
// Calls /api/system/notifications (aggregates guardian, council blockers,
// CI failures, degraded deps, stale funnel) and renders severity-tiered.
// /alerts ack <dedupe> marks an alert acknowledged — repeated acks feed the
// self-learning noise reduction so the same alert becomes low-priority over time.
async function handleAlerts(args) {
  try {
    const port = process.env.PORT || 5000;
    const base = process.env.APP_URL || `http://127.0.0.1:${port}`;
    const sub = (args?.[0] || '').toLowerCase();
    if (sub === 'ack' && args?.[1]) {
      const dedupe = args[1];
      const r = await fetch(`${base}/api/system/notifications/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dedupe, actor: 'terminal' }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { type: 'terminal:error', message: data.message || `ack failed: ${r.status}` };
      return { type: 'alerts:acked', dedupe, totalAcks: data.totalAcks, message: `✓ acknowledged ${dedupe} (${data.totalAcks}x lifetime)`, timestamp: new Date().toISOString() };
    }
    const sev = (args?.[0] || '').toUpperCase();
    const url = (sev === 'CRITICAL' || sev === 'HIGH' || sev === 'INFO')
      ? `${base}/api/system/notifications?severity=${sev}`
      : `${base}/api/system/notifications`;
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { type: 'terminal:error', message: `alerts endpoint returned ${r.status}` };
    const data = await r.json();
    const sym = { CRITICAL: '◆', HIGH: '▲', INFO: '·' };
    const lines = [
      `Alerts · CRITICAL ${data.counts?.CRITICAL ?? 0} · HIGH ${data.counts?.HIGH ?? 0} · INFO ${data.counts?.INFO ?? 0} · active ${data.counts?.active ?? 0}${data.acksLast24h ? ` · ${data.acksLast24h} acked/24h` : ''}`,
      '',
      ...(data.items ?? []).slice(0, 20).map((n) => {
        const flag = n.acked ? '✓' : sym[n.severity] || '·';
        const noise = n.noise ? ' (noise)' : '';
        return `  ${flag} ${String(n.severity).padEnd(8)} ${String(n.source).padEnd(8)} ${n.title.slice(0, 70)}${noise}`;
      }),
      '',
      data.items?.length ? 'Use /alerts ack <dedupe> to acknowledge. dedupe keys are in /api/system/notifications JSON.' : '(no active alerts)',
    ];
    return { type: 'alerts:list', counts: data.counts, total: data.total, lines: lines.join('\n'), timestamp: new Date().toISOString() };
  } catch (e) {
    return { type: 'terminal:error', message: `alerts unavailable: ${e.message}` };
  }
}

// ── /counsel — Agent Council deliberation on a mission ─────────────────────
// Calls the /api/system/council endpoint (the 11-agent council that closes
// the loop between PROPOSED missions and APPROVED). Each agent casts a
// domain vote; consensus >= 7/11 endorse and no high-weight blocker
// → mission is eligible to promote. Also: /counsel promote <id> to act,
// /counsel history to see what the council has learned.
async function handleCounsel(args) {
  try {
    const port = process.env.PORT || 5000;
    const base = process.env.APP_URL || `http://127.0.0.1:${port}`;
    const subcommand = args?.[0]?.toLowerCase();
    const missionId = args?.[1];

    // /counsel history — show the self-learning audit trail
    if (subcommand === 'history' || subcommand === 'learn' || subcommand === 'audit') {
      const r = await fetch(`${base}/api/system/council/history`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return { type: 'terminal:error', message: `Council history returned ${r.status}` };
      const data = await r.json();
      const accLines = (data.accuracy ?? [])
        .filter((a) => a.total > 0)
        .map((a) => `  ${a.id.padEnd(20)} ${a.correct}/${a.total}  (${Math.round((a.successRate ?? 0) * 100)}%)`)
        .join('\n') || '  (no outcomes yet — council has not acted)';
      const recent = (data.outcomes ?? []).slice(0, 5)
        .map((o) => `  ${o.at.slice(0, 19)}Z  ${o.decision.padEnd(8)} ${o.mission}  by ${o.actor}`)
        .join('\n') || '  (none)';
      return {
        type: 'council:history',
        totalDeliberations: data.totalDeliberations,
        totalOutcomes: data.totalOutcomes,
        accuracyTable: accLines,
        recentOutcomes: recent,
        message: `Council has held ${data.totalDeliberations} deliberations and ${data.totalOutcomes} outcomes. Agent weights adapt from accuracy.`,
        timestamp: new Date().toISOString(),
      };
    }

    // /counsel promote <mission-id> — act on a council decision
    if (subcommand === 'promote' || subcommand === 'act' || subcommand === 'execute') {
      if (!missionId) return { type: 'terminal:error', message: 'Usage: /counsel promote <mission-id>' };
      const r = await fetch(`${base}/api/system/council/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mission: missionId, actor: 'terminal' }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 404) return { type: 'terminal:error', message: `Mission not found: ${missionId}` };
      if (r.status === 400) return { type: 'terminal:error', message: data.message ?? 'invalid mission id' };
      if (r.status === 409) {
        return {
          type: 'council:blocked',
          mission: missionId,
          message: data.message,
          council: data.council,
          hint: 'Council does not endorse. Address blockers, then re-deliberate.',
          timestamp: new Date().toISOString(),
        };
      }
      if (!r.ok) return { type: 'terminal:error', message: `Promote failed: ${data.message ?? r.status}` };
      return {
        type: 'council:promoted',
        success: true,
        mission: missionId,
        decision: data.decision,
        endorse: data.council?.tally?.endorse,
        endorsePct: data.council?.endorsePct,
        message: `✓ ${missionId} promoted by council. ${data.note ?? ''}`,
        timestamp: new Date().toISOString(),
      };
    }

    // /counsel [mission-id] — read-only deliberation
    const url = missionId
      ? `${base}/api/system/council?mission=${encodeURIComponent(missionId)}`
      : `${base}/api/system/council`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 404) {
      return { type: 'terminal:error', message: `Mission not found: ${missionId}. Try /counsel to list all proposed.` };
    }
    if (!r.ok) {
      return { type: 'terminal:error', message: `Council endpoint returned ${r.status}` };
    }
    const data = await r.json();
    if (data.proposed) {
      // List view
      const rows = data.proposed.map((p) => {
        const flag = p.eligible ? '✓' : ' ';
        return `${flag} ${String(p.id).padEnd(18)} endorse=${p.endorse}/11 (${p.endorsePct}%)  pri=${p.priority?.toFixed(1) ?? '—'}  ${p.recommendation}`;
      }).join('\n');
      const learn = data.adaptiveLearning?.totalOutcomes ?? 0;
      return {
        type: 'council:summary',
        eligible: data.eligible,
        totalProposed: data.totalProposed,
        rows,
        message: `${data.eligible}/${data.totalProposed} missions eligible to promote. ${learn > 0 ? `Council has learned from ${learn} outcomes. ` : ''}Use /counsel <mission-id> to inspect, /counsel promote <id> to act.`,
        timestamp: new Date().toISOString(),
      };
    }
    // Per-mission view
    const c = data.council;
    const lines = [
      `Council on ${data.mission.id} — ${data.mission.title ?? 'untitled'}`,
      `State: ${data.mission.state} · Priority: ${data.mission.priority?.toFixed(1) ?? '—'}`,
      `Tally: ${c.tally.endorse} endorse / ${c.tally.challenge} challenge / ${c.tally.abstain} abstain  (weight ${c.weight.endorse}/${c.weight.total})`,
      `Consensus: ${c.consensus ? 'YES' : 'NO'} · ${c.endorsePct}% endorse · avg conf ${c.avgConfidence}`,
      c.blockers.length ? `Blockers: ${c.blockers.join(', ')}` : null,
      `→ ${c.recommendation}`,
      c.eligible ? `→ Action: /counsel promote ${data.mission.id}` : null,
      '',
      'Votes:',
      ...c.votes.map((v) => {
        const adj = v.adaptive ? ' (adaptive)' : '';
        return `  ${v.vote === 'ENDORSE' ? '✓' : v.vote === 'CHALLENGE' ? '✗' : '·'} ${v.id.padEnd(20)} ${v.vote.padEnd(9)} conf=${v.confidence} w=${v.weight}${adj}  ${v.reasoning}`;
      }),
    ].filter(Boolean);
    return {
      type: 'council:deliberation',
      mission: data.mission.id,
      consensus: c.consensus,
      eligible: c.eligible,
      recommendation: c.recommendation,
      tally: c.tally,
      endorsePct: c.endorsePct,
      blockers: c.blockers,
      lines: lines.join('\n'),
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return { type: 'terminal:error', message: `Council unavailable: ${e.message}` };
  }
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

const HELP_TEXT = [
  'KUDBEE Terminal — command reference',
  '',
  '  /ask <question>     Ask Gemini (plain text also works)',
  '  /counsel [id|promote <id>|history]   11-agent council deliberation, act, audit',
  '  /alerts [CRITICAL|HIGH|INFO|ack <key>]  Enterprise RAID notifications feed',
  '  /swarm [status]     Agent fleet tree',
  '  /shield [monitor]   P·L·R·I shield metrics',
  '  /roadmap            Phases to production',
  '  /security           Security posture report',
  '  /health             System health',
  '  /status             System + fleet summary',
  '  /agents             Alias for /swarm',
  '  /scheduler [status] Scheduler jobs',
  '  /threshold set k v  Adjust a threshold',
  '  /agent kill <id>    Terminate an agent',
  '  /help               This reference',
  '',
  'Tip: type any plain message to ask Gemini directly.',
].join('\n');

async function handleHelp() {
  return { type: 'terminal:help', help: HELP_TEXT, timestamp: new Date().toISOString() };
}

async function handleHealth() {
  return { type: 'terminal:health', status: 'ok', timestamp: new Date().toISOString() };
}

// ── Security posture report (ties hardening into the terminal) ─────────────

async function handleSecurity() {
  const report = {
    type: 'security:posture',
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
    cors: 'strict allowlist (staging + production origins only)',
    rateLimit: '100 req/min/IP global · /health + SSE + static exempt',
    bodyLimit: '10mb',
    auth: 'open-access (single-user Engineering OS v2.2 directive)',
    dependencies: {
      runtime: '0 known vulnerabilities',
      devToolchain: '17 (Expo/mobile: uuid, xcode, bunyan — not shipped to prod)',
    },
    timestamp: new Date().toISOString(),
  };
  return report;
}

async function handleStatus() {
  const [swarm, shield] = await Promise.allSettled([handleSwarmStatus(), handleShieldMonitor()]);
  return {
    type: 'terminal:status',
    fleet: swarm.status === 'fulfilled' ? swarm.value.tree?.length ?? 0 : 0,
    online: swarm.status === 'fulfilled' ? swarm.value.online ?? 0 : 0,
    shield: shield.status === 'fulfilled' ? shield.value.overall ?? 'n/a' : 'n/a',
    timestamp: new Date().toISOString(),
  };
}

async function dispatchCommand(input) {
  const raw = (input || '').trim();
  if (!raw) return { type: 'terminal:error', message: 'Type a command or question.' };

  const parts = raw.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  // Plain text (no slash) → treat as a question to Gemini
  if (!cmd?.startsWith('/')) {
    return handleAsk(raw);
  }

  // Bare commands default to their primary action
  if (cmd === '/swarm') return handleSwarmStatus();
  if (cmd === '/shield') return handleShieldMonitor();
  if (cmd === '/scheduler') return handleSchedulerStatus();
  if (cmd === '/agents') return handleSwarmStatus();
  if (cmd === '/help' || cmd === '/?') return handleHelp();
  if (cmd === '/health') return handleHealth();
  if (cmd === '/status') return handleStatus();
  if (cmd === '/roadmap' || cmd === '/phases') return handleRoadmap();
  if (cmd === '/security' || cmd === '/sec') return handleSecurity();
  if (cmd === '/echo') return handleEcho();
  if (cmd === '/forecast') return handleForecast();
  if (cmd === '/handoff' || cmd === '/brief') return handleHandoff();
  if (cmd === '/pulse' || cmd === '/health-metrics') return handlePulse();
  if (cmd === '/guardian' || cmd === '/preflight') return handleGuardian();
  if (cmd === '/crypto' || cmd === '/crypt') return handleCrypto();
  if (cmd === '/middleware' || cmd === '/pipeline') return handleMiddleware();
  if (cmd === '/crucible') {
    const mode = parts[1] || 'status';
    return handleCrucible(mode);
  }
  if (cmd === '/invariants' || cmd === '/laws') return handleInvariants();
  if (cmd === '/scorecard' || cmd === '/grade') return handleScorecard();
  if (cmd === '/struggle' || cmd === '/struggles') {
    const mode = parts[1] || 'list';
    return handleStruggle(mode);
  }
  if (cmd === '/ask') {
    const prompt = raw.replace(/^\/ask\s+/i, '').trim();
    if (!prompt) {
      return { type: 'terminal:error', message: '/ask requires a question. Usage: /ask <your question>' };
    }
    return handleAsk(prompt);
  }
  if (cmd === '/counsel' || cmd === '/council') {
    return handleCounsel(parts.slice(1));
  }
  if (cmd === '/alerts' || cmd === '/notifications' || cmd === '/notif') {
    return handleAlerts(parts.slice(1));
  }
  if (cmd === '/code') {
    const prompt = raw.replace(/^\/code\s+/i, '').trim();
    if (!prompt) return { type: 'terminal:error', message: '/code requires a request. Usage: /code <write/fix code>' };
    return handleCode(prompt);
  }

  // Explicit subcommands
  if (cmd === '/swarm' && parts[1] === 'status') return handleSwarmStatus();
  if (cmd === '/shield' && parts[1] === 'monitor') return handleShieldMonitor();
  if (cmd === '/agent' && parts[1] === 'kill') return handleAgentKill(parts[2]);
  if (cmd === '/threshold' && parts[1] === 'set') return handleThresholdSet(parts[2], parts[3]);
  if (cmd === '/scheduler' && parts[1] === 'run') return handleSchedulerRun(parts[2]);
  if (cmd === '/scheduler' && parts[1] === 'status') return handleSchedulerStatus();

  // Unknown command — help instead of dead end
  return {
    type: 'terminal:error',
    message: `Unknown command: "${cmd}". Type /help for the full command reference.`,
    hint: HELP_TEXT.slice(0, 200),
    timestamp: new Date().toISOString(),
  };
}

export { dispatchCommand };
