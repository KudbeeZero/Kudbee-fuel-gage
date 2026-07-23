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
const REDIS_RATE_LIMIT_URL = process.env.REDIS_RATE_LIMIT_URL || REDIS_URL;
const isUpstash = REDIS_URL.startsWith('rediss://') || REDIS_URL.includes('upstash.io');
const isRateLimitUpstash = REDIS_RATE_LIMIT_URL.startsWith('rediss://') || REDIS_RATE_LIMIT_URL.includes('upstash.io');

let _client = null;
let _subClient = null;
let _rateLimitClient = null;
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
    retryStrategy: opts.retryStrategy ?? (() => null),
    connectTimeout: 5_000,
    commandTimeout: 3_000,
    keepAlive: 15_000
  };

  if (isUpstash) {
    baseConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(REDIS_URL, baseConfig);
  } catch {
    console.warn(`[${label}] Invalid REDIS_URL, skipping client creation`);
    if (!opts.forceNew) return;
    client = new Redis('redis://localhost:6379', baseConfig);
  }

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
  if (_subClient) return _subClient;

  const subConfig = {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 250, 5000)
  };

  if (isUpstash) {
    subConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(REDIS_URL, subConfig);
  } catch {
    console.warn('[SSE-sub] Invalid REDIS_URL, skipping subscriber client creation');
    return;
  }

  client.on('connect', () => console.log('[SSE-sub] Redis subscriber connected'));
  client.on('ready', () => console.log('[SSE-sub] Redis subscriber ready'));
  client.on('error', (err) => console.error('[SSE-sub] Subscriber error:', err.message));

  return client;
}

/**
 * Returns a dedicated Redis client wired exclusively to REDIS_RATE_LIMIT_URL
 * for Heroku-favored INCR/EXPIRE rate limiting. Offloaded to a separate
 * Redis instance so rate-limit bursts never compete with pub/sub or state ops.
 * Falls back to REDIS_URL if REDIS_RATE_LIMIT_URL is not set.
 * @param {object} [opts] Optional overrides.
 * @returns {import('ioredis').Redis}
 */
export function getRateLimitClient(opts = {}) {
  if (!opts.forceNew && _rateLimitClient) return _rateLimitClient;

  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? false,
    retryStrategy: opts.retryStrategy ?? (() => null),
    connectTimeout: 3_000,
    commandTimeout: 1_000,
    keepAlive: 10_000
  };

  if (isRateLimitUpstash) {
    baseConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(REDIS_RATE_LIMIT_URL, baseConfig);
  } catch {
    console.warn('[rate-limit] Invalid REDIS_RATE_LIMIT_URL, falling back to REDIS_URL');
    client = new Redis(REDIS_URL, baseConfig);
  }

  client.on('connect', () => { redisTelemetry.primaryCount += 1; console.log('[rate-limit] Redis connected'); });
  client.on('ready', () => { redisTelemetry.primaryCount += 1; console.log('[rate-limit] Redis ready'); });
  client.on('error', () => { redisTelemetry.errorCount += 1; });
  client.on('end', () => { redisTelemetry.fallbackCount += 1; console.warn('[rate-limit] Redis connection closed'); });

  if (!opts.forceNew) _rateLimitClient = client;
  return _rateLimitClient;
}

/**
 * Returns a dedicated Redis client wired exclusively to REDIS_SLOW_URL
 * for HERMES, Crucible, and other heavy governance/worker loops.
 * @param {object} [opts] Optional overrides.
 * @returns {import('ioredis').Redis}
 */
export function getSlowRedisClient(opts = {}) {
  const REDIS_SLOW_URL = process.env.REDIS_SLOW_URL || REDIS_URL;
  const isSlowUpstash = REDIS_SLOW_URL.startsWith('rediss://') || REDIS_SLOW_URL.includes('upstash.io');

  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? false,
    retryStrategy: opts.retryStrategy ?? (() => null),
    connectTimeout: 5_000,
    commandTimeout: 3_000,
    keepAlive: 15_000
  };

  if (isSlowUpstash) {
    baseConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(REDIS_SLOW_URL, baseConfig);
  } catch {
    console.warn('[slow-redis] Invalid REDIS_SLOW_URL, falling back to REDIS_URL');
    client = new Redis(REDIS_URL, baseConfig);
  }

  client.on('connect', () => { console.log(`[slow-redis] Redis connected`); });
  client.on('ready', () => { console.log(`[slow-redis] Redis ready`); });
  client.on('error', (err) => { console.error(`[slow-redis] Error:`, err.message); });
  client.on('end', () => { console.warn(`[slow-redis] Redis connection closed`); });

  return client;
}

let _blockingClient = null;

export function getBlockingRedisClient(opts = {}) {
  if (!opts.forceNew && _blockingClient) return _blockingClient;

  const baseConfig = {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 250, 5000),
    connectTimeout: 5_000,
    commandTimeout: 0,
    keepAlive: 15_000
  };

  if (REDIS_URL.includes('upstash.io') || REDIS_URL.startsWith('rediss://')) {
    baseConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(REDIS_URL, baseConfig);
  } catch {
    console.warn('[blocking-redis] Invalid REDIS_URL, skipping blocking client creation');
    return null;
  }

  client.on('connect', () => console.log('[blocking-redis] Redis connected'));
  client.on('ready', () => console.log('[blocking-redis] Redis ready'));
  client.on('error', (err) => console.error('[blocking-redis] Error:', err.message));
  client.on('end', () => { console.warn('[blocking-redis] Redis connection closed'); _blockingClient = null; });

  if (!opts.forceNew) _blockingClient = client;
  return _blockingClient;
}

export { redisTelemetry };
export default getRedisClient;
