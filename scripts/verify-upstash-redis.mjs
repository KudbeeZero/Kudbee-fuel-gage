/**
 * scripts/verify-upstash-redis.mjs
 * ---------------------------------------------------------------------------
 * Quick verification that Upstash Redis REST credentials are valid by
 * performing a PING through the @upstash/redis client.
 *
 * Exits 0 on success, 1 on failure.
 * ---------------------------------------------------------------------------
 */

import { Redis } from '@upstash/redis';

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!URL || !TOKEN) {
  console.error('[UpstashRedis] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.');
  process.exit(1);
}

async function verify() {
  const redis = new Redis({ url: URL, token: TOKEN });
  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      console.log('[UpstashRedis] PING succeeded — REST API credentials are valid.');
      process.exit(0);
    }
    console.error(`[UpstashRedis] Unexpected PING response: ${pong}`);
    process.exit(1);
  } catch (err) {
    console.error(`[UpstashRedis] Verification FAILED: ${err.message}`);
    process.exit(1);
  }
}

verify();
