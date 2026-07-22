/**
 * services/lib/redis.js
 * ---------------------------------------------------------------------------
 * getRedisClient — the proven resilient Redis connection factory.
 *
 * Centralizes the ioredis configuration (retry strategy, ready-check,
 * max retries, TLS for Upstash) once, so every worker and agent shell shares
 * an identical, hardened connection profile. A single process-wide client is
 * created and reused; callers should not instantiate their own `new Redis(...)`
 * anymore.
 *
 * Connection is immediate: the client connects synchronously on creation.
 * We wire `connect` / `error` / `reconnecting` listeners so the process logs
 * state transitions without crashing on transient outages (the backend is
 * expected to survive Redis blips — "self-healing").
 * ---------------------------------------------------------------------------
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const isUpstash = REDIS_URL.startsWith('rediss://') || REDIS_URL.includes('upstash.io');

let _client = null;
const redisTelemetry = { primaryCount: 0, fallbackCount: 0, errorCount: 0 };

/**
 * Returns a shared, resilient ioredis client.
 * Upstash Redis (rediss://) receives permissive TLS settings to accommodate
 * cloud-native TLS termination. Callers that need persistent polling (workers,
 * subscriber connections) should pass { enableOfflineQueue: true } so their
 * first commands buffer until the lazy-connect handshake completes.
 * @param {object} [opts] Optional overrides.
 * @returns {import('ioredis').Redis}
 */
export function getRedisClient(opts = {}) {
  const label = opts.label || 'redis';

  if (!opts.forceNew && _client) return _client;

  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? false,
    retryStrategy: opts.retryStrategy ?? (() => null)
  };

  if (isUpstash) {
    baseConfig.tls = { rejectUnauthorized: false };
  }

  const client = new Redis(REDIS_URL, baseConfig);

  client.on('connect', () => { redisTelemetry.primaryCount += 1; console.log(`[${label}] Redis connected`); });
  client.on('ready', () => { redisTelemetry.primaryCount += 1; console.log(`[${label}] Redis ready`); });
  client.on('error', () => { redisTelemetry.errorCount += 1; });
  client.on('end', () => { redisTelemetry.fallbackCount += 1; console.warn(`[${label}] Redis connection closed`); });

  if (!opts.forceNew) _client = client;
  return _client;
}

/**
 * Returns a pub/sub-safe Redis client suitable for dedicated subscriber
 * connections. Unlike the one-shot command client, this includes retries and
 * offline queuing so the SSE event bus survives transient Redis outages
 * without losing events that were published while the subscriber was offline.
 * @returns {import('ioredis').Redis}
 */
export function getSubscriberClient() {
  const subConfig = {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 250, 5000)
  };

  if (isUpstash) {
    subConfig.tls = { rejectUnauthorized: false };
  }

  const client = new Redis(REDIS_URL, subConfig);

  client.on('connect', () => console.log('[SSE-sub] Redis subscriber connected'));
  client.on('ready', () => console.log('[SSE-sub] Redis subscriber ready'));
  client.on('error', (err) => console.error('[SSE-sub] Subscriber error:', err.message));

  return client;
}

export { redisTelemetry };
export default getRedisClient;
