/**
 * services/router/attention-router.mjs
 * ---------------------------------------------------------------------------
 * Vector 4 — Transformer-Style Attention Routing Engine.
 *
 * Instead of passing messages through rigid, hardcoded chains, the system
 * treats incoming tasks as Queries (Q), agent capabilities as Keys (K), and
 * agent execution payloads as Values (V).
 *
 * Architecture:
 *   Q (task query) · K^T (agent capability matrix) → scaled dot-product
 *   → Softmax((Q · K^T) / √d_k) → top-k agent selection → dispatch V payloads
 *
 * Uses the 6-dim capability matrix stored in Redis `kudbee:agents:matrix`.
 * Each agent has a vector: [security, orchestration, observability, governance, training, frontend]
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ─── Configuration ───────────────────────────────────────────────────────────

const DIMENSION = 6; // 6-dim capability vector
const TOP_K_THRESHOLD = 0.75; // Minimum attention score to activate agent
const TEMPERATURE = 1.0; // Softmax temperature
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ─── Capability Matrix ───────────────────────────────────────────────────────

const CAPABILITY_EMBEDDINGS = {
  'pipeline-guardian':   [0.95, 0.1, 0.3, 0.2, 0.1, 0.1],
  'knowledge-curator':   [0.1, 0.2, 0.1, 0.1, 0.3, 0.2],
  'ci-watcher':          [0.2, 0.1, 0.4, 0.1, 0.1, 0.3],
  'sentinel':            [0.98, 0.05, 0.15, 0.1, 0.05, 0.05],
  'hermes':              [0.1, 0.1, 0.1, 0.95, 0.1, 0.05],
  'monitor':             [0.15, 0.1, 0.9, 0.1, 0.05, 0.1],
  'gateway-router':      [0.1, 0.95, 0.1, 0.05, 0.05, 0.05],
  'ledger-keeper':       [0.05, 0.1, 0.1, 0.85, 0.05, 0.05],
  'web-doctor':          [0.1, 0.05, 0.5, 0.05, 0.05, 0.95],
  'token-forge':         [0.05, 0.05, 0.05, 0.1, 0.95, 0.05],
};

// ─── Math Utilities ──────────────────────────────────────────────────────────

function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function softmax(scores) {
  const max = Math.max(...scores);
  const expScores = scores.map(s => Math.exp((s - max) / TEMPERATURE));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  return expScores.map(s => s / sumExp);
}

/**
 * Calculate attention scores for a given task query against all agents.
 *
 * @param {number[]} queryVector — 6-dim task embedding
 * @param {Record<string, number[]>} capabilityMatrix — agent capability vectors
 * @returns {Array<{agentId: string, score: number}>} sorted by score descending
 */
function calculateAttentionScores(queryVector, capabilityMatrix = CAPABILITY_EMBEDDINGS) {
  const scores = [];
  for (const [agentId, capabilityVector] of Object.entries(capabilityMatrix)) {
    const similarity = dotProduct(queryVector, capabilityVector);
    scores.push({ agentId, rawScore: similarity });
  }

  const rawScores = scores.map(s => s.rawScore);
  const attentionWeights = softmax(rawScores);

  return scores.map((s, i) => ({
    agentId: s.agentId,
    score: Math.round(attentionWeights[i] * 10000) / 10000,
    rawScore: Math.round(s.rawScore * 1000) / 1000,
  })).sort((a, b) => b.score - a.score);
}

// ─── Task Query Embedding ────────────────────────────────────────────────────

const TASK_PATTERNS = {
  security: [/vuln/i, /attack/i, /byzantine/i, /hack/i, /exploit/i, /NOAUTH/i],
  orchestration: [/route/i, /dispatch/i, /mesh/i, /call/i, /phone tree/i],
  observability: [/monitor/i, /health/i, /log/i, /watch/i, /diagnos/i, /status/i],
  governance: [/govern/i, /budget/i, /quota/i, /ledger/i, /spend/i, /worker/i],
  training: [/token/i, /train/i, /learn/i, /SOR/i, /promote/i, /prune/i, /DTHINK/i],
  frontend: [/ui/i, /css/i, /html/i, /render/i, /component/i, /screen/i, /crash/i],
};

/**
 * Embed a task description into a 6-dim query vector.
 */
function embedTaskQuery(taskDescription = '') {
  const desc = taskDescription.toLowerCase();
  const query = [0, 0, 0, 0, 0, 0];
  const dims = ['security', 'orchestration', 'observability', 'governance', 'training', 'frontend'];
  
  for (let d = 0; d < dims.length; d++) {
    let score = 0;
    for (const pattern of TASK_PATTERNS[dims[d]]) {
      if (pattern.test(desc)) score += 0.9;
    }
    query[d] = Math.min(1, score);
  }

  // Normalize
  const norm = Math.sqrt(query.reduce((a, b) => a + b * b, 0));
  if (norm > 0) {
    for (let i = 0; i < query.length; i++) query[i] = Math.round(query[i] / norm * 1000) / 1000;
  }

  return query;
}

// ─── Route Task ──────────────────────────────────────────────────────────────

/**
 * Route a task to the top-k most relevant agents based on attention scores.
 *
 * @param {string} taskPayload — description of the task
 * @param {number} topK — maximum number of agents to activate (default 3)
 * @param {Object} options — { threshold, capabilityMatrix, dispatchFn }
 * @returns {Object} routing result with scores and selected agents
 */
async function routeTask(taskPayload, topK = 3, options = {}) {
  const {
    threshold = TOP_K_THRESHOLD,
    capabilityMatrix = CAPABILITY_EMBEDDINGS,
    dispatchFn = null,
  } = options;

  const queryVector = embedTaskQuery(taskPayload);
  const attentionScores = calculateAttentionScores(queryVector, capabilityMatrix);

  // Filter and select top-k agents
  const selected = attentionScores
    .filter(a => a.score >= threshold)
    .slice(0, topK);

  // Feedback: update capability matrix based on this routing
  updateFeedbackMatrix(selected, queryVector, taskPayload);

  // Dispatch to selected agents
  const dispatched = [];
  if (dispatchFn) {
    for (const agent of selected) {
      try {
        await dispatchFn(agent.agentId, {
          task: taskPayload,
          queryVector,
          attentionScore: agent.score,
          timestamp: new Date().toISOString(),
        });
        dispatched.push({ agentId: agent.agentId, status: 'dispatched' });
      } catch (err) {
        dispatched.push({ agentId: agent.agentId, status: 'failed', error: err.message });
      }
    }
  }

  return {
    query: queryVector.map(v => Math.round(v * 100) / 100),
    allScores: attentionScores.slice(0, 5),
    selected: selected.map(s => ({ agentId: s.agentId, score: s.score })),
    dispatched,
    inactiveCount: attentionScores.length - selected.length,
    timestamp: new Date().toISOString(),
  };
}

// ─── DTHINK Feedback Loop ────────────────────────────────────────────────────

const feedbackHistory = [];

function updateFeedbackMatrix(selectedAgents, queryVector, taskPayload) {
  for (const agent of selectedAgents) {
    feedbackHistory.push({
      agentId: agent.agentId,
      score: agent.score,
      query: taskPayload.slice(0, 80),
      timestamp: new Date().toISOString(),
    });
    if (feedbackHistory.length > 50) feedbackHistory.shift();
  }
}

function getFeedbackHistory() {
  return feedbackHistory;
}

/**
 * Strengthen or weaken capability vectors based on task outcomes.
 * If agent succeeded → strengthen relevant dimensions by 2%.
 * If agent failed → weaken by 1%.
 */
function adjustCapability(agentId, taskType, success) {
  const caps = CAPABILITY_EMBEDDINGS[agentId];
  if (!caps) return;

  const dims = ['security', 'orchestration', 'observability', 'governance', 'training', 'frontend'];
  const idx = dims.indexOf(taskType);
  if (idx === -1) return;

  const delta = success ? 0.02 : -0.01;
  caps[idx] = Math.max(0, Math.min(1, caps[idx] + delta));
}

// ─── Agent Matrix Persistence ────────────────────────────────────────────────

async function syncMatrixToRedis() {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const writes = [];
    for (const [agent, vector] of Object.entries(CAPABILITY_EMBEDDINGS)) {
      writes.push([
        'HSET', 'kudbee:agents:matrix', agent, vector.join(',')
      ]);
    }
    for (const cmd of writes) {
      await fetch(REDIS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
        body: JSON.stringify(cmd),
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  CAPABILITY_EMBEDDINGS,
  calculateAttentionScores,
  embedTaskQuery,
  routeTask,
  adjustCapability,
  getFeedbackHistory,
  syncMatrixToRedis,
};
