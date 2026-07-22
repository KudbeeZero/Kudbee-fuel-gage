/**
 * services/lib/sinkAccumulator.ts
 * ---------------------------------------------------------------------------
 * Phase 41 — Unbounded Dynamic Sink Token Accumulator.
 *
 * Replaces the static 1000-token circuit-breaker with a rolling absorption
 * pool backed by a Redis sorted set. Tokens enter the sink with a 1-hour TTL
 * and are automatically expired. The absorption rate dictates system pressure
 * via the X-Sink-Pressure response header — no hard shutdown, just graceful
 * backpressure signaling.
 *
 * Metrics persisted in kudbee:sink:metrics (Redis Hash):
 *   - total_rejected: lifetime rejected tokens
 *   - total_remediated: tokens that were corrected and re-submitted
 *   - window_count: current active tokens in accumulator window
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from './redis.js';

const SINK_KEY = 'kudbee:sink:accumulator';
const METRICS_KEY = 'kudbee:sink:metrics';
const WINDOW_MS = 3_600_000; // 1 hour TTL
const MAX_THEORETICAL = 10_000; // sane ceiling for pressure calculation

export async function sinkToken(tokenId: string, remediationDelta: string, reason: string): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'sink-accumulator' });
    const score = Date.now();
    const entry = JSON.stringify({ id: tokenId, remediationDelta, reason, sunkAt: new Date().toISOString() });
    await redis.zadd(SINK_KEY, score, entry);
    await redis.zremrangebyscore(SINK_KEY, 0, score - WINDOW_MS);
    await redis.hincrby(METRICS_KEY, 'total_rejected', 1);
    await redis.hincrby(METRICS_KEY, 'window_count', 1);
  } catch { /* best-effort sink */ }
}

export async function remediateToken(tokenId: string): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'sink-accumulator' });
    // Remove all entries with matching id from the sorted set
    const members = await redis.zrange(SINK_KEY, 0, -1);
    for (const member of members) {
      try {
        const parsed = JSON.parse(member);
        if (parsed.id === tokenId) {
          await redis.zrem(SINK_KEY, member);
          await redis.hincrby(METRICS_KEY, 'total_remediated', 1);
          await redis.hincrby(METRICS_KEY, 'window_count', -1);
        }
      } catch { /* skip unparseable */ }
    }
  } catch { /* best-effort */ }
}

export async function getSinkPressure(): Promise<number> {
  try {
    const redis = getRedisClient({ label: 'sink-accumulator' });
    const now = Date.now();
    await redis.zremrangebyscore(SINK_KEY, 0, now - WINDOW_MS);
    const count = await redis.zcard(SINK_KEY);
    return Math.min(1, Number(count) / MAX_THEORETICAL);
  } catch {
    return 0;
  }
}

export async function getSinkMetrics(): Promise<Record<string, number>> {
  try {
    const redis = getRedisClient({ label: 'sink-accumulator' });
    const all = await redis.hgetall(METRICS_KEY);
    return {
      total_rejected: Number(all?.total_rejected ?? 0),
      total_remediated: Number(all?.total_remediated ?? 0),
      window_count: Number(all?.window_count ?? 0),
      pressure: await getSinkPressure()
    };
  } catch {
    return { total_rejected: 0, total_remediated: 0, window_count: 0, pressure: 0 };
  }
}
