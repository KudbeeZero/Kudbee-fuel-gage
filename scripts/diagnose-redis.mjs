/**
 * scripts/diagnose-redis.mjs
 * ---------------------------------------------------------------------------
 * Diagnose Redis connectivity for both ioredis (TCP) and Upstash (REST).
 *
 * Behavior:
 *   - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, use
 *     @upstash/redis to PING the REST endpoint.
 *   - Otherwise fall back to ioredis using REDIS_URL.
 * ---------------------------------------------------------------------------
 */

import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function diagnoseUpstash() {
  console.log(`[Redis] Attempting to connect to Upstash REST at ${UPSTASH_URL}...`);
  const redis = new UpstashRedis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });

  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      console.log('[Redis] Connection: HEALTHY');
      console.log(`[Redis] PING response: ${pong}`);
      process.exit(0);
    }
    console.error(`[Redis] Unexpected PING response: ${pong}`);
    process.exit(1);
  } catch (err) {
    console.error(`[Redis] Connection: FAILED — ${err.message}`);
    process.exit(1);
  }
}

async function diagnoseIoredis() {
  console.log(`[Redis] Attempting to connect to ${REDIS_URL}...`);
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong === 'PONG') {
      console.log('[Redis] Connection: HEALTHY');
      console.log(`[Redis] PING response: ${pong}`);
      redis.disconnect();
      process.exit(0);
    }
    console.error(`[Redis] Unexpected PING response: ${pong}`);
    redis.disconnect();
    process.exit(1);
  } catch (err) {
    console.error(`[Redis] Connection: FAILED — ${err.message}`);
    try { redis.disconnect(); } catch { /* ignore */ }
    process.exit(1);
  }
}

async function main() {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    await diagnoseUpstash();
  } else {
    await diagnoseIoredis();
  }
}

main();
