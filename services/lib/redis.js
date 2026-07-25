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
import { getOrCreateInMemoryQueue } from './inMemoryQueue.ts';

function sanitizeRedisUrl(url) {
  if (!url) return url;
  if (url.startsWith('rediss://') || url.startsWith('redis://')) return url;
  if (url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return `rediss://${parsed.hostname}:6379`;
    } catch {
      console.warn('[redis] Failed to parse URL, keeping original');
      return url;
    }
  }
  return url;
}

function hostnameIsUpstash(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'upstash.io' || parsed.hostname.endsWith('.upstash.io');
  } catch {
    return false;
  }
}

const REDIS_URL = sanitizeRedisUrl(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const REDIS_RATE_LIMIT_URL = sanitizeRedisUrl(process.env.REDIS_RATE_LIMIT_URL || REDIS_URL);
const REDIS_WORKER_URL = sanitizeRedisUrl(process.env.REDIS_WORKER_URL || REDIS_URL);
const isUpstash = REDIS_URL.startsWith('rediss://') || hostnameIsUpstash(REDIS_URL);
const isRateLimitUpstash =
  REDIS_RATE_LIMIT_URL.startsWith('rediss://') || hostnameIsUpstash(REDIS_RATE_LIMIT_URL);
const isWorkerUpstash =
  REDIS_WORKER_URL.startsWith('rediss://') || hostnameIsUpstash(REDIS_WORKER_URL);
const MAX_REQUESTS_LIMIT = 500_000;
const CIRCUIT_BREAKER_RESET_MS = 30_000;

let _client = null;
let _subClient = null;
let _rateLimitClient = null;
const redisTelemetry = { primaryCount: 0, fallbackCount: 0, errorCount: 0 };
const circuitBreaker = { open: false, openedAt: 0, requestCount: 0, lastError: null };
const quotaBackoffState = { enabled: false, backoffMs: 2000, untilTs: 0, consecutiveErrors: 0 };

/**
 * Inspects a Redis error message and returns true if the error indicates
 * a quota exhaustion or rate-limit condition (Upstash MAX_REQUESTS_LIMIT,
 * HTTP 429, or ERR max requests).
 * @param {Error|string} err
 * @returns {boolean}
 */
export function isRedisQuotaError(err) {
  const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err);
  return (
    msg.includes('MAX_REQUESTS_LIMIT') ||
    msg.includes('max requests limit exceeded') ||
    msg.includes('ERR max requests') ||
    msg.includes('rate limit') ||
    msg.includes('429')
  );
}

/**
 * Adaptive exponential backoff for Redis quota exhaustion.
 * Starting at 2s, doubling each consecutive quota error up to 30s.
 * Returns the recommended sleep duration in milliseconds.
 * @returns {number}
 */
export function applyRedisQuotaBackoff() {
  quotaBackoffState.consecutiveErrors += 1;
  const baseMs = 2000;
  const maxMs = 30_000;
  const backoffMs = Math.min(baseMs * Math.pow(2, quotaBackoffState.consecutiveErrors - 1), maxMs);
  quotaBackoffState.backoffMs = backoffMs;
  quotaBackoffState.untilTs = Date.now() + backoffMs;
  quotaBackoffState.enabled = true;
  return backoffMs;
}

/**
 * Resets the quota backoff state after a successful operation.
 */
export function resetRedisQuotaBackoff() {
  quotaBackoffState.consecutiveErrors = 0;
  quotaBackoffState.backoffMs = 2000;
  quotaBackoffState.enabled = false;
  quotaBackoffState.untilTs = 0;
}

/**
 * Returns the remaining backoff time in ms, or 0 if not currently backing off.
 * @returns {number}
 */
export function getRedisQuotaBackoffRemaining() {
  if (!quotaBackoffState.enabled) return 0;
  const remaining = quotaBackoffState.untilTs - Date.now();
  return Math.max(0, remaining);
}

export { quotaBackoffState };

/**
 * Detects Upstash free-tier quota exhaustion errors in worker BRPOP/BLPOP loops.
 * Matches the canonical Upstash error messages: "ERR max requests",
 * "max requests limit exceeded", and "MAX_REQUESTS_LIMIT".
 * @param {Error|string} err
 * @returns {boolean}
 */
export function isUpstashMaxRequestsError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('ERR max requests') ||
    msg.includes('max requests limit exceeded') ||
    msg.includes('MAX_REQUESTS_LIMIT')
  );
}

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

  const adaptiveRetryStrategy = (times) => {
    if (circuitBreaker.open) {
      const elapsed = Date.now() - circuitBreaker.openedAt;
      if (elapsed < CIRCUIT_BREAKER_RESET_MS) {
        return CIRCUIT_BREAKER_RESET_MS - elapsed;
      }
      circuitBreaker.open = false;
      circuitBreaker.requestCount = 0;
      circuitBreaker.lastError = null;
    }
    return Math.min(times * 250, 5000);
  };

  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? true,
    retryStrategy: opts.retryStrategy ?? adaptiveRetryStrategy,
    connectTimeout: 10_000,
    commandTimeout: 3_000,
    keepAlive: 15_000,
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

  client.on('connect', () => {
    redisTelemetry.primaryCount += 1;
    console.log(`[${label}] Redis connected`);
  });
  client.on('ready', () => {
    resetRedisQuotaBackoff();
    redisTelemetry.primaryCount += 1;
    console.log(`[${label}] Redis ready`);
  });
  client.on('error', (err) => {
    redisTelemetry.errorCount += 1;
    const msg = err instanceof Error ? err.message : String(err);
    if (isRedisQuotaError(msg)) {
      const backoff = applyRedisQuotaBackoff();
      circuitBreaker.open = true;
      circuitBreaker.openedAt = Date.now();
      circuitBreaker.lastError = msg;
      console.warn(`[${label}] Quota error — circuit opened, backoff ${backoff}ms: ${msg}`);
    } else if (
      msg.includes('MAX_REQUESTS_LIMIT') ||
      msg.includes('rate limit') ||
      msg.includes('429')
    ) {
      circuitBreaker.open = true;
      circuitBreaker.openedAt = Date.now();
      circuitBreaker.lastError = msg;
      console.warn(`[${label}] Circuit breaker opened due to rate limit: ${msg}`);
    }
  });
  client.on('end', () => {
    redisTelemetry.fallbackCount += 1;
    console.warn(`[${label}] Redis connection closed`);
  });

  if (!opts.forceNew) _client = client;
  return client;
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
    retryStrategy: (times) => Math.min(times * 250, 5000),
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
    keepAlive: 10_000,
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

  client.on('connect', () => {
    redisTelemetry.primaryCount += 1;
    console.log('[rate-limit] Redis connected');
  });
  client.on('ready', () => {
    redisTelemetry.primaryCount += 1;
    console.log('[rate-limit] Redis ready');
  });
  client.on('error', () => {
    redisTelemetry.errorCount += 1;
  });
  client.on('end', () => {
    redisTelemetry.fallbackCount += 1;
    console.warn('[rate-limit] Redis connection closed');
  });

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
  const REDIS_SLOW_URL = sanitizeRedisUrl(process.env.REDIS_SLOW_URL || REDIS_URL);
  const isSlowUpstash = REDIS_SLOW_URL.startsWith('rediss://') || hostnameIsUpstash(REDIS_SLOW_URL);

  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? true,
    retryStrategy: opts.retryStrategy ?? ((times) => Math.min(times * 250, 5000)),
    connectTimeout: 10_000,
    commandTimeout: 3_000,
    keepAlive: 15_000,
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

  client.on('connect', () => {
    console.log(`[slow-redis] Redis connected`);
  });
  client.on('ready', () => {
    console.log(`[slow-redis] Redis ready`);
  });
  client.on('error', (err) => {
    console.error(`[slow-redis] Error:`, err.message);
  });
  client.on('end', () => {
    console.warn(`[slow-redis] Redis connection closed`);
  });

  return client;
}

let _blockingClient = null;

// BRPOP/BLPOP AUDIT (PR #181 / Bead 1 — Worker Loop Resilience):
//   #1 services/monitor/agent.js:174   blpop kudbee:telemetry_feed 5s   (monitor-worker)
//   #2 services/agents/worker.ts:364   brpop kudbee-governance-tasks 5s  (ingestion server)
//   #3 services/lib/jobQueue.ts:35     brpop kudbee:jobs:{queue} 5s      (generic job queue)
//   #4 worker.js:173                   blpop kudbee:governance:tasks 0s   (hermes-worker)
// All call sites MUST survive Upstash quota errors (ERR max requests) without crashing.
export function getBlockingRedisClient(opts = {}) {
  if (!opts.forceNew && _blockingClient) return _blockingClient;

  const baseConfig = {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 500, 10000),
    connectTimeout: 10_000,
    commandTimeout: 0,
    keepAlive: 15_000,
  };

  if (REDIS_URL.startsWith('rediss://') || hostnameIsUpstash(REDIS_URL)) {
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
  client.on('ready', () => {
    resetRedisQuotaBackoff();
    console.log('[blocking-redis] Redis ready');
  });
  client.on('error', (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (isRedisQuotaError(msg)) {
      const backoff = applyRedisQuotaBackoff();
      console.warn(
        `[blocking-redis] Quota error — backing off ${backoff}ms (consecutive: ${quotaBackoffState.consecutiveErrors})`
      );

      const inMemoryQueue = getOrCreateInMemoryQueue();
      inMemoryQueue.enqueue({
        queue: 'kudbee:telemetry_buffer',
        data: { error: msg, timestamp: new Date().toISOString(), source: 'blocking-redis' },
        source: 'blocking-redis',
      });
    }
    console.error('[blocking-redis] Error:', msg);
  });
  client.on('end', () => {
    console.warn('[blocking-redis] Redis connection closed');
    _blockingClient = null;
  });

  if (!opts.forceNew) _blockingClient = client;
  return client;
}

let _workerClient = null;

export function getWorkerRedisClient(opts = {}) {
  if (!opts.forceNew && _workerClient) return _workerClient;

  const baseConfig = {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 500, 10000),
    connectTimeout: 10_000,
    commandTimeout: 0,
    keepAlive: 15_000,
  };

  if (isWorkerUpstash) {
    baseConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(REDIS_WORKER_URL, baseConfig);
  } catch {
    console.warn('[worker-redis] Invalid REDIS_WORKER_URL, falling back to REDIS_URL');
    try {
      client = new Redis(REDIS_URL, baseConfig);
    } catch {
      console.warn('[worker-redis] Invalid REDIS_URL, skipping worker client creation');
      return null;
    }
  }

  client.on('connect', () => console.log('[worker-redis] Redis connected'));
  client.on('ready', () => {
    resetRedisQuotaBackoff();
    console.log('[worker-redis] Redis ready');
  });
  client.on('error', (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (isRedisQuotaError(msg)) {
      const backoff = applyRedisQuotaBackoff();
      console.warn(
        `[worker-redis] Quota error — backing off ${backoff}ms (consecutive: ${quotaBackoffState.consecutiveErrors})`
      );

      const inMemoryQueue = getOrCreateInMemoryQueue();
      inMemoryQueue.enqueue({
        queue: 'kudbee:telemetry_buffer',
        data: { error: msg, timestamp: new Date().toISOString(), source: 'worker-redis' },
        source: 'worker-redis',
      });
    }
    console.error('[worker-redis] Error:', msg);
  });
  client.on('end', () => {
    console.warn('[worker-redis] Redis connection closed');
    _workerClient = null;
  });

  if (!opts.forceNew) _workerClient = client;
  return client;
}

/**
 * Initializes the InMemoryQueueManager with a Redis-backed flush handler.
 * When Redis recovers from quota exhaustion, buffered events are replayed
 * through the publish channel. Call this once during application bootstrap.
 */
export function initRedisFallbackQueue() {
  const inMemoryQueue = getOrCreateInMemoryQueue({
    onFlush: async (items) => {
      const redis = getRedisClient({ label: 'fallback-flush' });
      if (!redis) {
        console.warn('[InMemoryQueue] No Redis client available for flush — items retained');
        throw new Error('Redis unavailable');
      }
      for (const item of items) {
        try {
          const payload = item.data;
          if (payload && typeof payload === 'object' && payload.queue && payload.data) {
            await redis.lpush(payload.queue, JSON.stringify(payload.data));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isRedisQuotaError(msg)) {
            throw new Error('Redis quota still exhausted');
          }
          console.warn(`[InMemoryQueue] Failed to flush item ${item.id}: ${msg}`);
        }
      }
      console.log(`[InMemoryQueue] Flushed ${items.length} items to Redis`);
    },
  });
  return inMemoryQueue;
}

export { redisTelemetry };
export default getRedisClient;
