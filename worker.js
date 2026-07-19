/**
 * worker.js
 * ---------------------------------------------------------------------------
 * HERMES autonomous background worker.
 *
 * Responsibilities:
 *   1. Establish a resilient Redis connection via the shared getRedisClient
 *      pattern (services/lib/redis.js).
 *   2. Continuously poll the `kudbee:governance:tasks` queue (blocking pop)
 *      for pending tasks.
 *   3. For each task, invoke the Governance Router's `matchLogic(prompt)`:
 *        - FAST_BRAIN match  -> apply the proven logic path directly.
 *        - SLOW_BRAIN        -> call the LLM, capture the reasoning trace, and
 *                               save it as a new "Proposed" action in the
 *                               Governance dashboard (status: PROPOSED) for
 *                               human approval into the Proven index.
 *   4. Run the HERMES "Autonomous Logic Auditor" loop on a fixed cadence.
 *   5. Report its own health-check / heartbeat so the Control Tower global
 *      status bar can show HERMES as Online/Offline.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from './services/lib/redis.js';
import { matchLogic, proposeAction } from './services/governance/router.js';
import { hermes, runAudit, publishHeartbeat, reportOffline } from './services/agents/hermes.js';

const TASKS_QUEUE = 'kudbee:governance:tasks';
const AUDIT_INTERVAL_MS = 60_000; // HERMES auditor cadence
const HEARTBEAT_INTERVAL_MS = 10_000; // Control Tower online-check cadence
const POLL_BACKOFF_MS = 1000;

const redis = getRedisClient({ label: 'worker' });

// --- Event bus (Redis pub/sub) -------------------------------------------
// Publishes real-time events that the web server fans out to dashboard SSE
// clients: `slow_brain` (drives the AgentTerminal "Thinking Pulse") and
// `hermes_suggestion` (drives the governance suggestion toast). Best-effort:
// failures are logged but never block the task loop.
const EVENTS_CHANNEL = 'kudbee:events';

async function emitEvent(type, data) {
  const event = { type, data, ts: new Date().toISOString() };
  try {
    await redis.publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch (err) {
    hermes.log.error('event publish failed:', err.message);
  }
}

// --- Slow Brain (LLM) -----------------------------------------------------
// Captures a reasoning trace from the configured LLM provider. Falls back to a
// deterministic heuristic trace when no API key is configured (local/dev).
async function slowBrainReason(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      model: 'hermes-heuristic',
      trace: `Heuristic audit of "${String(prompt).slice(0, 120)}": no LLM key configured — ` +
        `proposing governance action for human review.`,
      provider: 'fallback'
    };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `As the Kudbee Governance Slow Brain, analyze this task and return a concise reasoning trace plus a recommended action.\n\nTask: ${prompt}`
                }
              ]
            }
          ]
        })
      }
    );
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = await res.json();
    const trace = data?.candidates?.[0]?.content?.parts?.[0]?.text || '(empty trace)';
    return { model: 'gemini-1.5-flash', trace, provider: 'gemini' };
  } catch (err) {
    return { model: 'hermes-fallback', trace: `LLM call failed (${err.message}) — proposing for review.`, provider: 'fallback' };
  }
}

// --- Task handling --------------------------------------------------------
async function handleTask(task) {
  const prompt = task.prompt || task.action || '';
  hermes.log.info(`task picked up id=${task.id || '?'} prompt="${String(prompt).slice(0, 80)}"`);

  const decision = await matchLogic(prompt);

  if (decision.matched && decision.route === 'FAST_BRAIN') {
    hermes.log.info(
      `FAST_BRAIN match (confidence=${decision.confidence?.toFixed(2)}) ` +
        `applying proven logic id=${decision.logic?.id}`
    );
    return { route: 'FAST_BRAIN', decision };
  }

  // SLOW_BRAIN: reason, capture trace, propose a new governance action.
  hermes.log.info('SLOW_BRAIN required — invoking LLM reasoning');
  await emitEvent('slow_brain', { state: 'start', task_id: task.id || null, prompt });
  const { model, trace, provider } = await slowBrainReason(prompt);

  const proposed = await proposeAction({
    action: task.action || 'GOVERN_SLOW_BRAIN',
    tags: Array.isArray(task.tags) ? task.tags.concat('slow-brain') : ['slow-brain'],
    prompt,
    id: `gw-${task.id || Date.now()}`
  });

  hermes.log.audit(
    `SLOW_BRAIN proposed id=${proposed.id} model=${model} provider=${provider} ` +
      `trace="${trace.slice(0, 120)}…"`
  );

  // Real-time suggestion toast for the operator (Approve → /api/governance/approve).
  await emitEvent('hermes_suggestion', {
    id: proposed.id,
    action: proposed.action,
    tags: proposed.tags,
    prompt: proposed.prompt,
    detail: `Slow-Brain reasoning captured (${provider}). Promote to PROVEN index?`,
    proposed_at: proposed.created_at
  });
  await emitEvent('slow_brain', { state: 'stop', task_id: task.id || null });

  // Persist the captured reasoning trace to session history for recall.
  try {
    await redis.lpush(
      'kudbee:session_history',
      JSON.stringify({
        agent: 'HERMES',
        type: 'slow_brain_trace',
        task_id: task.id || null,
        proposed_id: proposed.id,
        model,
        provider,
        trace,
        timestamp: new Date().toISOString()
      })
    );
    await redis.ltrim('kudbee:session_history', 0, 9999);
  } catch (err) {
    hermes.log.error('failed to persist reasoning trace:', err.message);
  }

  return { route: 'SLOW_BRAIN', decision, proposed };
}

async function pollTasks() {
  hermes.log.info(`task polling started on ${TASKS_QUEUE}`);
  while (true) {
    try {
      const result = await redis.blpop(TASKS_QUEUE, 0);
      if (!result) continue;
      const [, raw] = result;
      let task;
      try {
        task = JSON.parse(raw);
      } catch {
        hermes.log.error('failed to parse task payload — skipping');
        continue;
      }
      await handleTask(task).catch((err) =>
        hermes.log.error('task handling failed:', err.message)
      );
    } catch (err) {
      hermes.log.error('polling loop error:', err.message);
      await new Promise((r) => setTimeout(r, POLL_BACKOFF_MS));
    }
  }
}

// --- Background cadences --------------------------------------------------
function startHeartbeat() {
  const tick = async () => {
    try {
      await publishHeartbeat();
    } catch (err) {
      hermes.log.error('heartbeat failed:', err.message);
    }
  };
  tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

function startAuditor() {
  hermes.log.info('autonomous logic auditor scheduled');
  const tick = async () => {
    try {
      await runAudit();
    } catch (err) {
      hermes.log.error('auditor failed:', err.message);
    }
  };
  setInterval(tick, AUDIT_INTERVAL_MS);
}

async function init() {
  hermes.log.info(`HERMES worker booting (agentId=${hermes.agentId})`);
  // Wait briefly for the shared client to be ready before we start popping.
  try {
    await redis.ping();
  } catch (err) {
    hermes.log.warn('Redis not yet reachable at boot — continuing (will retry):', err.message);
  }

  startHeartbeat();
  startAuditor();
  await pollTasks();
}

process.on('SIGINT', async () => {
  hermes.log.warn('SIGINT received — reporting offline and exiting');
  await reportOffline().catch(() => {});
  process.exit(0);
});
process.on('SIGTERM', async () => {
  hermes.log.warn('SIGTERM received — reporting offline and exiting');
  await reportOffline().catch(() => {});
  process.exit(0);
});

init().catch((err) => {
  hermes.log.error('fatal init error:', err.message);
  process.exit(1);
});
