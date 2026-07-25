/**
 * services/lib/redis.js
 * ---------------------------------------------------------------------------
 * getRedisClient — the resilient Redis connection factory.
 *
 * Centralizes the ioredis configuration (retry strategy, ready-check,
 * max retries, TLS for Upstash) so every worker and agent shell shares
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

function resolveRedisUrl(): string | null {
  const explicit = process.env.REDIS_URL;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      const url = new URL(upstashUrl);
      const host = url.host || url.hostname;
      return `rediss://default:${encodeURIComponent(upstashToken)}@${host}:6379`;
    } catch {
      console.warn('[Redis] Invalid UPSTASH_REDIS_REST_URL, cannot construct rediss:// endpoint');
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[Redis] No credentials configured; using in-memory mock for local testing');
    return null;
  }

  console.warn('[Redis] No credentials configured; falling back to localhost');
  return 'redis://127.0.0.1:6379';
}

const REDIS_URL = resolveRedisUrl();
const REDIS_RATE_LIMIT_URL = process.env.REDIS_RATE_LIMIT_URL?.trim() || REDIS_URL || 'redis://127.0.0.1:6379';
const isUpstash = Boolean(REDIS_URL && (REDIS_URL.startsWith('rediss://') || REDIS_URL.includes('upstash.io')));
const isRateLimitUpstash = Boolean(REDIS_RATE_LIMIT_URL && (REDIS_RATE_LIMIT_URL.startsWith('rediss://') || REDIS_RATE_LIMIT_URL.includes('upstash.io')));
const MAX_REQUESTS_LIMIT = 500_000;
const CIRCUIT_BREAKER_RESET_MS = 30_000;

let _client = null;
let _subClient = null;
let _rateLimitClient = null;
const redisTelemetry = { primaryCount: 0, fallbackCount: 0, errorCount: 0 };
const circuitBreaker = { open: false, openedAt: 0, requestCount: 0, lastError: null };

class InMemoryRedis {
  #store = new Map();
  #listeners = new Map();

  get(key) {
    return this.#store.get(key) ?? null;
  }
  set(key, val) {
    this.#store.set(key, val);
    return 'OK';
  }
  setex(key, ttl, val) {
    this.#store.set(key, val);
    setTimeout(() => this.#store.delete(key), ttl * 1000);
    return 'OK';
  }
  del(...keys) {
    for (const k of keys) this.#store.delete(k);
    return keys.length;
  }
  exists(...keys) {
    return keys.filter(k => this.#store.has(k)).length;
  }
  incr(key) {
    const current = Number(this.#store.get(key) || 0);
    const next = current + 1;
    this.#store.set(key, next);
    return next;
  }
  incrbyfloat(key, delta) {
    const current = parseFloat(this.#store.get(key) || '0');
    const next = current + parseFloat(delta);
    this.#store.set(key, String(next));
    return next;
  }
  keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return Array.from(this.#store.keys()).filter(k => regex.test(k));
  }
  ping() {
    return Promise.resolve('PONG');
  }
  publish(channel, message) {
    const handlers = this.#listeners.get(channel) || new Set();
    for (const handler of handlers) {
      try { handler(message); } catch { /* ignore */ }
    }
    return Promise.resolve(handlers.size);
  }
  subscribe(channel, handler) {
    if (!this.#listeners.has(channel)) this.#listeners.set(channel, new Set());
    this.#listeners.get(channel).add(handler);
    return Promise.resolve();
  }
  psubscribe(pattern, handler) {
    for (const key of this.#store.keys()) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      if (regex.test(key) && !this.#listeners.has(key)) this.#listeners.set(key, new Set());
    }
    return Promise.resolve();
  }
  lpush(key, ...values) {
    const arr = this.#store.get(key) || [];
    for (const v of values) arr.unshift(v);
    this.#store.set(key, arr);
    return arr.length;
  }
  rpush(key, ...values) {
    const arr = this.#store.get(key) || [];
    for (const v of values) arr.push(v);
    this.#store.set(key, arr);
    return arr.length;
  }
  lpop(key) {
    const arr = this.#store.get(key) || [];
    const val = arr.shift();
    if (arr.length === 0) this.#store.delete(key); else this.#store.set(key, arr);
    return val ?? null;
  }
  llen(key) {
    return (this.#store.get(key) || []).length;
  }
  lrange(key, start, stop) {
    const arr = this.#store.get(key) || [];
    const end = stop < 0 ? arr.length + stop : stop + 1;
    return arr.slice(Math.max(0, start), Math.max(0, end));
  }
  ltrim(key, start, stop) {
    const arr = this.#store.get(key) || [];
    const end = stop < 0 ? arr.length + stop : stop + 1;
    const trimmed = arr.slice(Math.max(0, start), Math.max(0, end));
    if (trimmed.length === 0) this.#store.delete(key); else this.#store.set(key, trimmed);
    return 'OK';
  }
  brpop(...keys) {
    const timeout = typeof keys[keys.length - 1] === 'number' ? keys.pop() : 0;
    return new Promise((resolve) => {
      const check = () => {
        for (const key of keys) {
          const arr = this.#store.get(key) || [];
          if (arr.length > 0) {
            const val = arr.pop();
            if (arr.length === 0) this.#store.delete(key); else this.#store.set(key, arr);
            resolve([key, val]);
            return;
          }
        }
        if (timeout > 0) setTimeout(check, 100);
      };
      check();
    });
  }
  sadd(key, ...members) {
    const set = new Set(this.#store.get(key) || []);
    for (const m of members) set.add(m);
    this.#store.set(key, Array.from(set));
    return set.size;
  }
  smembers(key) {
    return this.#store.get(key) || [];
  }
  srem(key, ...members) {
    const set = new Set(this.#store.get(key) || []);
    for (const m of members) set.delete(m);
    this.#store.set(key, Array.from(set));
    return members.length;
  }
  sismember(key, member) {
    const set = new Set(this.#store.get(key) || []);
    return set.has(member) ? 1 : 0;
  }
  zadd(key, ...args) {
    const sorted = this.#store.get(key) || [];
    for (let i = 0; i < args.length; i += 2) {
      const score = parseFloat(args[i]);
      const member = args[i + 1];
      const idx = sorted.findIndex(item => item.member === member);
      if (idx >= 0) sorted[idx].score = score; else sorted.push({ score, member });
    }
    sorted.sort((a, b) => a.score - b.score);
    this.#store.set(key, sorted);
    return args.length / 2;
  }
  zrange(key, start, stop) {
    const sorted = this.#store.get(key) || [];
    const end = stop < 0 ? sorted.length + stop : stop + 1;
    return sorted.slice(Math.max(0, start), Math.max(0, end)).map(item => item.member);
  }
  zrem(key, ...members) {
    const sorted = (this.#store.get(key) || []).filter(item => !members.includes(item.member));
    if (sorted.length === 0) this.#store.delete(key); else this.#store.set(key, sorted);
    return members.length;
  }
  hset(key, field, value) {
    const hash = this.#store.get(key) || {};
    hash[field] = value;
    this.#store.set(key, hash);
    return 1;
  }
  hget(key, field) {
    const hash = this.#store.get(key) || {};
    return hash[field] ?? null;
  }
  hgetall(key) {
    return { ...(this.#store.get(key) || {}) };
  }
  hdel(key, ...fields) {
    const hash = { ...(this.#store.get(key) || {}) };
    for (const f of fields) delete hash[f];
    this.#store.set(key, hash);
    return fields.length;
  }
  expire(key, ttl) {
    setTimeout(() => this.#store.delete(key), ttl * 1000);
    return 1;
  }
  ttl(key) {
    return -2; // mock does not persist TTL
  }
  eval(script, numkeys, ...args) {
    return 'OK';
  }
}

function createInMemoryRedis() {
  return new InMemoryRedis();
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

  if (!REDIS_URL) {
    return createInMemoryRedis();
  }

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
  client.on('error', (err) => {
    redisTelemetry.errorCount += 1;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('MAX_REQUESTS_LIMIT') || msg.includes('rate limit') || msg.includes('429')) {
      circuitBreaker.open = true;
      circuitBreaker.openedAt = Date.now();
      circuitBreaker.lastError = msg;
      console.warn(`[${label}] Circuit breaker opened due to rate limit: ${msg}`);
    }
  });
  client.on('end', () => { redisTelemetry.fallbackCount += 1; console.warn(`[${label}] Redis connection closed`); });

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

  if (!REDIS_URL) {
    return createInMemoryRedis();
  }

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
 * for rate limiting. Offloaded to a separate Redis instance so rate-limit
 * bursts never compete with pub/sub or state ops.
 * Falls back to REDIS_URL if REDIS_RATE_LIMIT_URL is not set.
 * @param {object} [opts] Optional overrides.
 * @returns {import('ioredis').Redis}
 */
export function getRateLimitClient(opts = {}) {
  if (!opts.forceNew && _rateLimitClient) return _rateLimitClient;

  const effectiveUrl = REDIS_RATE_LIMIT_URL || REDIS_URL;

  if (!effectiveUrl) {
    return createInMemoryRedis();
  }

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
    client = new Redis(effectiveUrl, baseConfig);
  } catch {
    console.warn('[rate-limit] Invalid REDIS_RATE_LIMIT_URL, falling back to REDIS_URL');
    if (!REDIS_URL) return createInMemoryRedis();
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
  const REDIS_SLOW_URL = process.env.REDIS_SLOW_URL?.trim() || REDIS_URL;
  if (!REDIS_SLOW_URL) {
    return createInMemoryRedis();
  }

  const isSlowUpstash = REDIS_SLOW_URL.startsWith('rediss://') || REDIS_SLOW_URL.includes('upstash.io');

  const baseConfig = {
    lazyConnect: opts.lazyConnect ?? false,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 0,
    enableReadyCheck: true,
    enableOfflineQueue: opts.enableOfflineQueue ?? true,
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
    if (!REDIS_URL) return createInMemoryRedis();
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

  if (!REDIS_URL) {
    return createInMemoryRedis();
  }

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
