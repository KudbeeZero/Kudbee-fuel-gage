/**
 * services/lib/redisUpstash.js
 * ---------------------------------------------------------------------------
 * Upstash Redis HTTP/REST client singleton.
 *
 * Uses @upstash/redis (Redis.fromEnv()) which communicates over HTTPS
 * rather than TCP, making it safe for serverless/dyno environments where
 * connection limits are constrained.
 *
 * Env vars required:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Throws at initialization if env vars are missing so failures are loud
 * and immediate rather than silent runtime errors.
 * ---------------------------------------------------------------------------
 */

import { Redis } from '@upstash/redis';

let _client = null;

function validateEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      '[UpstashRedis] Missing required env vars: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.'
    );
  }

  if (!url.startsWith('https://')) {
    throw new Error(
      `[UpstashRedis] UPSTASH_REDIS_REST_URL must use https:// scheme, got: ${url}`
    );
  }
}

function createClient() {
  validateEnv();
  _client = Redis.fromEnv();
  return _client;
}

export function getUpstashRedis() {
  if (!_client) {
    return createClient();
  }
  return _client;
}

export function resetUpstashRedis() {
  _client = null;
}

export async function upstashHealthCheck() {
  const redis = getUpstashRedis();
  try {
    const pong = await redis.ping();
    return { healthy: pong === 'PONG', response: pong };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

export default getUpstashRedis;
