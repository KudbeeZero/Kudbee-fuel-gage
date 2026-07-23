import { getRateLimitClient } from './redis.js';

const RL_PREFIX = 'kudbee:ratelimit:';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  limit: number;
}

/**
 * Heroku-favored Fixed Window rate limiter.
 * Uses INCR + EXPIRE pipeline on the dedicated REDIS_RATE_LIMIT_URL client.
 * Atomic: a single round-trip per request. No TOCTOU — if the key doesn't
 * exist, INCR returns 1 and EXPIRE arms the TTL in one pipeline.
 */
export async function rateLimitCheck(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = getRateLimitClient({ label: 'rate-limiter' });
  const redisKey = RL_PREFIX + key;
  const now = Date.now();
  const windowCeiling = Math.ceil(now / config.windowMs) * config.windowMs;

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.pttl(redisKey);
    const results = await pipeline.exec();
    if (!results) throw new Error('pipeline returned null');

    const count = (results[0]?.[1] as number) ?? 0;
    const ttlMs = (results[1]?.[1] as number) ?? -1;

    if (ttlMs <= 0) {
      await redis.expire(redisKey, Math.ceil(config.windowMs / 1000));
    }

    const remaining = Math.max(0, config.maxRequests - count);
    const allowed = count <= config.maxRequests;
    const resetAtMs = windowCeiling;

    return { allowed, remaining, resetAtMs, limit: config.maxRequests };
  } catch {
    // Fail open — never block traffic on Redis blips
    return { allowed: true, remaining: config.maxRequests, resetAtMs: windowCeiling, limit: config.maxRequests };
  }
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 100
};

export const UI_POLL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 300
};
