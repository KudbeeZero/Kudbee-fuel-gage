/**
 * services/lib/circuitBreaker.ts
 * ---------------------------------------------------------------------------
 * Phase 51 — Circuit Breaker & Backpressure for Middleware Degradation.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * Backed by Redis INCR/EXPIRE for cross-process visibility.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from './redis.js';

const CB_PREFIX = 'kudbee:circuit:';

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMax?: number;
}

export class CircuitBreaker {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMax: number;

  constructor(name: string, config: BreakerConfig = {}) {
    this.name = name;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30000;
    this.halfOpenMax = config.halfOpenMax ?? 2;
  }

  async getState(): Promise<BreakerState> {
    try {
      const redis = getRedisClient({ label: 'circuit-breaker' });
      const v = await redis.get(CB_PREFIX + this.name + ':state');
      return (v as BreakerState) || 'CLOSED';
    } catch { return 'CLOSED'; }
  }

  async recordFailure(): Promise<void> {
    try {
      const redis = getRedisClient({ label: 'circuit-breaker' });
      const key = CB_PREFIX + this.name + ':failures';
      const count = await redis.incr(key);
      await redis.expire(key, Math.ceil(this.resetTimeoutMs / 1000));
      if (count >= this.failureThreshold) {
        await redis.set(CB_PREFIX + this.name + ':state', 'OPEN', 'EX', Math.ceil(this.resetTimeoutMs / 1000));
      }
    } catch { /* best-effort */ }
  }

  async recordSuccess(): Promise<void> {
    try {
      const redis = getRedisClient({ label: 'circuit-breaker' });
      await redis.set(CB_PREFIX + this.name + ':state', 'CLOSED');
      await redis.del(CB_PREFIX + this.name + ':failures');
    } catch { /* best-effort */ }
  }

  async isOpen(): Promise<boolean> {
    return (await this.getState()) === 'OPEN';
  }
}

export const groqBreaker = new CircuitBreaker('groq-ftwb', { failureThreshold: 5, resetTimeoutMs: 30000 });
export const redisSinkBreaker = new CircuitBreaker('redis-sink', { failureThreshold: 3, resetTimeoutMs: 15000 });
