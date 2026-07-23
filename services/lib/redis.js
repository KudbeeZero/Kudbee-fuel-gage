/**
 * services/lib/redis.js
 * ---------------------------------------------------------------------------
 * Resilient Redis connection factory supporting both ioredis (TCP) and
 * @upstash/redis (HTTP/REST).
 *
 * Primary backend selection:
 *   - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, use
 *     @upstash/redis (no TCP sockets, serverless-safe).
 *   - Otherwise fall back to ioredis for local/dev and advanced features.
 *
 * Upstash caveats:
 *   - Pub/sub is not supported by REST; getSubscriberClient falls back to
 *     ioredis when Upstash is active (only created on demand).
 *   - Lua scripts (EVAL/EVALSHA) are also not supported; rateLimiter,
 *     tokenBucket, and circuitBreaker should migrate to non-Lua logic.
 * ---------------------------------------------------------------------------
 */

import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const REDIS_RATE_LIMIT_URL = process.env.REDIS_RATE_LIMIT_URL || REDIS_URL;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function validateUpstashEnv() {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error(
      '[Redis] Upstash mode enabled but missing env vars: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.'
    );
  }
  if (!UPSTASH_URL.startsWith('https://')) {
    throw new Error(
      `[Redis] UPSTASH_REDIS_REST_URL must use https:// scheme, got: ${UPSTASH_URL}`
    );
  }
}

const useUpstash = !!UPSTASH_URL && !!UPSTASH_TOKEN;

let _client = null;
let _upstashClient = null;
let _subClient = null;
let _rateLimitClient = null;
let _rateLimitIoredis = null;
let _slowClient = null;
let _slowIoredis = null;

const redisTelemetry = { primaryCount: 0, fallbackCount: 0, errorCount: 0 };

function createUpstashClient() {
  validateUpstashEnv();
  _upstashClient = new UpstashRedis({
    url: UPSTASH_URL,
    token: UPSTASH_TOKEN,
  });
  return _upstashClient;
}

function createIoredis(url, label, opts = {}) {
  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? false,
    retryStrategy: opts.retryStrategy ?? (() => null),
    connectTimeout: opts.connectTimeout ?? 5_000,
    commandTimeout: opts.commandTimeout ?? 3_000,
    keepAlive: opts.keepAlive ?? 15_000,
  };

  if (url.includes('upstash.io') || url.startsWith('rediss://')) {
    baseConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(url, baseConfig);
  } catch {
    console.warn(`[${label}] Invalid Redis URL, skipping client creation`);
    if (!opts.forceNew) return null;
    client = new Redis('redis://localhost:6379', baseConfig);
  }

  client.on('connect', () => {
    redisTelemetry.primaryCount += 1;
    console.log(`[${label}] Redis connected`);
  });
  client.on('ready', () => {
    redisTelemetry.primaryCount += 1;
    console.log(`[${label}] Redis ready`);
  });
  client.on('error', () => {
    redisTelemetry.errorCount += 1;
  });
  client.on('end', () => {
    redisTelemetry.fallbackCount += 1;
    console.warn(`[${label}] Redis connection closed`);
  });

  return client;
}

export function getRedisClient(opts = {}) {
  const label = opts.label || 'redis';

  if (!opts.forceNew && useUpstash) {
    if (!_client) {
      _client = createUpstashClient();
    }
    return _client;
  }

  if (!opts.forceNew && _client) return _client;

  const client = createIoredis(REDIS_URL, label, opts);
  if (!opts.forceNew) _client = client;
  return _client;
}

export function getSubscriberClient() {
  if (_subClient) return _subClient;

  if (useUpstash) {
    console.warn('[SSE-sub] Upstash REST does not support pub/sub. Falling back to polling or disabling subscriber.');
    return null;
  }

  const subConfig = {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 250, 5000),
  };

  if (REDIS_URL.includes('upstash.io') || REDIS_URL.startsWith('rediss://')) {
    subConfig.tls = {};
  }

  let client;
  try {
    client = new Redis(REDIS_URL, subConfig);
  } catch {
    console.warn('[SSE-sub] Invalid REDIS_URL, skipping subscriber client creation');
    return null;
  }

  client.on('connect', () => console.log('[SSE-sub] Redis subscriber connected'));
  client.on('ready', () => console.log('[SSE-sub] Redis subscriber ready'));
  client.on('error', (err) => console.error('[SSE-sub] Subscriber error:', err.message));

  _subClient = client;
  return _subClient;
}

export function getRateLimitClient(opts = {}) {
  if (!opts.forceNew) {
    if (useUpstash && _rateLimitClient) return _rateLimitClient;
    if (!useUpstash && _rateLimitClient) return _rateLimitClient;
  }

  if (useUpstash) {
    if (!_rateLimitIoredis) {
      _rateLimitIoredis = createIoredis(REDIS_RATE_LIMIT_URL, 'rate-limit', {
        connectTimeout: 3_000,
        commandTimeout: 1_000,
        keepAlive: 10_000,
      });
    }
    return _rateLimitIoredis;
  }

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

  if (REDIS_RATE_LIMIT_URL.includes('upstash.io') || REDIS_RATE_LIMIT_URL.startsWith('rediss://')) {
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

export function getSlowRedisClient(opts = {}) {
  const REDIS_SLOW_URL = process.env.REDIS_SLOW_URL || REDIS_URL;

  if (!opts.forceNew) {
    if (useUpstash && _slowClient) return _slowClient;
    if (!useUpstash && _slowClient) return _slowClient;
  }

  if (useUpstash) {
    if (!_slowIoredis) {
      _slowIoredis = createIoredis(REDIS_SLOW_URL, 'slow-redis', {
        connectTimeout: 5_000,
        commandTimeout: 3_000,
        keepAlive: 15_000,
      });
    }
    return _slowIoredis;
  }

  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? false,
    retryStrategy: opts.retryStrategy ?? (() => null),
    connectTimeout: 5_000,
    commandTimeout: 3_000,
    keepAlive: 15_000,
  };

  if (REDIS_SLOW_URL.includes('upstash.io') || REDIS_SLOW_URL.startsWith('rediss://')) {
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

  if (!opts.forceNew) _slowClient = client;
  return _slowClient;
}

export function isUsingUpstash() {
  return useUpstash;
}

export { redisTelemetry };
export default getRedisClient;
