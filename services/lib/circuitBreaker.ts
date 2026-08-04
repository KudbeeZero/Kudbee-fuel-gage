/**
 * services/lib/circuitBreaker.ts
 * ---------------------------------------------------------------------------
 * Phase 51 — Circuit Breaker & Backpressure for Middleware Degradation.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * Backed by Redis INCR/EXPIRE for cross-process visibility with in-memory
 * local-state fallback (when Redis itself is the failing dependency).
 *
 * CLOSED: normal operation, requests flow through.
 * OPEN: circuit open after `failureThreshold` consecutive failures — requests
 *       are immediately rejected without attempting the downstream call.
 * HALF_OPEN: after `resetTimeoutMs`, the circuit permits `halfOpenMax`
 *            probe requests. If they succeed → CLOSED. If they fail → OPEN.
 *
 * Usage:
 *   const result = await breaker.execute(
 *     () => callExternalService(),
 *     () => fallbackData,
 *   );
 * ---------------------------------------------------------------------------
 */

import { getRedisClient, getRedisQuotaBackoffRemaining } from './redis.js';

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
  // ── Local-state fallback (survives Redis quota exhaustion) ──────────────
  private _localState: BreakerState = 'CLOSED';
  private _localFailures: number = 0;
  private _localOpenAt: number = 0;

  constructor(name: string, config: BreakerConfig = {}) {
    this.name = name;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
    this.halfOpenMax = config.halfOpenMax ?? 1;
    this._halfOpenPermits = this.halfOpenMax;
  }

  dispose(): void {
    if (this._halfOpenTimer) { clearTimeout(this._halfOpenTimer); this._halfOpenTimer = null; }
  }

  // ── Redis-aware state read ─────────────────────────────────────────────

  private async _redisCommand<T>(fn: (redis: ReturnType<typeof getRedisClient>) => Promise<T>, fallback: T): Promise<T> {
    try {
      if (getRedisQuotaBackoffRemaining() > 0) return fallback;
      const redis = getRedisClient({ label: 'circuit-breaker' });
      return await fn(redis);
    } catch {
      return fallback;
    }
  }

  async getState(): Promise<BreakerState> {
    // If local state is OPEN and hasn't timed out, use local
    if (this._localState === 'OPEN' && Date.now() - this._localOpenAt < this.resetTimeoutMs) {
      return 'OPEN';
    }
    return this._redisCommand(r => r.get(CB_PREFIX + this.name + ':state') as Promise<BreakerState>, this._localState);
  }

  // ── Core breaker operations ─────────────────────────────────────────────

  async recordFailure(): Promise<void> {
    // Always update local state (Redis-independent)
    this._localFailures++;
    if (this._localFailures >= this.failureThreshold) {
      this._localState = 'OPEN';
      this._localOpenAt = Date.now();
      if (!this._halfOpenTimer) this._transitionToHalfOpenAfterTimeout();
    }

    await this._redisCommand(async (redis) => {
      const key = CB_PREFIX + this.name + ':failures';
      const ttl = Math.ceil(this.resetTimeoutMs / 1000);
      const state = await this.getState();
      if (state === 'OPEN') return;

      const count = (await redis.eval(
        `local c = redis.call('INCR', KEYS[1])
         redis.call('EXPIRE', KEYS[1], ARGV[1])
         return c`,
        1, key, String(ttl)
      )) as number;

      if (state === 'HALF_OPEN' || count >= this.failureThreshold) {
        await redis.set(CB_PREFIX + this.name + ':state', 'OPEN', 'EX', ttl);
        if (!this._halfOpenTimer) this._transitionToHalfOpenAfterTimeout();
      }
    }, undefined);
  }

  async recordSuccess(): Promise<void> {
    this._localFailures = 0;
    this._localState = 'CLOSED';
    this._localOpenAt = 0;

    await this._redisCommand(async (redis) => {
      await redis.set(CB_PREFIX + this.name + ':state', 'CLOSED');
      await redis.del(CB_PREFIX + this.name + ':failures');
      this._halfOpenPermits = 0;
    }, undefined);
  }

  private _transitionToHalfOpenAfterTimeout(): void {
    this._halfOpenTimer = setTimeout(async () => {
      this._halfOpenTimer = null;
      // Transition local state to HALF_OPEN
      if (this._localState === 'OPEN' && Date.now() - this._localOpenAt >= this.resetTimeoutMs) {
        this._localState = 'HALF_OPEN';
        this._halfOpenPermits = this.halfOpenMax;
      }
      await this._redisCommand(async (redis) => {
        const state = await redis.get(CB_PREFIX + this.name + ':state');
        if (state === 'OPEN') {
          await redis.set(CB_PREFIX + this.name + ':state', 'HALF_OPEN');
          await redis.set(CB_PREFIX + this.name + ':half_open_permits', String(this.halfOpenMax));
          this._halfOpenPermits = this.halfOpenMax;
        }
      }, undefined);
    }, this.resetTimeoutMs).unref();
  }

  async isOpen(): Promise<boolean> {
    // Fast path: local state check (no Redis needed)
    if (this._localState === 'OPEN' && Date.now() - this._localOpenAt < this.resetTimeoutMs) return true;
    return this._redisCommand(async () => {
      return (await this.getState()) === 'OPEN';
    }, this._localState === 'OPEN');
  }

  async allowRequest(): Promise<boolean> {
    // Fast path: local state
    if (this._localState === 'OPEN' && Date.now() - this._localOpenAt < this.resetTimeoutMs) return false;
    if (this._localState === 'CLOSED') return true;

    return this._redisCommand(async (redis) => {
      const state = await this.getState();
      if (state === 'OPEN') return false;
      if (state === 'CLOSED') return true;
      const permits = await redis.decr(CB_PREFIX + this.name + ':half_open_permits');
      return permits >= 0;
    }, false);
  }

  // ── Execute wrapper (standard Hystrix/resilience4j pattern) ─────────────

  /**
   * Execute an operation through the circuit breaker.
   * If OPEN → skip and return fallback().
   * If HALF_OPEN → allow one probe request.
   * If CLOSED → execute fn(); on success recordSuccess, on failure recordFailure + return fallback().
   */
  async execute<T>(fn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
    if (!(await this.allowRequest())) return fallback();
    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (e) {
      await this.recordFailure();
      return fallback();
    }
  }

  async forceReset(): Promise<void> {
    this._localState = 'CLOSED';
    this._localFailures = 0;
    this._localOpenAt = 0;
    await this._redisCommand(async (redis) => {
      await redis.set(CB_PREFIX + this.name + ':state', 'CLOSED');
      await redis.set(CB_PREFIX + this.name + ':failures', '0');
      await redis.set(CB_PREFIX + this.name + ':half_open_permits', String(this.halfOpenMax));
    }, undefined);
  }
}

// ── Pre-configured breakers for Kudbee services ─────────────────────────

export const groqBreaker = new CircuitBreaker('groq-ftwb', { failureThreshold: 5, resetTimeoutMs: 30000 });
export const geminiBreaker = new CircuitBreaker('gemini', { failureThreshold: 5, resetTimeoutMs: 30000 });
export const inceptionBreaker = new CircuitBreaker('inception', { failureThreshold: 5, resetTimeoutMs: 30000 });
export const redisSinkBreaker = new CircuitBreaker('redis-sink', { failureThreshold: 3, resetTimeoutMs: 15000 });
export const hermesHeartbeatBreaker = new CircuitBreaker('hermes-heartbeat', { failureThreshold: 5, resetTimeoutMs: 60000 });
