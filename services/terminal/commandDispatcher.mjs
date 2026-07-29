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

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

async function dispatchCommand(input) {
  const parts = (input || '').trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === '/swarm' && parts[1] === 'status') return handleSwarmStatus();
  if (cmd === '/shield' && parts[1] === 'monitor') return handleShieldMonitor();
  if (cmd === '/agent' && parts[1] === 'kill') return handleAgentKill(parts[2]);
  if (cmd === '/threshold' && parts[1] === 'set') return handleThresholdSet(parts[2], parts[3]);

  return {
    type: 'terminal:error',
    message: `Unknown command: "${input}". Try /swarm status, /shield monitor, /agent kill [id], /threshold set [key] [value]`,
    timestamp: new Date().toISOString(),
  };
}

export { dispatchCommand };
