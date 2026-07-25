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
  export function getSubscriberClient(): Redis;
  export function getRateLimitClient(opts?: Record<string, unknown>): Redis;
  export function getSlowRedisClient(opts?: Record<string, unknown>): Redis;
  export function getBlockingRedisClient(opts?: Record<string, unknown>): Redis;
  export function isUsingUpstash(): boolean;

  export function isRedisQuotaError(err: Error | string): boolean;
  export function applyRedisQuotaBackoff(): number;
  export function resetRedisQuotaBackoff(): void;
  export function getRedisQuotaBackoffRemaining(): number;
  export function initRedisFallbackQueue(): import('./inMemoryQueue.ts').InMemoryQueueManager;

  export const redisTelemetry: {
    primaryCount: number;
    fallbackCount: number;
    errorCount: number;
  };

  export const quotaBackoffState: {
    enabled: boolean;
    backoffMs: number;
    untilTs: number;
    consecutiveErrors: number;
  };
}

declare module '../lib/inMemoryQueue.ts' {
  export class InMemoryQueueManager {
    start(): void;
    stop(): void;
    enqueue(data: unknown): string;
    flush(): Promise<number>;
    readonly size: number;
    readonly isActive: boolean;
    stats(): { size: number; active: boolean; oldestItemAgeMs: number | null };
  }

  export function getOrCreateInMemoryQueue(options?: Record<string, unknown>): InMemoryQueueManager;
  export function isInMemoryFallbackActive(): boolean;
}

export {};
