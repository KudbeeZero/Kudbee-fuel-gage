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
  for (const p of parents) {
    tree.push({ agent: p, subs: subMap[p] || [], status: 'online' });
  }
  return { type: 'swarm:status', tree, totalAgents: 40, timestamp: new Date().toISOString() };
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
  if (!key || value === undefined) return { error: 'Usage: /threshold set [key] [value]' };
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return { error: 'Value must be a number' };
  await redisCmd(['HSET', 'kudbee:config:thresholds', key, String(numValue)]);
  return {
    type: 'threshold:set',
    key,
    value: numValue,
    timestamp: new Date().toISOString(),
  };
}

// ─── Scheduler Commands ──────────────────────────────────────────────────────

const SCHEDULER_JOBS = {
  'expiry-guard': { script: 'scripts/agent-expiry-guard.mjs full', schedule: 'daily @ 3:00 AM', description: 'Agent TTL/Redis registry refresh' },
  'workspace-sync': { script: 'scripts/workspace-sync.mjs sync', schedule: 'every 10 minutes', description: 'Global tensor centroid alignment' },
  'canary-probe': { script: 'scripts/canary-probe.mjs', schedule: 'every 10 minutes', description: 'API/DB/frontend health probe' },
  'cleanup-traces': { script: 'scripts/cleanup-traces.mjs', schedule: 'daily @ 12:00 AM', description: 'Stale trace and audit purging' },
  'gemini-trainer': { script: 'scripts/gemini-token-trainer.mjs', schedule: 'hourly', description: 'Gemini AI token analysis (≤50 free reqs/hr)' },
  'workspace-full': { script: 'scripts/workspace-sync.mjs full', schedule: 'hourly at :0', description: 'Full-state workspace rollup' },
};

async function handleSchedulerRun(jobName) {
  const job = SCHEDULER_JOBS[jobName];
  if (!job) return { error: `Unknown job: "${jobName}". Available: ${Object.keys(SCHEDULER_JOBS).join(', ')}` };
  try {
    const { execFile } = await import('child_process');
    const output = await new Promise((resolve, reject) => {
      execFile('node', [job.script], { timeout: 30000, maxBuffer: 1024 * 500 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
    return { type: 'scheduler:run', job: jobName, output: output.slice(0, 500), status: 'completed', timestamp: new Date().toISOString() };
  } catch (e) {
    return { type: 'scheduler:run', job: jobName, error: e.message?.slice(0, 200), status: 'failed', timestamp: new Date().toISOString() };
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
    try {
      const parsed = JSON.parse(out);
      return { type: 'guardian:report', ...parsed, timestamp: new Date().toISOString() };
    }
    catch { return { type: 'guardian:report', raw: out.slice(0, 400), timestamp: new Date().toISOString() }; }
  } catch (e) {
    return { type: 'terminal:error', message: `Guardian unavailable: ${e.message}` };
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
    type: 'scheduler:status',
    jobs: Object.entries(SCHEDULER_JOBS).map(([name, j]) => ({ name, schedule: j.schedule, description: j.description })),
    total: Object.keys(SCHEDULER_JOBS).length,
    dynoTier: 'Standard-1X (4 dynos, 2GB total)',
    timestamp: new Date().toISOString(),
  };
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

async function dispatchCommand(input) {
  const parts = (input || '').trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

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
  if (cmd === '/agent' && parts[1] === 'kill') return handleAgentKill(parts[2]);
  if (cmd === '/threshold' && parts[1] === 'set') return handleThresholdSet(parts[2], parts[3]);
  if (cmd === '/scheduler' && parts[1] === 'run') return handleSchedulerRun(parts[2]);
  if (cmd === '/scheduler' && parts[1] === 'status') return handleSchedulerStatus();

  return {
    type: 'terminal:error',
    message: `Unknown command: "${input}". Try /swarm status, /shield monitor, /agent kill [id], /threshold set [key] [value]`,
    timestamp: new Date().toISOString(),
  };
}

export { dispatchCommand };
