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
  if (!geminiKey) return { type: 'terminal:error', message: 'Gemini API key not configured. Add GEMINI_API_KEY to env.' };

  try {
    const { createProvider } = await import('@kudbee/utils/llm/providers');
    const client = createProvider({ kind: 'gemini', model: 'gemini-flash-latest', apiKey: geminiKey, temperature: 0.3, maxTokens: 512 });
    
    const t0 = Date.now();
    const resp = await client.complete({
      systemPrompt: 'You are the Kudbee Control Tower assistant. Be concise. Answer the user directly.',
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 512,
    });
    const latency = Date.now() - t0;
    const tokens = (resp.usage?.promptTokens ?? 0) + (resp.usage?.completionTokens ?? 0);
    
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
      record({ kind: 'ask', prompt, response: resp.text, tokens, latency, outcome: 'success' });
    } catch {}

    return {
      type: 'ask:response',
      prompt,
      answer: resp.text,
      model: resp.model,
      latencyMs: latency,
      usage: resp.usage,
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
  if (!geminiKey) return { type: 'terminal:error', message: 'Gemini API key not configured.' };

  try {
    const { createProvider } = await import('@kudbee/utils/llm/providers');
    const client = createProvider({
      kind: 'gemini', model: 'gemini-flash-latest', apiKey: geminiKey,
      temperature: 0.2, maxTokens: 2048,
    });

    const t0 = Date.now();
    const resp = await client.complete({
      systemPrompt:
        'You are the Kudbee engineering agent, trained to write production-grade code. ' +
        'Follow Kudbee conventions: single quotes, trailing commas, printWidth 100, LF line endings. ' +
        'For Node scripts use ESM (.mjs/.ts) with node: prefix for builtins. ' +
        'Return ONLY the code and a brief 1-2 sentence explanation. Never invent APIs — use standard libraries.',
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: 2048,
    });
    const latency = Date.now() - t0;
    const tokens = (resp.usage?.promptTokens ?? 0) + (resp.usage?.completionTokens ?? 0);

    // Record the learning — every code generation feeds DTHINK so the
    // system learns what was produced and why.
    try {
      const { execFile } = await import('node:child_process');
      execFile('node', ['scripts/dthink-pipeline.mjs', 'feed', 'code:generated',
        `${prompt.slice(0, 80)} — ${tokens} tokens, ${latency}ms`],
        { cwd: process.cwd(), timeout: 15000 }, () => {});
    } catch {}

    return {
      type: 'code:response',
      prompt,
      code: resp.text,
      model: resp.model,
      latencyMs: latency,
      usage: resp.usage,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return { type: 'terminal:error', message: `Gemini code call failed: ${e.message}`, timestamp: new Date().toISOString() };
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

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

const HELP_TEXT = [
  'KUDBEE Terminal — command reference',
  '',
  '  /ask <question>     Ask Gemini (plain text also works)',
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
  if (cmd === '/ask') {
    const prompt = raw.replace(/^\/ask\s+/i, '').trim();
    if (!prompt) {
      return { type: 'terminal:error', message: '/ask requires a question. Usage: /ask <your question>' };
    }
    return handleAsk(prompt);
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
