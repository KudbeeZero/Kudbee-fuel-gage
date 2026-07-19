/**
 * services/lib/redis.js
 * ---------------------------------------------------------------------------
 * getRedisClient — the proven resilient Redis connection factory.
 *
 * Centralizes the ioredis configuration (retry strategy, ready-check,
 * max retries) once, so every worker and agent shell shares an identical,
 * hardened connection profile. A single process-wide client is created and
 * reused; callers should not instantiate their own `new Redis(...)` anymore.
 *
 * Connection is lazy: the client connects on first command. We wire `connect`
 * / `error` / `reconnecting` listeners so the process logs state transitions
 * without crashing on transient outages (the backend is expected to survive
 * Redis blips — "self-healing").
 * ---------------------------------------------------------------------------
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let _client = null;

/**
 * Returns a shared, resilient ioredis client.
 * @param {object} [opts] Optional overrides for labels/logging.
 * @returns {import('ioredis').Redis}
 */
export function getRedisClient(opts = {}) {
  const label = opts.label || 'redis';

  if (_client) return _client;

  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    lazyConnect: false
  });

  client.on('connect', () => console.log(`[${label}] Redis connected`));
  client.on('ready', () => console.log(`[${label}] Redis ready`));
  client.on('error', (err) => console.error(`[${label}] Redis error:`, err.message));
  client.on('reconnecting', (delay) =>
    console.warn(`[${label}] Redis reconnecting in ${delay ?? '?'}ms`)
  );
  client.on('end', () => console.warn(`[${label}] Redis connection closed`));

  _client = client;
  return _client;
}

export default getRedisClient;
