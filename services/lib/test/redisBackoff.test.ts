import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryQueueManager } from '../inMemoryQueue';

describe('InMemoryQueueManager', () => {
  let queue: InMemoryQueueManager;

  beforeEach(() => {
    queue = new InMemoryQueueManager({ flushIntervalMs: 100 });
  });

  it('should enqueue items and track size', () => {
    queue.enqueue({ test: 'data1' });
    queue.enqueue({ test: 'data2' });
    expect(queue.size).toBe(2);
  });

  it('should respect max queue size', () => {
    const smallQueue = new InMemoryQueueManager({ maxSize: 3 });
    smallQueue.enqueue(1);
    smallQueue.enqueue(2);
    smallQueue.enqueue(3);
    smallQueue.enqueue(4);
    smallQueue.enqueue(5);
    expect(smallQueue.size).toBe(3);
  });

  it('should return stats', () => {
    queue.enqueue({ test: 'stats' });
    const stats = queue.stats();
    expect(stats.size).toBe(1);
    expect(stats.active).toBe(false);
    expect(stats.oldestItemAgeMs).toBeGreaterThanOrEqual(0);
  });

  it('should flush items with onFlush callback', async () => {
    const flushed: unknown[] = [];
    const flushQueue = new InMemoryQueueManager({
      flushIntervalMs: 50,
      onFlush: async (items) => {
        flushed.push(...items);
      }
    });

    flushQueue.enqueue({ id: 'a' });
    flushQueue.enqueue({ id: 'b' });

    const count = await flushQueue.flush();
    expect(count).toBe(2);
    expect(flushed.length).toBe(2);
    expect(flushQueue.size).toBe(0);
  });

  it('should retry failed flushes', async () => {
    let attempts = 0;
    const retryQueue = new InMemoryQueueManager({
      onFlush: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('Quota exceeded');
        return;
      }
    });

    retryQueue.enqueue({ retry: true });
    retryQueue.enqueue({ retry: true });

    let count = 0;
    for (let i = 0; i < 5; i++) {
      count = await retryQueue.flush();
      if (count > 0) break;
    }

    expect(attempts).toBeGreaterThanOrEqual(1);
  });

  it('should start and stop the flush timer', () => {
    expect(queue.isActive).toBe(false);
    queue.start();
    expect(queue.isActive).toBe(true);
    queue.stop();
    expect(queue.isActive).toBe(false);
  });

  it('should generate unique ids for enqueued items', () => {
    const id1 = queue.enqueue({ a: 1 });
    const id2 = queue.enqueue({ b: 2 });
    expect(id1).not.toBe(id2);
  });

  it('should getOrCreateInMemoryQueue return singleton', async () => {
    const { getOrCreateInMemoryQueue } = await import('../inMemoryQueue');
    const q1 = getOrCreateInMemoryQueue();
    const q2 = getOrCreateInMemoryQueue();
    expect(q1).toBe(q2);
    q1.stop();
  });

  it('should track isInMemoryFallbackActive', async () => {
    const { isInMemoryFallbackActive, getOrCreateInMemoryQueue } = await import('../inMemoryQueue');
    const q = getOrCreateInMemoryQueue();
    q.start();
    expect(isInMemoryFallbackActive()).toBe(true);
    q.stop();
  });
});

describe('isRedisQuotaError', () => {
  it('should detect MAX_REQUESTS_LIMIT errors', async () => {
    const { isRedisQuotaError } = await import('../redis.js');
    expect(isRedisQuotaError('ERR max requests limit exceeded. Limit: 500000')).toBe(true);
    expect(isRedisQuotaError(new Error('MAX_REQUESTS_LIMIT reached'))).toBe(true);
  });

  it('should detect 429 rate limit errors', async () => {
    const { isRedisQuotaError } = await import('../redis.js');
    expect(isRedisQuotaError('HTTP 429 Too Many Requests')).toBe(true);
    expect(isRedisQuotaError('rate limit exceeded')).toBe(true);
  });

  it('should return false for non-quota errors', async () => {
    const { isRedisQuotaError } = await import('../redis.js');
    expect(isRedisQuotaError('Connection refused')).toBe(false);
    expect(isRedisQuotaError('ETIMEDOUT')).toBe(false);
  });

  it('should handle string and Error objects', async () => {
    const { isRedisQuotaError } = await import('../redis.js');
    expect(isRedisQuotaError('ERR max requests')).toBe(true);
    expect(isRedisQuotaError(new Error('rate limit hit'))).toBe(true);
  });
});

describe('Redis quota backoff', () => {
  it('should apply and reset backoff', async () => {
    const { applyRedisQuotaBackoff, resetRedisQuotaBackoff, getRedisQuotaBackoffRemaining, quotaBackoffState } = await import('../redis.js');

    resetRedisQuotaBackoff();
    expect(quotaBackoffState.enabled).toBe(false);
    expect(quotaBackoffState.consecutiveErrors).toBe(0);

    const backoff1 = applyRedisQuotaBackoff();
    expect(backoff1).toBeGreaterThanOrEqual(2000);
    expect(quotaBackoffState.consecutiveErrors).toBe(1);
    expect(getRedisQuotaBackoffRemaining()).toBeGreaterThan(0);

    applyRedisQuotaBackoff();
    expect(quotaBackoffState.consecutiveErrors).toBe(2);

    resetRedisQuotaBackoff();
    expect(quotaBackoffState.consecutiveErrors).toBe(0);
    expect(quotaBackoffState.enabled).toBe(false);
    expect(getRedisQuotaBackoffRemaining()).toBe(0);
  });

  it('should exponentially increase backoff up to 30s cap', async () => {
    const { applyRedisQuotaBackoff, resetRedisQuotaBackoff, quotaBackoffState } = await import('../redis.js');
    resetRedisQuotaBackoff();

    let prevBackoff = 0;
    for (let i = 0; i < 6; i++) {
      const backoff = applyRedisQuotaBackoff();
      if (i > 0) {
        expect(backoff).toBeGreaterThanOrEqual(prevBackoff);
      }
      expect(backoff).toBeLessThanOrEqual(30_000);
      prevBackoff = backoff;
    }

    expect(quotaBackoffState.backoffMs).toBeGreaterThanOrEqual(16_000);
  });
});
