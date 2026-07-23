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
 * Truly atomic: Lua script wraps INCR + EXPIRE + PTTL in one roundtrip,
 * guaranteeing the key always has a TTL — no permanent-leak race.
 */
export async function rateLimitCheck(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowCeiling = Math.ceil(now / config.windowMs) * config.windowMs;
  const ttlSeconds = Math.ceil(config.windowMs / 1000);

  try {
    const redis = getRateLimitClient({ label: 'rate-limiter' });
    const redisKey = RL_PREFIX + key;

    const [count, ttl] = await redis.eval(
      `local c = redis.call('INCR', KEYS[1])
       local t = redis.call('PTTL', KEYS[1])
       if t <= 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) t = tonumber(ARGV[1]) * 1000 end
       return {c, t}`,
      1,
      redisKey,
      String(ttlSeconds)
    ) as [number, number];

    const remaining = Math.max(0, config.maxRequests - count);
    const allowed = count <= config.maxRequests;

    return { allowed, remaining, resetAtMs: windowCeiling, limit: config.maxRequests };
  } catch {
    return { allowed: true, remaining: config.maxRequests, resetAtMs: windowCeiling, limit: config.maxRequests };
  }
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 300
};

export const PER_ENDPOINT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60
};

export const UI_POLL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 600
};
