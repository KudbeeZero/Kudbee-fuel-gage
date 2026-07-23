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

  export function rateLimitCheck(key: string, config: RateLimitConfig): Promise<RateLimitResult>;
  export const DEFAULT_RATE_LIMIT: RateLimitConfig;
  export const UI_POLL_RATE_LIMIT: RateLimitConfig;
}

export {};
