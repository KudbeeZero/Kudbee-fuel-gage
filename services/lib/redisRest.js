/**
 * services/lib/redisRest.js
 * ---------------------------------------------------------------------------
 * REST-based Upstash Redis client — replacement for ioredis TCP connections.
 *
 * Upstash free-tier TCP kills long-lived blocking commands (BRPOP/BLPOP).
 * This module provides a drop-in HTTP facade for the queue operations workers
 * need. Uses native fetch — zero dependencies.
 *
 * The exported `getRestRedisClient` returns an object with the same method
 * signatures as ioredis for: brpop, lpush, rpush, llen, publish, ping.
 * Workers use this instead of creating ioredis TCP connections.
 * ---------------------------------------------------------------------------
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

let _restFailed = false;
let _restConsecutiveErrors = 0;

async function restCmd(command, ...args) {
  // Upstash's command-path API treats each URL segment as one Redis argument.
  // Encode values so JSON, spaces, slashes, and user-provided strings survive
  // the HTTP transport without changing command boundaries.
  const parts = [
    command,
    ...args.filter((arg) => arg !== undefined && arg !== null).map(String),
  ].map(encodeURIComponent);
  const url = `${REST_URL.replace(/\/$/, '')}/${parts.join('/')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    if (res.status === 429 || res.status === 503) {
      _restConsecutiveErrors++;
      throw new Error('REST_RATE_LIMITED');
    }
    throw new Error(`REST_HTTP_${res.status}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  _restConsecutiveErrors = 0;
  return json.result;
}

async function lpop(key, count = 1) {
  try {
    return await restCmd('lpop', key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('REST_RATE_LIMITED')) throw err;
    return null;
  }
}

async function lpush(key, value) {
  try {
    return await restCmd('lpush', key, value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('REST_RATE_LIMITED')) throw err;
    return null;
  }
}

async function rpush(key, value) {
  try {
    return await restCmd('rpush', key, value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('REST_RATE_LIMITED')) throw err;
    return null;
  }
}

async function llen(key) {
  try {
    return await restCmd('llen', key);
  } catch {
    return 0;
  }
}

async function ping() {
  try {
    return (await restCmd('ping')) === 'PONG' ? 'PONG' : null;
  } catch {
    _restFailed = true;
    return null;
  }
}

async function publish(channel, message) {
  try {
    return await restCmd('publish', channel, message);
  } catch {
    return 0;
  }
}

function on() {
  /* noop for ioredis compat */
}
function disconnect() {
  /* noop */
}

/**
 * Returns a REST-based Redis facade matching ioredis interface for
 * queue operations. Drop-in replacement for getBlockingRedisClient
 * and getWorkerRedisClient when TCP is unavailable.
 */
export function getRestRedisClient(label = 'rest-redis') {
  const isAvailable = REST_URL && REST_TOKEN && !_restFailed;
  if (!isAvailable) return null;

  return {
    label,
    // Blocking pop emulated via LPOP polling loop (mimics BRPOP return)
    brpop: async (key, timeoutMs = 5) => {
      const deadline = Date.now() + timeoutMs * 1000;
      while (Date.now() < deadline) {
        const val = await lpop(key);
        if (val !== null && val !== undefined && val !== 'null') {
          return [key, val];
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    },
    blpop: async (key, timeoutMs = 5) => {
      const deadline = Date.now() + timeoutMs * 1000;
      while (Date.now() < deadline) {
        const val = await lpop(key);
        if (val !== null && val !== undefined && val !== 'null') {
          return [key, val];
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    },
    lpop,
    lpush,
    rpush,
    llen,
    publish,
    ping,
    on,
    disconnect,
    isRestClient: true,
  };
}

export { lpop, rpush, llen, ping as restPing, restCmd };
export { REST_URL, REST_TOKEN }; // for direct access by polling loops
