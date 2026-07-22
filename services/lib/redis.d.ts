/**
 * services/lib/redis.d.ts
 * ---------------------------------------------------------------------------
 * Ambient module declaration for the resilient Redis connection factory
 * (services/lib/redis.js). The runtime module is plain JS; this lets
 * strict TypeScript consumers import it without an implicit `any`.
 * ---------------------------------------------------------------------------
 */

declare module '../lib/redis.js' {
  import type { Redis } from 'ioredis';

  export function getRedisClient(opts?: Record<string, unknown>): Redis;

  export const redisTelemetry: {
    primaryCount: number;
    fallbackCount: number;
    errorCount: number;
  };
}

export {};
