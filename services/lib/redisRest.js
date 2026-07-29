/**
 * services/lib/redisRest.js
 * ---------------------------------------------------------------------------
 * REST-based Upstash Redis client — zero TCP dependency.
 *
 * When the Upstash free tier TCP endpoint rejects blocking commands,
 * this module provides an HTTP-based fallback using the REST API.
 * Workers poll queues via LPOP/LPUSH instead of BRPOP/BLPOP.
 *
 * Uses native fetch — no external dependencies.
 * ---------------------------------------------------------------------------
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

let _restInitialized = false;
let _restFailed = false;

export function isRestAvailable() {
  if (_restFailed) return false;
  if (!REST_URL || !REST_TOKEN) return false;
  return true;
}

async function restCmd(command, ...args) {
  if (!isRestAvailable()) throw new Error('REST Redis unavailable');
  const parts = [command, ...args].filter(Boolean);
  const url = `${REST_URL.replace(/\/$/, '')}/${parts.join('/')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    if (res.status === 429 || res.status === 503) {
      throw new Error('REST_RATE_LIMITED');
    }
    throw new Error(`REST_HTTP_${res.status}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

// Queue operations (the critical ones workers need)

export async function lpop(key, count = 1) {
  try {
    const val = await restCmd('lpop', key);
    return val === null || val === 'null' ? null : val;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('REST_RATE_LIMITED')) throw err;
    console.warn(`[rest-redis] lpop ${key} failed: ${msg}`);
    return null;
  }
}

export async function lpush(key, value) {
  try {
    return await restCmd('lpush', key, value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[rest-redis] lpush ${key} failed: ${msg}`);
    return null;
  }
}

export async function rpush(key, value) {
  try {
    return await restCmd('rpush', key, value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[rest-redis] rpush ${key} failed: ${msg}`);
    return null;
  }
}

export async function llen(key) {
  try {
    return await restCmd('llen', key);
  } catch {
    return 0;
  }
}

export async function ping() {
  try {
    const result = await restCmd('ping');
    return result === 'PONG';
  } catch {
    _restFailed = true;
    return false;
  }
}

/**
 * REST-based queue poller.
 * Replaces BRPOP/BLPOP with LPOP-based polling.
 * Returns [queueName, value] tuple or null (matching ioredis BRPOP return).
 */
export async function restQueuePop(key, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await lpop(key);
    if (val !== null && val !== undefined) {
      return [key, val];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

export { restCmd, ping as restPing };
