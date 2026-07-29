/**
 * services/reward/outcome-oracle.mjs
 * ---------------------------------------------------------------------------
 * Vector 10 — Outcome Oracle (Reality Check Layer).
 *
 * Monitors downstream outcomes (CI pipeline results, Heroku deployment health,
 * E2E test passes) and computes a reward score R for each agent's task execution.
 *
 * The reward feeds into Vector 4's backpropagateReward() which adjusts the
 * Agent Capability Matrix (K) based on actual performance:
 *
 *   R = α · Success - β · Failure - γ · Latency
 *   K_new = K_old + η · (R · Q)
 *
 * This is the "backpropagation" layer that makes the swarm self-correct.
 * Without it, agents that produce bad code keep getting tasks. With it,
 * success strengthens routing gravity; failure penalizes it.
 * ---------------------------------------------------------------------------
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ─── Reward Function ─────────────────────────────────────────────────────────

const REWARD_ALPHA = 1.0;  // success weight
const REWARD_BETA = 0.8;   // failure penalty
const REWARD_GAMMA = 0.1;  // latency penalty (per second over baseline)
const BASELINE_LATENCY_MS = 200; // expected execution time
const LEARNING_RATE = 0.05; // η — how aggressively to update weights

/**
 * Compute reward score from task outcome.
 *
 * @param {Object} outcome — { success: boolean, latencyMs: number, errors: string[] }
 * @returns {number} reward score R (positive = good, negative = bad)
 */
function computeReward(outcome) {
  const { success = false, latencyMs = 0, errors = [] } = outcome || {};

  const successScore = success ? REWARD_ALPHA : 0;
  const failurePenalty = success ? 0 : REWARD_BETA * (0.5 + Math.min(errors.length, 10) * 0.05);
  const latencyPenalty = Math.max(0, (latencyMs - BASELINE_LATENCY_MS) / 1000) * REWARD_GAMMA;

  const R = successScore - failurePenalty - latencyPenalty;
  return Math.round(R * 10000) / 10000;
}

// ─── Outcome Sources ─────────────────────────────────────────────────────────

const OUTCOME_REGISTRY = [];

/**
 * Register an outcome listener for a specific event source.
 * Called when CI/CD or deployment outcomes resolve.
 */
function registerOutcome(eventType, callback) {
  OUTCOME_REGISTRY.push({ eventType, callback });
}

/**
 * Dispatch an outcome event to all registered listeners.
 */
async function dispatchOutcome(eventType, outcome) {
  const reward = computeReward(outcome);
  const envelope = {
    type: 'reward.computed',
    eventType,
    outcome,
    reward,
    timestamp: new Date().toISOString(),
  };

  // Publish to Redis for Vector 4 callback
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      await fetch(REDIS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
        body: JSON.stringify(['PUBLISH', 'kudbee:stream:audit', JSON.stringify(envelope)]),
      });
    } catch (e) { console.error('[outcome-oracle] Redis publish failed:', e.message); }
  }

  // Notify registered listeners
  for (const listener of OUTCOME_REGISTRY) {
    if (listener.eventType === eventType || listener.eventType === '*') {
      try {
        await listener.callback(envelope);
      } catch (e) { console.error('[outcome-oracle] Listener callback failed:', e.message); }
    }
  }

  return envelope;
}

// ─── CI Outcome Integration ──────────────────────────────────────────────────

/**
 * Evaluate CI pipeline outcome — called when typecheck/lint/e2e complete.
 */
function evaluateCiOutcome(typecheckPass, lintErrors, e2ePass, latencyMs, agentId) {
  const success = typecheckPass && lintErrors === 0 && e2ePass;
  const errors = [];
  if (!typecheckPass) errors.push('typecheck_failed');
  if (lintErrors > 0) errors.push('lint_errors:' + lintErrors);
  if (!e2ePass) errors.push('e2e_failed');

  return dispatchOutcome('ci.pipeline', {
    success,
    latencyMs,
    errors,
    agentId,
    details: { typecheckPass, lintErrors, e2ePass },
  });
}

/**
 * Evaluate Heroku deployment outcome.
 */
function evaluateDeployOutcome(healthStatus, latencyMs, agentId) {
  const success = healthStatus === 'ok' || healthStatus === 'HEALTHY';
  const errors = success ? [] : ['deploy_degraded:' + healthStatus];

  return dispatchOutcome('heroku.deploy', {
    success,
    latencyMs,
    errors,
    agentId,
    details: { healthStatus },
  });
}

/**
 * Evaluate E2E test outcome.
 */
function evaluateE2eOutcome(passed, total, latencyMs, agentId) {
  if (!total || total <= 0) {
    return dispatchOutcome('e2e.test', {
      success: false, latencyMs, errors: ['e2e_no_tests_defined'], agentId,
      details: { passed: passed || 0, total: total || 0 },
    });
  }
  const success = passed === total;
  const errors = success ? [] : ['e2e_failure:' + passed + '/' + total];

  return dispatchOutcome('e2e.test', {
    success,
    latencyMs,
    errors,
    agentId,
    details: { passed, total },
  });
}

// ─── Matrix Backpropagation ──────────────────────────────────────────────────

/**
 * Apply the reward to an agent's capability vector.
 *
 * K_new = K_old + η · (R · Q)
 *
 * @param {string} agentId — which agent to update
 * @param {number[]} queryVector — the 6-dim task query vector Q
 * @param {number} rewardScore — computed reward R
 * @param {number[]} currentK — current K vector
 * @returns {number[]} updated K vector
 */
function backpropagateReward(agentId, queryVector, rewardScore, currentK) {
  const updated = [...currentK];
  const eta = LEARNING_RATE;

  // K_new[i] = K_old[i] + η · reward · Q[i]
  for (let i = 0; i < updated.length; i++) {
    const delta = eta * rewardScore * (queryVector[i] || 0);
    updated[i] = Math.max(0, Math.min(1, Math.round((updated[i] + delta) * 10000) / 10000));
  }

  return updated;
}

// ─── Oracle Integration with Vector 4 ────────────────────────────────────────

/**
 * Wire the oracle to automatically trigger backpropagation when outcomes resolve.
 * This is the bridge between Vector 10 (Reward) and Vector 4 (Attention Routing).
 */
function wireOracleToRouter(routerModule) {
  registerOutcome('ci.pipeline', async (envelope) => {
    const { agentId, reward } = envelope;
    if (!agentId || !routerModule) return;

    // Import dynamically to avoid circular deps
    const { CAPABILITY_EMBEDDINGS } = routerModule;

    if (CAPABILITY_EMBEDDINGS && CAPABILITY_EMBEDDINGS[agentId]) {
      const currentK = CAPABILITY_EMBEDDINGS[agentId];
      const queryVector = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]; // default Q
      const newK = backpropagateReward(agentId, queryVector, reward, currentK);
      CAPABILITY_EMBEDDINGS[agentId] = newK;
    }
  });

  registerOutcome('heroku.deploy', async (envelope) => {
    const { agentId, reward } = envelope;
    if (!agentId || !routerModule) return;
    const { CAPABILITY_EMBEDDINGS } = routerModule;
    if (CAPABILITY_EMBEDDINGS && CAPABILITY_EMBEDDINGS[agentId]) {
      const currentK = CAPABILITY_EMBEDDINGS[agentId];
      const queryVector = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      const newK = backpropagateReward(agentId, queryVector, reward, currentK);
      CAPABILITY_EMBEDDINGS[agentId] = newK;
    }
  });
}

// ─── SOR Dynamic Thresholding ────────────────────────────────────────────────

const CONSECUTIVE_FAILURES = new Map();

function updateDynamicThreshold(agentId, success) {
  const count = CONSECUTIVE_FAILURES.get(agentId) || 0;
  if (success) {
    CONSECUTIVE_FAILURES.set(agentId, 0);
    return 0.75; // base threshold
  }
  CONSECUTIVE_FAILURES.set(agentId, count + 1);
  // Raise threshold with each consecutive failure
  return Math.min(0.95, 0.75 + count * 0.05);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  computeReward,
  evaluateCiOutcome,
  evaluateDeployOutcome,
  evaluateE2eOutcome,
  backpropagateReward,
  wireOracleToRouter,
  updateDynamicThreshold,
  dispatchOutcome,
  LEARNING_RATE,
  REWARD_ALPHA,
  REWARD_BETA,
  REWARD_GAMMA,
};
