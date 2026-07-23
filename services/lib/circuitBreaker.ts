/**
 * services/lib/circuitBreaker.ts
 * ---------------------------------------------------------------------------
 * Phase 51 — Circuit Breaker & Backpressure for Middleware Degradation.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * Backed by Redis INCR/EXPIRE for cross-process visibility.
 *
 * CLOSED: normal operation, requests flow through.
 * OPEN: circuit open after `failureThreshold` consecutive failures — requests
 *       are immediately rejected without attempting the downstream call.
 * HALF_OPEN: after `resetTimeoutMs`, the circuit permits `halfOpenMax`
 *            probe requests. If they succeed → CLOSED. If they fail → OPEN.
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
  private _halfOpenPermits: number;
  private _halfOpenTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string, config: BreakerConfig = {}) {
    this.name = name;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
    this.halfOpenMax = config.halfOpenMax ?? 1;
    this._halfOpenPermits = this.halfOpenMax;
  }

  /** Dispose of this breaker — cancel pending timers. */
  dispose(): void {
    if (this._halfOpenTimer) {
      clearTimeout(this._halfOpenTimer);
      this._halfOpenTimer = null;
    }
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

      const state = await this.getState();
      if (state === 'OPEN') return;

      const count = await redis.incr(key);
      await redis.expire(key, Math.ceil(this.resetTimeoutMs / 1000));

      if (state === 'HALF_OPEN' || count >= this.failureThreshold) {
        await redis.set(CB_PREFIX + this.name + ':state', 'OPEN', 'EX', Math.ceil(this.resetTimeoutMs / 1000));
        if (!this._halfOpenTimer) {
          this._transitionToHalfOpenAfterTimeout();
        }
      }
    } catch { /* best-effort */ }
  }

  async recordSuccess(): Promise<void> {
    try {
      const redis = getRedisClient({ label: 'circuit-breaker' });
      await redis.set(CB_PREFIX + this.name + ':state', 'CLOSED');
      await redis.del(CB_PREFIX + this.name + ':failures');
      this._halfOpenPermits = 0;
    } catch { /* best-effort */ }
  }

  private _transitionToHalfOpenAfterTimeout(): void {
    this._halfOpenTimer = setTimeout(async () => {
      this._halfOpenTimer = null;
      try {
        const redis = getRedisClient({ label: 'circuit-breaker' });
        const state = await redis.get(CB_PREFIX + this.name + ':state');
        if (state === 'OPEN') {
          await redis.set(CB_PREFIX + this.name + ':state', 'HALF_OPEN');
          await redis.set(CB_PREFIX + this.name + ':half_open_permits', String(this.halfOpenMax));
          this._halfOpenPermits = this.halfOpenMax;
        }
      } catch { /* best-effort */ }
    }, this.resetTimeoutMs).unref();
  }

  async isOpen(): Promise<boolean> {
    const state = await this.getState();
    return state === 'OPEN';
  }

  /**
   * Returns true when the request is ALLOWED through the breaker.
   * In HALF_OPEN, only `halfOpenMax` probe requests are allowed before
   * re-tripping.
   */
  async allowRequest(): Promise<boolean> {
    const state = await this.getState();
    if (state === 'OPEN') return false;
    if (state === 'CLOSED') return true;

    // HALF_OPEN: permit exactly halfOpenMax probes
    try {
      const redis = getRedisClient({ label: 'circuit-breaker' });
      const permits = await redis.decr(CB_PREFIX + this.name + ':half_open_permits');
      if (permits >= 0) return true;
      return false;
    } catch {
      return false;
    }
  }

  async forceOpen(): Promise<void> {
    try {
      const redis = getRedisClient({ label: 'circuit-breaker' });
      await redis.set(CB_PREFIX + this.name + ':state', 'OPEN');
      await redis.set(CB_PREFIX + this.name + ':failures', String(this.failureThreshold + 1));
      redisTelemetry?.errorCount !== undefined && (redisTelemetry.errorCount += 1);
    } catch { /* best-effort */ }
  }

  async forceReset(): Promise<void> {
    try {
      const redis = getRedisClient({ label: 'circuit-breaker' });
      await redis.set(CB_PREFIX + this.name + ':state', 'CLOSED');
      await redis.set(CB_PREFIX + this.name + ':failures', '0');
      await redis.set(CB_PREFIX + this.name + ':half_open_permits', String(this.halfOpenMax));
    } catch { /* best-effort */ }
  }
  }
}

export const groqBreaker = new CircuitBreaker('groq-ftwb', { failureThreshold: 5, resetTimeoutMs: 30000 });
export const geminiBreaker = new CircuitBreaker('gemini', { failureThreshold: 5, resetTimeoutMs: 30000 });
export const redisSinkBreaker = new CircuitBreaker('redis-sink', { failureThreshold: 3, resetTimeoutMs: 15000 });
