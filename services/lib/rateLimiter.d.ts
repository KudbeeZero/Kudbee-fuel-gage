declare module './rateLimiter.js' {
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

  export function createRateLimiter(config: RateLimitConfig): {
    check: (key: string) => Promise<RateLimitResult>;
  };
  export function rateLimitCheck(key: string, config: RateLimitConfig): Promise<RateLimitResult>;
  export function getRateLimiterStats(): RateLimiterStats;
  export function resetRateLimiterStats(): void;

  export const DEFAULT_RATE_LIMIT: RateLimitConfig;
  export const PER_ENDPOINT_RATE_LIMIT: RateLimitConfig;
  export const UI_POLL_RATE_LIMIT: RateLimitConfig;
}

export {};
