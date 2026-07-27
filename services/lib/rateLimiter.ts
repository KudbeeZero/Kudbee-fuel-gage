const RL_PREFIX = 'kudbee:ratelimit:';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

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

export interface RateLimiterStats {
  totalRequests: number;
  blockedRequests: number;
  activeWindows: number;
  inMemoryChecks: number;
}

const stats: RateLimiterStats = {
  totalRequests: 0,
  blockedRequests: 0,
  activeWindows: 0,
  inMemoryChecks: 0,
};

const slidingWindow = new Map<string, number[]>();
let _lastCleanup = 0;
let _maxWindowMs = 0;

function pruneDeadEntries(now: number): void {
  const pruneWindow = _maxWindowMs;
  for (const [k, timestamps] of slidingWindow.entries()) {
    const pruned = timestamps.filter((t) => t > now - pruneWindow);
    if (pruned.length === 0) {
      slidingWindow.delete(k);
    } else if (pruned.length < timestamps.length) {
      slidingWindow.set(k, pruned);
    }
  }
}

export function createRateLimiter(config: RateLimitConfig) {
  return {
    check: (key: string) => rateLimitCheck(key, config),
  };
}

export async function rateLimitCheck(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowCeiling = Math.ceil(now / config.windowMs) * config.windowMs;
  const windowKey = RL_PREFIX + key;

  if (config.windowMs > _maxWindowMs) {
    _maxWindowMs = config.windowMs;
  }

  stats.totalRequests += 1;
  stats.inMemoryChecks += 1;

  if (now - _lastCleanup > CLEANUP_INTERVAL_MS) {
    pruneDeadEntries(now);
    _lastCleanup = now;
  }

  let timestamps = slidingWindow.get(windowKey) || [];
  timestamps = timestamps.filter((t) => t > now - config.windowMs);
  timestamps.push(now);
  slidingWindow.set(windowKey, timestamps);

  stats.activeWindows = slidingWindow.size;

  const count = timestamps.length;
  const remaining = Math.max(0, config.maxRequests - count);
  const allowed = count <= config.maxRequests;

  if (!allowed) {
    stats.blockedRequests += 1;
  }

  return { allowed, remaining, resetAtMs: windowCeiling, limit: config.maxRequests };
}

export function getRateLimiterStats(): RateLimiterStats {
  return { ...stats, activeWindows: slidingWindow.size };
}

export function resetRateLimiterStats(): void {
  stats.totalRequests = 0;
  stats.blockedRequests = 0;
  stats.activeWindows = 0;
  stats.inMemoryChecks = 0;
  slidingWindow.clear();
  _maxWindowMs = 0;
}

const ATOMIC_RATE_LIMIT_LUA = `
local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local max_requests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)

local count = redis.call('ZCARD', key)
if count < max_requests then
  redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
  redis.call('PEXPIRE', key, window_ms)
  return {1, max_requests - count - 1, now + window_ms, max_requests}
end

return {0, 0, now + window_ms, max_requests}
`;

const ATOMIC_RATE_LIMIT_SHA: { value: string | null } = { value: null };

async function loadAtomicLuaScript(redis: any): Promise<string | null> {
  if (ATOMIC_RATE_LIMIT_SHA.value) return ATOMIC_RATE_LIMIT_SHA.value;
  try {
    ATOMIC_RATE_LIMIT_SHA.value = await redis.script('LOAD', ATOMIC_RATE_LIMIT_LUA);
    return ATOMIC_RATE_LIMIT_SHA.value;
  } catch {
    return null;
  }
}

export async function rateLimitAtomicCheck(
  key: string,
  config: RateLimitConfig,
  redis?: any
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowCeiling = Math.ceil(now / config.windowMs) * config.windowMs;
  stats.totalRequests += 1;

  if (!redis) {
    try {
      const { getRedisClient } = await import('./redis.js');
      redis = getRedisClient({ label: 'atomic-rate-limiter' });
    } catch {
      return rateLimitCheck(key, config);
    }
  }

  if (!redis) return rateLimitCheck(key, config);

  try {
    const sha = await loadAtomicLuaScript(redis);
    if (!sha) return rateLimitCheck(key, config);

    const windowKey = RL_PREFIX + key;
    const result = await redis.evalsha(
      sha, 1, windowKey,
      String(config.windowMs), String(config.maxRequests), String(now)
    );

    const [allowed, remaining, , limit] = result.map(Number);

    if (!allowed) {
      stats.blockedRequests += 1;
    }

    return {
      allowed: allowed === 1,
      remaining: Math.max(0, remaining),
      resetAtMs: windowCeiling,
      limit,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NOSCRIPT')) {
      ATOMIC_RATE_LIMIT_SHA.value = null;
    }
    console.warn(`[rate-limiter] Atomic EVAL failed, falling back to in-memory: ${msg}`);
    return rateLimitCheck(key, config);
  }
}

export function resetAtomicRateLimitScript(): void {
  ATOMIC_RATE_LIMIT_SHA.value = null;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 300,
};

export const PER_ENDPOINT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

export const UI_POLL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 600,
};
