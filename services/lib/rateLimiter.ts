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
const PRUNE_INTERVAL_MS = 10_000;
let _lastPrune = 0;
let _maxWindowMs = 0;

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

  if (now - _lastPrune > PRUNE_INTERVAL_MS) {
    const pruneWindow = _maxWindowMs || config.windowMs;
    for (const [k, timestamps] of slidingWindow.entries()) {
      const pruned = timestamps.filter((t) => t > now - pruneWindow);
      if (pruned.length === 0) slidingWindow.delete(k);
      else slidingWindow.set(k, pruned);
    }
    _lastPrune = now;
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
