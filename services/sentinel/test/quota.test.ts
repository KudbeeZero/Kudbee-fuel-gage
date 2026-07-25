import { describe, it, expect, beforeEach } from 'bun:test';
import { CircuitBreaker } from '../src/circuitBreaker';
import { LocalTokenBucketRateLimiter } from '../src/rateLimiter';

describe('CircuitBreaker quota state', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('upstash-redis', {
      failureThreshold: 3,
      resetTimeoutMs: 500
    });
  });

  it('should transition to QUOTA_EXCEEDED state', () => {
    breaker.triggerQuotaExceeded();
    expect(breaker.currentState).toBe('QUOTA_EXCEEDED');
  });

  it('should emit UPSTASH_QUOTA_EXCEEDED event', () => {
    const events: string[] = [];
    breaker.onEvent((e) => events.push(e.type));

    breaker.triggerQuotaExceeded();
    expect(events).toContain('UPSTASH_QUOTA_EXCEEDED');
  });

  it('should emit QUOTA_RESET_ESTIMATED event with estimate', () => {
    let estimateMs: number | undefined;
    breaker.onEvent((e) => {
      if (e.type === 'QUOTA_RESET_ESTIMATED') {
        estimateMs = e.quotaResetEstimateMs;
      }
    });

    breaker.triggerQuotaExceeded();
    expect(estimateMs).toBeDefined();
    expect(typeof estimateMs).toBe('number');
    expect(estimateMs!).toBeGreaterThan(0);
  });

  it('should estimate quota reset within an hour', () => {
    const estimate = breaker.estimateQuotaReset();
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThanOrEqual(3600_000);
  });

  it('should silence telemetry when quota exceeded', () => {
    expect(breaker.shouldSilenceTelemetry()).toBe(false);
    breaker.triggerQuotaExceeded();
    expect(breaker.shouldSilenceTelemetry()).toBe(true);
  });

  it('should reset from QUOTA_EXCEEDED to CLOSED', () => {
    breaker.triggerQuotaExceeded();
    breaker.reset();
    expect(breaker.currentState).toBe('CLOSED');
    expect(breaker.failureCount).toBe(0);
  });

  it('should still execute successfully after quota reset', async () => {
    breaker.triggerQuotaExceeded();
    breaker.reset();
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.currentState).toBe('CLOSED');
  });
});

describe('LocalTokenBucketRateLimiter', () => {
  let limiter: LocalTokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new LocalTokenBucketRateLimiter(10, 20);
  });

  it('should allow requests within capacity', () => {
    for (let i = 0; i < 20; i++) {
      const result = limiter.allow('client-a');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    }
  });

  it('should block requests after exceeding burst capacity', () => {
    for (let i = 0; i < 21; i++) {
      const result = limiter.allow('client-b');
      if (i < 20) {
        expect(result.allowed).toBe(true);
      } else {
        expect(result.allowed).toBe(false);
      }
    }
  });

  it('should track per-key tokens independently', () => {
    limiter.allow('key-1');
    limiter.allow('key-1');
    limiter.allow('key-2');
    expect(limiter.allow('key-2').allowed).toBe(true);
  });

  it('should reset a specific key', () => {
    for (let i = 0; i < 20; i++) limiter.allow('resettable');
    expect(limiter.allow('resettable').allowed).toBe(false);
    limiter.reset('resettable');
    expect(limiter.allow('resettable').allowed).toBe(true);
  });

  it('should reset all keys', () => {
    limiter.allow('k1');
    limiter.allow('k2');
    limiter.resetAll();
    expect(limiter.allow('k1').allowed).toBe(true);
    expect(limiter.allow('k2').allowed).toBe(true);
  });

  it('should accumulate remaining tokens after idle period', async () => {
    for (let i = 0; i < 15; i++) limiter.allow('refill-key');
    await new Promise((r) => setTimeout(r, 200));
    const result = limiter.allow('refill-key');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(1);
  });
});
