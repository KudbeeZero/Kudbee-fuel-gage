import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function diagnose() {
  console.log(`[Redis] Attempting to connect to ${REDIS_URL}...`);
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong === 'PONG') {
      console.log('[Redis] Connection: HEALTHY');
      console.log(`[Redis] PING response: ${pong}`);
      redis.disconnect();
      process.exit(0);
    } else {
      console.error(`[Redis] Unexpected PING response: ${pong}`);
      redis.disconnect();
      process.exit(1);
    }
  } catch (err) {
    console.error(`[Redis] Connection: FAILED — ${err.message}`);
    try { redis.disconnect(); } catch { /* ignore */ }
    process.exit(1);
  }
}

diagnose();
