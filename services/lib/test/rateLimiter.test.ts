import { describe, it, expect, beforeEach } from 'vitest';

describe('in-memory rate limiter', () => {
  let rateLimitCheck: typeof import('../rateLimiter').rateLimitCheck;
  let getRateLimiterStats: typeof import('../rateLimiter').getRateLimiterStats;
  let resetRateLimiterStats: typeof import('../rateLimiter').resetRateLimiterStats;
  let DEFAULT_RATE_LIMIT: typeof import('../rateLimiter').DEFAULT_RATE_LIMIT;

  beforeEach(async () => {
    const mod = await import('../rateLimiter');
    rateLimitCheck = mod.rateLimitCheck;
    getRateLimiterStats = mod.getRateLimiterStats;
    resetRateLimiterStats = mod.resetRateLimiterStats;
    DEFAULT_RATE_LIMIT = mod.DEFAULT_RATE_LIMIT;
    resetRateLimiterStats();
  });

  it('should allow requests within window under max', async () => {
    for (let i = 0; i < DEFAULT_RATE_LIMIT.maxRequests; i++) {
      const result = await rateLimitCheck('test-client', DEFAULT_RATE_LIMIT);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_RATE_LIMIT.maxRequests - i - 1);
      expect(result.limit).toBe(DEFAULT_RATE_LIMIT.maxRequests);
    }
  });

  it('should block requests exceeding max', async () => {
    for (let i = 0; i < DEFAULT_RATE_LIMIT.maxRequests; i++) {
      await rateLimitCheck('test-client', DEFAULT_RATE_LIMIT);
    }

    const result = await rateLimitCheck('test-client', DEFAULT_RATE_LIMIT);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should track totalRequests stat', async () => {
    await rateLimitCheck('client-a', DEFAULT_RATE_LIMIT);
    await rateLimitCheck('client-b', DEFAULT_RATE_LIMIT);
    await rateLimitCheck('client-c', DEFAULT_RATE_LIMIT);

    const stats = getRateLimiterStats();
    expect(stats.totalRequests).toBe(3);
  });

  it('should track blockedRequests stat', async () => {
    for (let i = 0; i <= DEFAULT_RATE_LIMIT.maxRequests; i++) {
      await rateLimitCheck('test-client', DEFAULT_RATE_LIMIT);
    }

    const stats = getRateLimiterStats();
    expect(stats.blockedRequests).toBe(1);
  });

  it('should track activeWindows stat', async () => {
    await rateLimitCheck('client-a', DEFAULT_RATE_LIMIT);
    await rateLimitCheck('client-b', DEFAULT_RATE_LIMIT);
    await rateLimitCheck('client-c', DEFAULT_RATE_LIMIT);

    const stats = getRateLimiterStats();
    expect(stats.activeWindows).toBe(3);
  });

  it('should track inMemoryChecks stat', async () => {
    await rateLimitCheck('client-a', DEFAULT_RATE_LIMIT);
    await rateLimitCheck('client-b', DEFAULT_RATE_LIMIT);

    const stats = getRateLimiterStats();
    expect(stats.inMemoryChecks).toBe(2);
  });

  it('should prune old timestamps', async () => {
    const config = { windowMs: 100, maxRequests: 5 };
    for (let i = 0; i < 5; i++) {
      await rateLimitCheck('test-client', config);
    }

    const result = await rateLimitCheck('test-client', config);
    expect(result.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 120));

    const resultAfterWindow = await rateLimitCheck('test-client', config);
    expect(resultAfterWindow.allowed).toBe(true);
    expect(resultAfterWindow.remaining).toBe(4);
    expect(resultAfterWindow.limit).toBe(config.maxRequests);
  });

  it('should reset all state on resetRateLimiterStats', async () => {
    for (let i = 0; i < 10; i++) {
      await rateLimitCheck('test-client', DEFAULT_RATE_LIMIT);
    }

    resetRateLimiterStats();

    const stats = getRateLimiterStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.blockedRequests).toBe(0);
    expect(stats.activeWindows).toBe(0);
    expect(stats.inMemoryChecks).toBe(0);
  });

  it('should handle empty key gracefully', async () => {
    const result = await rateLimitCheck('', DEFAULT_RATE_LIMIT);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_RATE_LIMIT.maxRequests - 1);
  });

  it('should handle empty string key as separate window from explicit key', async () => {
    const result1 = await rateLimitCheck('', DEFAULT_RATE_LIMIT);
    const result2 = await rateLimitCheck('ip:127.0.0.1', DEFAULT_RATE_LIMIT);

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    const stats = getRateLimiterStats();
    expect(stats.activeWindows).toBe(2);
  });

  it('should reset counter after window passes', async () => {
    const config = { windowMs: 100, maxRequests: 3 };

    for (let i = 0; i < 3; i++) {
      await rateLimitCheck('test-client', config);
    }

    const blocked = await rateLimitCheck('test-client', config);
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 120));

    const fresh = await rateLimitCheck('test-client', config);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(2);
  });

  it('should isolate rate limits between keys', async () => {
    for (let i = 0; i < DEFAULT_RATE_LIMIT.maxRequests; i++) {
      await rateLimitCheck('client-a', DEFAULT_RATE_LIMIT);
    }

    const blockedA = await rateLimitCheck('client-a', DEFAULT_RATE_LIMIT);
    expect(blockedA.allowed).toBe(false);

    const allowedB = await rateLimitCheck('client-b', DEFAULT_RATE_LIMIT);
    expect(allowedB.allowed).toBe(true);
  });

  it('should correctly report remaining in result', async () => {
    const result = await rateLimitCheck('test-client', DEFAULT_RATE_LIMIT);
    expect(result.remaining).toBe(DEFAULT_RATE_LIMIT.maxRequests - 1);
    expect(result.limit).toBe(DEFAULT_RATE_LIMIT.maxRequests);
    expect(result.resetAtMs).toBeGreaterThan(Date.now());
  });

  it('should use different config limits per call', async () => {
    const strictConfig = { windowMs: 60_000, maxRequests: 2 };
    const lenientConfig = { windowMs: 60_000, maxRequests: 100 };

    for (let i = 0; i < 2; i++) {
      await rateLimitCheck('multi-config', strictConfig);
    }

    const blocked = await rateLimitCheck('multi-config', strictConfig);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(2);

    const allowed = await rateLimitCheck('multi-config', lenientConfig);
    expect(allowed.allowed).toBe(true);
    expect(allowed.limit).toBe(100);
  });

  it('should track max window size for correct pruning', async () => {
    const shortConfig = { windowMs: 100, maxRequests: 3 };
    const longConfig = { windowMs: 200, maxRequests: 10 };

    await rateLimitCheck('hybrid', longConfig);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await rateLimitCheck('hybrid', shortConfig);
    await new Promise((resolve) => setTimeout(resolve, 70));

    const result = await rateLimitCheck('hybrid', longConfig);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThanOrEqual(longConfig.maxRequests - 1);
  });
});
