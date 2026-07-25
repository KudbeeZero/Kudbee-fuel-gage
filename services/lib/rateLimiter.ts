import { getRateLimitClient, isRedisQuotaError } from './redis.js';

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
  degraded?: boolean;
}

export interface RateLimiterStats {
  redisCalls: number;
  redisErrors: number;
  fallbackActivations: number;
  errorsByCategory: Record<string, number>;
  lastError: string | null;
  lastErrorAt: number | null;
}

const stats: RateLimiterStats = {
  redisCalls: 0,
  redisErrors: 0,
  fallbackActivations: 0,
  errorsByCategory: {},
  lastError: null,
  lastErrorAt: null
};

const fallbackWindow = new Map<string, number[]>();
const FALLBACK_PRUNE_INTERVAL_MS = 10_000;
let _fallbackLastPrune = 0;

function categorizeError(err: Error): string {
  const msg = err.message;
  if (isRedisQuotaError(msg)) return 'quota';
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ECONNABORTED')) return 'connection';
  if (msg.includes('ETIMEDOUT') || msg.includes('TimeoutError') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('CLUSTERDOWN') || msg.includes('MOVED')) return 'cluster';
  if (msg.includes('WRONGPASS') || msg.includes('NOAUTH') || msg.includes('AUTH')) return 'auth';
  return 'unknown';
}

function inMemoryRateLimitCheck(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowCeiling = Math.ceil(now / config.windowMs) * config.windowMs;
  const windowStart = now - config.windowMs;

  stats.fallbackActivations += 1;

  const redisKey = RL_PREFIX + key;
  if (now - _fallbackLastPrune > FALLBACK_PRUNE_INTERVAL_MS) {
    for (const [k, timestamps] of fallbackWindow.entries()) {
      const pruned = timestamps.filter((t) => t > now - config.windowMs);
      if (pruned.length === 0) fallbackWindow.delete(k);
      else fallbackWindow.set(k, pruned);
    }
    _fallbackLastPrune = now;
  }

  let timestamps = fallbackWindow.get(redisKey) || [];
  timestamps = timestamps.filter((t) => t > now - config.windowMs);
  timestamps.push(now);
  fallbackWindow.set(redisKey, timestamps);

  const count = timestamps.length;
  const remaining = Math.max(0, config.maxRequests - count);
  const allowed = count <= config.maxRequests;

  return { allowed, remaining, resetAtMs: windowCeiling, limit: config.maxRequests, degraded: true };
}

/**
 * Heroku-favored Fixed Window rate limiter.
 * Uses INCR + EXPIRE pipeline on the dedicated REDIS_RATE_LIMIT_URL client.
 * Truly atomic: Lua script wraps INCR + EXPIRE + PTTL in one roundtrip,
 * guaranteeing the key always has a TTL — no permanent-leak race.
 * Falls back to in-memory sliding window when Redis is unreachable.
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

    stats.redisCalls += 1;

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
  } catch (err) {
    stats.redisErrors += 1;
    const error = err instanceof Error ? err : new Error(String(err));
    const msg = error.message;
    const category = categorizeError(error);
    stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;
    stats.lastError = msg;
    stats.lastErrorAt = now;

    const logLevel = category === 'connection' || category === 'unknown' ? 'ERROR' : 'WARN';
    console[logLevel === 'ERROR' ? 'error' : 'warn'](
      `[rate-limiter] ${logLevel}:${category} — Redis error for key ${key}: ${msg.substring(0, 120)}`
    );

    return inMemoryRateLimitCheck(key, config);
  }
}

export function getRateLimiterStats(): RateLimiterStats {
  return { ...stats };
}

export function resetRateLimiterStats(): void {
  stats.redisCalls = 0;
  stats.redisErrors = 0;
  stats.fallbackActivations = 0;
  stats.errorsByCategory = {};
  stats.lastError = null;
  stats.lastErrorAt = null;
  fallbackWindow.clear();
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
