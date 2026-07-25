import { describe, it, expect, beforeEach } from 'bun:test';
import { SlidingWindowRateLimiter } from '../src/rateLimiter';
import { CircuitBreaker } from '../src/circuitBreaker';
import { AnomalyEngine, createDefaultRules, wireFirewallEvents } from '../src/anomalyEngine';

describe('SlidingWindowRateLimiter', () => {
  let rl: SlidingWindowRateLimiter;

  beforeEach(() => {
    rl = new SlidingWindowRateLimiter({ windowMs: 10_000, maxRequests: 5 });
  });

  it('should allow requests within the rate limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = rl.allow('client-1');
      expect(result.allowed).toBe(true);
    }
  });

  it('should block requests exceeding burst limit', () => {
    for (let i = 0; i < 8; i++) {
      const result = rl.allow('client-1');
      if (i < 7) {
        expect(result.allowed).toBe(true);
      } else {
        expect(result.allowed).toBe(false);
      }
    }
  });

  it('should track per-key windows', () => {
    rl.allow('key-a');
    rl.allow('key-a');
    rl.allow('key-b');

    expect(rl.stats('key-a').count).toBe(2);
    expect(rl.stats('key-b').count).toBe(1);
    expect(rl.stats('key-c').count).toBe(0);
  });

  it('should reset a specific key', () => {
    rl.allow('reset-me');
    rl.allow('reset-me');
    expect(rl.stats('reset-me').count).toBe(2);
    rl.reset('reset-me');
    expect(rl.stats('reset-me').count).toBe(0);
  });

  it('should reset all keys', () => {
    rl.allow('k1');
    rl.allow('k2');
    rl.resetAll();
    expect(rl.stats('k1').count).toBe(0);
    expect(rl.stats('k2').count).toBe(0);
  });

  it('should return remaining count and reset time', () => {
    const result = rl.allow('client-x');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(result.resetMs).toBeGreaterThan(0);
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-provider', {
      failureThreshold: 3,
      resetTimeoutMs: 500
    });
  });

  it('should start in CLOSED state', () => {
    expect(breaker.currentState).toBe('CLOSED');
    expect(breaker.failureCount).toBe(0);
  });

  it('should execute successfully and stay CLOSED', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('should count failures', async () => {
    for (let i = 0; i < 2; i++) {
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    }
    expect(breaker.failureCount).toBe(2);
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('should open circuit after threshold failures', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    }
    expect(breaker.currentState).toBe('OPEN');
    expect(breaker.failureCount).toBe(3);
  });

  it('should immediately reject calls when OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    }

    await expect(breaker.execute(() => Promise.resolve('x')))
      .rejects
      .toThrow(/Circuit breaker OPEN/);
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    const fastBreaker = new CircuitBreaker('fast', {
      failureThreshold: 2,
      resetTimeoutMs: 100
    });

    for (let i = 0; i < 2; i++) {
      try { await fastBreaker.execute(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    }
    expect(fastBreaker.currentState).toBe('OPEN');

    await new Promise((r) => setTimeout(r, 150));

    try {
      await fastBreaker.execute(() => Promise.reject(new Error('still fail')));
    } catch { /* ignore */ }

    expect(fastBreaker.currentState).toBe('OPEN');
  });

  it('should close circuit on success in HALF_OPEN', async () => {
    const fastBreaker = new CircuitBreaker('fast', {
      failureThreshold: 2,
      resetTimeoutMs: 50
    });

    for (let i = 0; i < 2; i++) {
      try { await fastBreaker.execute(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    }

    await new Promise((r) => setTimeout(r, 100));
    await fastBreaker.execute(() => Promise.resolve('recovered'));

    expect(fastBreaker.currentState).toBe('CLOSED');
    expect(fastBreaker.failureCount).toBe(0);
  });

  it('should emit events', async () => {
    const events: string[] = [];
    breaker.onEvent((e) => events.push(e.type));

    await breaker.execute(() => Promise.resolve('ok'));
    expect(events).toContain('SUCCESS');

    try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    expect(events).toContain('FAILURE');
  });

  it('should reset to CLOSED', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    }
    expect(breaker.currentState).toBe('OPEN');
    breaker.reset();
    expect(breaker.currentState).toBe('CLOSED');
    expect(breaker.failureCount).toBe(0);
  });
});

describe('AnomalyEngine', () => {
  let engine: AnomalyEngine;

  beforeEach(() => {
    engine = new AnomalyEngine([
      {
        id: 'token-surge-test',
        metric: 'TOKEN_SURGE',
        threshold: 1000,
        windowMs: 60_000,
        cooldownMs: 1000
      }
    ]);
  });

  it('should detect token surge anomaly', () => {
    const alerts = engine.record({
      tokens: 2000,
      cost: 0.01,
      latencyMs: 100,
      errors: 0,
      total: 1
    });

    expect(alerts.length).toBeGreaterThanOrEqual(1);
    if (alerts[0]) {
      expect(alerts[0].metric).toBe('TOKEN_SURGE');
      expect(alerts[0].actualValue).toBe(2000);
    }
  });

  it('should not trigger anomaly below threshold', () => {
    const alerts = engine.record({
      tokens: 100,
      cost: 0.01,
      latencyMs: 50,
      errors: 0,
      total: 5
    });

    expect(alerts.length).toBe(0);
  });

  it('should respect cooldown period', () => {
    engine.record({ tokens: 2000, cost: 0.02, latencyMs: 100, errors: 0, total: 1 });
    const second = engine.record({ tokens: 2000, cost: 0.02, latencyMs: 100, errors: 0, total: 1 });
    expect(second.length).toBe(0);
  });

  it('should acknowledge alerts', () => {
    engine.record({ tokens: 2000, cost: 0.02, latencyMs: 100, errors: 0, total: 1 });
    const alerts = engine.getAlerts();
    expect(alerts[0]?.acknowledged).toBe(false);
    engine.acknowledgeAlert(0);
    expect(engine.getAlerts()[0]?.acknowledged).toBe(true);
  });

  it('should add and remove rules', () => {
    engine.addRule({
      id: 'custom-rule',
      metric: 'COST_SPIKE',
      threshold: 1,
      windowMs: 60_000,
      cooldownMs: 500
    });

    const alerts = engine.record({ tokens: 10, cost: 5, latencyMs: 50, errors: 0, total: 1 });
    expect(alerts.length).toBeGreaterThanOrEqual(1);

    engine.removeRule('custom-rule');
    expect(engine.activeRules.length).toBe(1);
  });

  it('should create default rules', () => {
    const rules = createDefaultRules();
    expect(rules.length).toBe(4);
    expect(rules.map((r) => r.metric)).toContain('TOKEN_SURGE');
    expect(rules.map((r) => r.metric)).toContain('COST_SPIKE');
    expect(rules.map((r) => r.metric)).toContain('LATENCY_SPIKE');
    expect(rules.map((r) => r.metric)).toContain('ERROR_RATE');
  });
});

describe('wireFirewallEvents', () => {
  it('should wire rate limiter and circuit breaker events', () => {
    const rl = new SlidingWindowRateLimiter({ windowMs: 5000, maxRequests: 10 });
    const cb = new CircuitBreaker('groq', { failureThreshold: 2, resetTimeoutMs: 1000 });
    const engine = new AnomalyEngine(createDefaultRules());
    const events: { type: string }[] = [];

    const unsub = wireFirewallEvents(rl, cb, engine, (event) => {
      events.push({ type: event.type });
    });

    unsub();

    expect(typeof unsub).toBe('function');
  });

  it('should emit circuit breaker events through wire', async () => {
    const rl = new SlidingWindowRateLimiter({ windowMs: 5000, maxRequests: 10 });
    const cb = new CircuitBreaker('groq-2', { failureThreshold: 2, resetTimeoutMs: 1000 });
    const engine = new AnomalyEngine([]);
    const events: string[] = [];

    const unsub = wireFirewallEvents(rl, cb, engine, (event) => {
      events.push(event.type);
    });

    await cb.execute(() => Promise.resolve('ok'));

    unsub();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
