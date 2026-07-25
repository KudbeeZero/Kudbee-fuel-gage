export interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  burstMultiplier?: number;
}

interface WindowEntry {
  count: number;
  startMs: number;
}

export class SlidingWindowRateLimiter {
  private config: Required<RateLimiterConfig>;
  private windows: Map<string, WindowEntry[]>;

  constructor(config: RateLimiterConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      burstMultiplier: config.burstMultiplier ?? 1.5
    };
    this.windows = new Map();
  }

  allow(key: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowMs = this.config.windowMs;

    let entries = this.windows.get(key) ?? [];
    entries = entries.filter((e) => now - e.startMs < windowMs);

    const totalCount = entries.reduce((sum, e) => sum + e.count, 0);
    const burstLimit = Math.floor(this.config.maxRequests * this.config.burstMultiplier);

    if (totalCount >= burstLimit) {
      this.windows.set(key, entries);
      return {
        allowed: false,
        remaining: 0,
        resetMs: entries[0] ? entries[0].startMs + windowMs - now : windowMs
      };
    }

    const lastEntry = entries[entries.length - 1];
    if (lastEntry && now - lastEntry.startMs < Math.min(windowMs / 10, 1000)) {
      lastEntry.count += 1;
    } else {
      entries.push({ count: 1, startMs: now });
    }

    while (entries.length > 100) entries.shift();

    this.windows.set(key, entries);

    const remaining = burstLimit - totalCount - 1;
    return {
      allowed: true,
      remaining: Math.max(0, remaining),
      resetMs: entries[0] ? entries[0].startMs + windowMs - now : windowMs
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  resetAll(): void {
    this.windows.clear();
  }

  stats(key: string): { count: number; oldestMs: number | null } {
    const now = Date.now();
    const entries = this.windows.get(key) ?? [];
    const active = entries.filter((e) => now - e.startMs < this.config.windowMs);
    const totalCount = active.reduce((sum, e) => sum + e.count, 0);
    return {
      count: totalCount,
      oldestMs: active[0] ? active[0].startMs : null
    };
  }
}
