// services/agents/worker.ts
// ---------------------------------------------------------------------------
// Phase 28 — Agent Worker: Probabilistic Uncertainty Circuit.
//
// Every agent turn MUST reduce its output to the canonical `AgentPayload`
// schema (defined in @kudbee/types) before the payload is allowed to execute.
// This module is the authoritative place where the raw LLM/agent output is
// parsed, the `confidence_score` is normalized to [0.0, 1.0], and the
// `uncertainty_flag` is computed from the UNCERTAINTY_THRESHOLD (0.80).
//
// Resilient-First: a malformed or missing confidence NEVER crashes the worker.
// It degrades to the safest possible interpretation — a low confidence with
// `uncertainty_flag = true` — so the router guard downstream traps it in the
// PENDING_APPROVAL Governance queue instead of letting an ungrounded action
// execute. This is the anti-hallucination circuit.
//
// Zero runtime side-effects: this module only parses and normalizes. The
// router guard (services/agents/router.ts) is what intercepts and reroutes.
// ---------------------------------------------------------------------------

import {
  AgentPayloadSchema,
  UNCERTAINTY_THRESHOLD,
  type AgentPayload
} from '@kudbee/types';

/** A confidence reading that has been normalized but not yet routed. */
export interface EvaluatedPayload {
  payload: AgentPayload;
  confidence_score: number;
  uncertainty_flag: boolean;
  /** True when confidence_score < UNCERTAINTY_THRESHOLD (the gate trigger). */
  below_threshold: boolean;
  /** True when the input was malformed and we fell back to the safe default. */
  degraded: boolean;
}

/** Default low-confidence payload used when the input is unparseable. */
export const DEGRADED_PAYLOAD: AgentPayload = {
  action: 'UNKNOWN',
  confidence_score: 0,
  uncertainty_flag: true,
  reasoning: 'Worker could not parse agent output — defaulting to safest low-confidence interpretation.'
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Normalize a raw agent output blob into the canonical AgentPayload.
 *
 * Accepts either a pre-shaped `AgentPayload`-like object or a JSON string.
 * When the confidence is missing/unparseable we degrade to the safe default
 * (confidence 0, uncertainty_flag true) rather than throwing — the
 * Uncertainty Gate downstream will route it to PENDING_APPROVAL.
 */
export function parseAgentPayload(raw: unknown): AgentPayload {
  if (raw === null || raw === undefined) return { ...DEGRADED_PAYLOAD };

  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { ...DEGRADED_PAYLOAD };
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return { ...DEGRADED_PAYLOAD, reasoning: `Unparseable agent JSON: ${trimmed.slice(0, 120)}` };
    }
  }

  if (typeof candidate !== 'object' || candidate === null) {
    return { ...DEGRADED_PAYLOAD };
  }

  const obj = candidate as Record<string, unknown>;
  const action =
    typeof obj.action === 'string' && obj.action.length > 0
      ? obj.action
      : typeof obj.task === 'string' && obj.task.length > 0
        ? obj.task
        : 'UNKNOWN';

  const rawConfidence = Number(obj.confidence_score);
  const confidence_score = Number.isFinite(rawConfidence) ? clamp01(rawConfidence) : 0;

  // uncertainty_flag is computed from the threshold but also honors an
  // explicit true the agent may emit when it knows it is guessing.
  const explicit = obj.uncertainty_flag === true;
  const uncertainty_flag = explicit || confidence_score < UNCERTAINTY_THRESHOLD;

  const reasoning =
    typeof obj.reasoning === 'string' ? obj.reasoning : typeof obj.reason === 'string' ? obj.reason : '';

  const trace_id = typeof obj.trace_id === 'string' ? obj.trace_id : undefined;
  const model = typeof obj.model === 'string' ? obj.model : undefined;

  const payload: AgentPayload = {
    action,
    confidence_score,
    uncertainty_flag,
    reasoning,
    ...(trace_id !== undefined ? { trace_id } : {}),
    ...(model !== undefined ? { model } : {})
  };

  // Validate against the canonical schema. On a validation failure we still
  // return the payload (best-effort) but force the uncertainty flag on so the
  // gate traps it — never throw.
  const parsed = AgentPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : { ...payload, uncertainty_flag: true };
}

/**
 * Evaluate a raw agent output blob through the uncertainty circuit.
 *
 * Returns the normalized payload plus the derived gate signals the router
 * guard reads to decide whether to intercept and reroute to PENDING_APPROVAL.
 */
export function evaluateAgentPayload(raw: unknown): EvaluatedPayload {
  const payload = parseAgentPayload(raw);
  const degraded =
    payload.action === DEGRADED_PAYLOAD.action && payload.confidence_score === 0;
  const below_threshold = payload.confidence_score < UNCERTAINTY_THRESHOLD;
  return {
    payload,
    confidence_score: payload.confidence_score,
    uncertainty_flag: payload.uncertainty_flag || below_threshold,
    below_threshold,
    degraded
  };
}

export { UNCERTAINTY_THRESHOLD };
export default evaluateAgentPayload;

/**
 * services/agents/worker.ts
 * ---------------------------------------------------------------------------
 * Autonomous background worker for the Crucible / governance task queue.
 *
 * The worker is decoupled from the main Express server:
 *   - It listens to the `kudbee:governance:tasks` Redis list (BRPOP-style)
 *     and pulls JSON-encoded task envelopes.
 *   - Each task runs through a 3-strike retry policy. After the third
 *     consecutive failure the task is atomically moved to the Dead Letter
 *     Queue `kudbee:governance:tasks:failed` for operator review.
 *   - State transitions (`QUEUED`, `PROCESSING`, `SUCCESS`, `FAILED`,
 *     `DEAD_LETTERED`, `RETRY_QUEUED`, `DISCARDED`) are broadcast over the
 *     shared `kudbee:events` Redis pub/sub channel so any connected
 *     server dyno (and the live SSE frontend) sees them in real time.
 *
 * The worker is started from server.js at boot time, but it never blocks
 * the API event loop — every Redis call awaits asynchronously and tasks
 * are processed serially in a single background loop.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from '../lib/redis.js';

const TASK_QUEUE = 'kudbee:governance:tasks';
const TASK_DLQ = 'kudbee:governance:tasks:failed';
const EVENTS_CHANNEL = 'kudbee:events';
const MAX_ATTEMPTS = 3;
const IDLE_POLL_MS = 1000;

let _running = false;
let _stopRequested = false;

function broadcast(type: string, data: any) {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    redis.publish(EVENTS_CHANNEL, JSON.stringify({ type, data, ts: new Date().toISOString() })).catch(() => {});
  } catch {
    /* ignore */
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envelope(task: any) {
  return JSON.stringify(task);
}

function parse(raw: any): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAvailable() {
  return Boolean(getRedisClient());
}

export async function enqueueTask(task: any) {
  const redis = getRedisClient();
  if (!redis) {
    return { success: false, error: 'redis unavailable' };
  }
  const payload = {
    id: task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: task.kind || 'GENERIC',
    payload: task.payload || {},
    attempts: 0,
    enqueuedAt: new Date().toISOString()
  };
  await redis.lpush(TASK_QUEUE, envelope(payload));
  broadcast('task.queued', { id: payload.id, kind: payload.kind, enqueuedAt: payload.enqueuedAt });
  return { success: true, id: payload.id };
}

export async function listFailed() {
  const redis = getRedisClient();
  if (!redis) return [];
  const items = await redis.lrange(TASK_DLQ, 0, -1).catch(() => []);
  return items.map((raw: string) => parse(raw)).filter(Boolean).reverse();
}

export async function discardFailed(taskId: string) {
  const redis = getRedisClient();
  if (!redis) return { success: false, error: 'redis unavailable' };
  const items = await redis.lrange(TASK_DLQ, 0, -1).catch(() => []);
  for (const raw of items) {
    const parsed = parse(raw);
    if (parsed && parsed.id === taskId) {
      await redis.lrem(TASK_DLQ, 1, raw);
      broadcast('task.discarded', { id: taskId, at: new Date().toISOString() });
      return { success: true, id: taskId };
    }
  }
  return { success: false, error: 'not found' };
}

export async function retryFailed(taskId: string) {
  const redis = getRedisClient();
  if (!redis) return { success: false, error: 'redis unavailable' };
  const items = await redis.lrange(TASK_DLQ, 0, -1).catch(() => []);
  for (const raw of items) {
    const parsed = parse(raw);
    if (parsed && parsed.id === taskId) {
      const requeued = { ...parsed, attempts: 0, retriedAt: new Date().toISOString() };
      await redis.lrem(TASK_DLQ, 1, raw);
      await redis.lpush(TASK_QUEUE, envelope(requeued));
      broadcast('task.retry_queued', { id: taskId, at: requeued.retriedAt });
      return { success: true, id: taskId };
    }
  }
  return { success: false, error: 'not found' };
}

export function getQueueName() {
  return TASK_QUEUE;
}

export function getDlqName() {
  return TASK_DLQ;
}

export function isRunning() {
  return _running;
}

export async function processTask(task: any) {
  // Inject an optional `shouldFail` hook for E2E testing — the caller can set
  // task.payload.shouldFail = true (or to a count) to deterministically
  // simulate failure paths.
  if (task.payload?.shouldFail) {
    throw new Error(task.payload.failureMessage || 'simulated failure for E2E');
  }
  // For a generic task, mark the work as complete and return a small result.
  return {
    completedAt: new Date().toISOString(),
    result: 'ok',
    kind: task.kind
  };
}

export async function _tick() {
  const redis = getRedisClient();
  if (!redis) return false;
  const raw = await redis.rpop(TASK_QUEUE).catch(() => null);
  if (!raw) return false;
  const task = parse(raw);
  if (!task) {
    broadcast('task.malformed', { raw });
    return true;
  }

  task.attempts = (task.attempts || 0) + 1;
  broadcast('task.processing', { id: task.id, kind: task.kind, attempt: task.attempts });

  try {
    const result = await processTask(task);
    broadcast('task.success', { id: task.id, kind: task.kind, attempt: task.attempts, result });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (task.attempts >= MAX_ATTEMPTS) {
      const dead = { ...task, failedAt: new Date().toISOString(), lastError: message };
      await redis.lpush(TASK_DLQ, envelope(dead)).catch(() => {});
      broadcast('task.dead_lettered', { id: task.id, kind: task.kind, attempts: task.attempts, error: message });
    } else {
      const requeued = { ...task, lastError: message };
      await redis.lpush(TASK_QUEUE, envelope(requeued)).catch(() => {});
      broadcast('task.failed', { id: task.id, kind: task.kind, attempt: task.attempts, error: message });
    }
    return true;
  }
}

export async function startWorker() {
  if (_running) return;
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Worker] Redis unavailable — worker loop not started');
    return;
  }
  _running = true;
  _stopRequested = false;
  console.log(`[Worker] Starting background task loop on ${TASK_QUEUE}`);
  (async function loop() {
    while (!_stopRequested) {
      try {
        const processed = await _tick();
        if (!processed) {
          await sleep(IDLE_POLL_MS);
        }
      } catch (err) {
        console.error('[Worker] tick error:', err instanceof Error ? err.message : String(err));
        await sleep(IDLE_POLL_MS);
      }
    }
    _running = false;
  })().catch((err) => console.error('[Worker] loop crashed:', err));
}

export function stopWorker() {
  _stopRequested = true;
}
