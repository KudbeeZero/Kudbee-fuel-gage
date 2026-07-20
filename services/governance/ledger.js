/**
 * services/governance/ledger.js
 * ---------------------------------------------------------------------------
 * Reasoning Ledger — the "Problem-Result" capture layer for agent
 * self-improvement.
 *
 * Every agent turn is reduced to a Problem-Result pair:
 *   (a) context      — the original system prompt / operating context.
 *   (b) input        — the telemetry input that triggered the turn.
 *   (c) thoughtStream — the AI's chain-of-thought (thought stream).
 *   (d) output       — the final outcome produced by the agent.
 *   (e) resultStatus — SUCCESS | FAILURE | PARTIAL (+ optional code/reason).
 *
 * Persistence is Resilient-First, mirroring the rest of the system:
 *   - PRIMARY:  Neon Postgres via the shared `pg` pool (getDbPool/runInsert).
 *   - FALLBACK: if Neon is down/unhealthy at write time, the entry is queued to
 *               Upstash Redis (REDIS_URL) under `ledger:queue` so it can be
 *               replayed later (retry-on-reconnect). When Redis is also
 *               unavailable, it degrades to an in-process memory queue so the
 *               caller never blocks and the pipeline keeps running.
 *
 * The Redis queue is drained automatically when Neon becomes healthy again
 * (best-effort, fire-and-forget) so captured reasoning is never lost.
 * ---------------------------------------------------------------------------
 */

import { getDbPool, isDbHealthy, runInsert } from '../lib/db.js';
import { getRedisClient } from '../lib/redis.js';

const LEDGER_TABLE = 'reasoning_ledger';
const REDIS_QUEUE_KEY = 'ledger:queue';

// In-process queue used when both Neon and Redis are unreachable. NOT
// persisted across restarts — this is the last-resort degrade path only.
const localQueue = [];

let _redis = null;
function redisClient() {
  if (!_redis) {
    try {
      _redis = getRedisClient({ label: 'ledger' });
    } catch (err) {
      console.warn('[Ledger] Redis client init failed:', err.message);
      _redis = null;
    }
  }
  return _redis;
}

/**
 * Ensure the canonical Neon table exists. Idempotent — safe to call once at
 * boot. Failures are non-fatal (degrades to in-memory fallback elsewhere).
 */
export async function ensureLedgerSchema() {
  const pool = getDbPool();
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        context TEXT NOT NULL,
        input JSONB NOT NULL,
        thought_stream JSONB NOT NULL,
        output JSONB NOT NULL,
        result_status TEXT NOT NULL DEFAULT 'SUCCESS',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_reasoning_ledger_created_at ON ${LEDGER_TABLE} (created_at)`
    );
  } catch (err) {
    console.warn('[Ledger] Schema ensure failed:', err.message);
  }
}

/**
 * Queue a Problem-Result entry to Redis for later sync. Used when Neon is
 * unreachable so we don't lose reasoning data (retry-on-reconnect).
 * @param {object} entry
 */
async function queueToRedis(entry) {
  const client = redisClient();
  if (!client) {
    localQueue.push(entry);
    return { queued: 'local', size: localQueue.length };
  }
  try {
    await client.rpush(REDIS_QUEUE_KEY, JSON.stringify(entry));
    return { queued: 'redis' };
  } catch (err) {
    // Redis blip — degrade to in-process queue, do not throw.
    console.warn('[Ledger] Redis queue failed (local fallback):', err.message);
    localQueue.push(entry);
    return { queued: 'local', size: localQueue.length };
  }
}

/**
 * Best-effort drain of any queued entries back into Neon once it is healthy.
 * Fire-and-forget; never throws.
 */
export async function drainQueue() {
  // 1. Replay local queue first.
  while (localQueue.length) {
    const entry = localQueue[0];
    const res = await persistToNeon(entry);
    if (!res.ok) return; // Neon still down; stop and keep the rest queued.
    localQueue.shift();
  }

  // 2. Replay Redis queue.
  const client = redisClient();
  if (!client) return;
  try {
    const len = await client.llen(REDIS_QUEUE_KEY);
    for (let i = 0; i < len; i++) {
      const raw = await client.lpop(REDIS_QUEUE_KEY);
      if (!raw) break;
      let entry;
      try {
        entry = JSON.parse(raw);
      } catch {
        continue;
      }
      const res = await persistToNeon(entry);
      if (!res.ok) {
        // Put it back at the head and stop — Neon went down mid-drain.
        await client.lpush(REDIS_QUEUE_KEY, raw);
        return;
      }
    }
  } catch (err) {
    console.warn('[Ledger] Drain failed:', err.message);
  }
}

/**
 * Persist one entry to Neon. Returns { ok } so callers can decide whether to
 * keep the entry queued.
 * @param {object} entry
 */
async function persistToNeon(entry) {
  const { context, input, thoughtStream, output, resultStatus } = entry;
  try {
    await runInsert(
      `INSERT INTO ${LEDGER_TABLE} (context, input, thought_stream, output, result_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        context,
        JSON.stringify(input ?? {}),
        JSON.stringify(thoughtStream ?? []),
        JSON.stringify(output ?? {}),
        resultStatus || 'SUCCESS'
      ]
    );
    return { ok: true };
  } catch (err) {
    console.warn('[Ledger] Neon persist failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * recordReasoning(input, output, resultStatus)
 * ---------------------------------------------------------------------------
 * Captures a Problem-Result pair for future agent self-improvement.
 *
 * @param {object} input  Telemetry/agent input that triggered this turn.
 *                        May include `context` (system prompt) and
 *                        `thoughtStream` (chain-of-thought) as well as the raw
 *                        telemetry payload.
 * @param {object} output The final outcome produced by the agent.
 * @param {object} resultStatus Result descriptor: { status, code?, reason? }
 *                        or a plain string ('SUCCESS' | 'FAILURE' | 'PARTIAL').
 * @returns {Promise<{ stored: 'neon' | 'redis' | 'local', id?: number, queued?: string }>}
 */
export async function recordReasoning(input, output, resultStatus) {
  const now = new Date().toISOString();
  const context = (input && input.context) || '';
  const thoughtStream = (input && input.thoughtStream) || [];
  const statusObj =
    typeof resultStatus === 'string'
      ? { status: resultStatus }
      : resultStatus || { status: 'SUCCESS' };
  const result = {
    status: statusObj.status || 'SUCCESS',
    code: statusObj.code || null,
    reason: statusObj.reason || null
  };

  const entry = {
    context,
    input,
    thoughtStream,
    output,
    resultStatus: result,
    created_at: now
  };

  // PRIMARY: write straight to Neon when healthy.
  const pool = getDbPool();
  if (pool && isDbHealthy()) {
    const res = await persistToNeon(entry);
    if (res.ok) {
      // Opportunistically drain anything queued during the outage.
      drainQueue();
      return { stored: 'neon', id: res.id };
    }
    // Neon write failed → fall through to queue.
  }

  // FALLBACK: queue for later sync (retry-on-reconnect).
  const queued = await queueToRedis(entry);
  return { stored: queued.queued === 'local' ? 'local' : 'redis', queued: queued.queued };
}

export const ledger = {
  recordReasoning,
  ensureLedgerSchema,
  drainQueue
};

export default ledger;
