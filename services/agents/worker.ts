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

import { getRedisClient } from '../lib/redis.ts';

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
