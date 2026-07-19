import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 2000)
});

redis.on('connect', () => console.log('[Verify] Redis connected'));
redis.on('error', (err) => console.error('[Verify] Redis error:', err.message));

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
