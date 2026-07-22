/**
 * services/lib/cache.ts
 * ---------------------------------------------------------------------------
 * Phase 44 — Redis-backed query caching layer.
 *
 * Wraps expensive dashboard queries (trajectory listings, cost summaries,
 * governance feeds) with configurable TTL. Uses Redis SETEX with JSON
 * payloads. Falls back to direct query when Redis is unavailable.
 *
 * Pattern for callers:
 *   const data = await withCache('trajectories:25', 30, () => query());
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from './redis.js';

const CACHE_PREFIX = 'kudbee:cache:';

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const redis = getRedisClient({ label: 'cache' });
    const cached = await redis.get(CACHE_PREFIX + key);
    if (cached) {
      try { return JSON.parse(cached) as T; } catch { /* fall through */ }
    }
    const result = await fetcher();
    try {
      await redis.setex(CACHE_PREFIX + key, ttlSeconds, JSON.stringify(result));
    } catch { /* best-effort cache write */ }
    return result;
  } catch {
    return fetcher();
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'cache' });
    const keys = await redis.keys(CACHE_PREFIX + pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* best-effort */ }
}
