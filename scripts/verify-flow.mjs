import Redis from 'ioredis';

let redis;
try {
  redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
  redis.on('connect', () => console.log('[Verify] Redis connected'));
  redis.on('ready', () => console.log('[Verify] Redis ready'));
  redis.on('error', (err) => console.warn('[Verify] Redis error:', err.message));
  redis.on('reconnecting', (delay) =>
    console.warn(`[Verify] Redis reconnecting in ${delay ?? '?'}ms`)
  );
  redis.on('end', () => console.warn('[Verify] Redis connection closed'));
} catch (err) {
  console.error('[Verify] Failed to initialize Redis client:', err.message);
  redis = null;
}

async function liveCheck() {
  try {
    const queueLen = await redis.llen('kudbee:telemetry_feed');
    const governanceCount = await redis.zcard('kudbee:governance_actions');
    const communityValue = await redis.get('kudbee:community_value_score');

    console.log('\n=== Pipeline Live Check ===');
    console.log(`kudbee:telemetry_feed length:     ${queueLen}`);
    console.log(`kudbee:governance_actions count:  ${governanceCount}`);
    console.log(`kudbee:community_value_score:     ${communityValue ?? '0'}`);

    if (queueLen === 0 && governanceCount === 0) {
      console.warn('\n[WARN] Pipeline might not be initialized yet — all counts are zero.');
    } else {
      console.log('\n[OK] Pipeline is active and moving data.');
    }

    await redis.quit();
    process.exit(0);
  } catch (err) {
    console.error('[Verify] Live check failed:', err.message);
    process.exit(1);
  }
}

liveCheck();
