import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  process.loadEnvFile('.env');
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const CACHE_KEYS = ['agent-state', 'dashboard', 'decisions-recent'];

function getRedisClient() {
  try {
    const { getRedisClient } = require('../services/lib/redis.js');
    return getRedisClient({ label: 'bus-to-cache' });
  } catch {
    return null;
  }
}

function flushCache(redis, keys) {
  const targets = keys || CACHE_KEYS;
  if (!redis) {
    console.log(`[bus-to-cache] No Redis client — skipping cache flush for ${targets.join(', ')}`);
    return { flushed: targets, status: 'no-redis' };
  }

  const results = [];
  for (const key of targets) {
    try {
      redis.del(`kudbee:cache:${key}`).catch((e) => {
        console.warn(`[bus-to-cache] Failed to delete key ${key}: ${e.message}`);
      });
      results.push({ key, flushed: true });
    } catch (e) {
      results.push({ key, flushed: false, error: e.message });
    }
  }
  return { flushed: targets, results, status: 'ok' };
}

function subscribeToInterrupts(redis) {
  if (!redis) return null;

  const pattern = 'kudbee:agent:interrupt:*';
  try {
    redis.psubscribe(pattern, (err) => {
      if (err) {
        console.warn(`[bus-to-cache] PSUBSCRIBE error: ${err.message}`);
        return;
      }
      console.log(`[bus-to-cache] Listening for interrupts on pattern: ${pattern}`);
    });

    redis.on('pmessage', (_pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        console.log(`[bus-to-cache] INTERRUPT received: ${channel} → ${data.type} priority=${data.priority}`);
        flushCache(redis, CACHE_KEYS);
        publishSystemInterrupt(redis, data);
      } catch (e) {
        console.warn(`[bus-to-cache] Failed to process interrupt: ${e.message}`);
      }
    });

    return redis;
  } catch (e) {
    console.warn(`[bus-to-cache] PSUBSCRIBE failed: ${e.message}`);
    return null;
  }
}

function publishSystemInterrupt(redis, data) {
  if (!redis) return;
  try {
    redis
      .publish(
        'kudbee:events',
        JSON.stringify({
          event: 'system:interrupt',
          payload: {
            target: data.target,
            callerId: data.callerId,
            priority: data.priority,
            timestamp: new Date().toISOString(),
            cachesFlushed: CACHE_KEYS,
          },
        })
      )
      .catch(() => {});
  } catch {}
}

function main() {
  const args = process.argv.slice(2);
  const redis = getRedisClient();

  if (args.includes('--flush')) {
    const keys = args.filter((a) => a !== '--flush');
    const result = flushCache(redis, keys.length > 0 ? keys : undefined);
    console.log(JSON.stringify(result, null, 2));
    if (!redis) setTimeout(() => process.exit(0), 100);
    else redis.quit().then(() => process.exit(0));
    return;
  }

  if (args.includes('--listen')) {
    const sub = subscribeToInterrupts(redis);
    if (!sub) {
      console.error('[bus-to-cache] Failed to subscribe — no Redis available');
      process.exit(1);
    }
    console.log('[bus-to-cache] BUS→CACHE bridge active — monitoring for system:interrupt events');
    process.on('SIGINT', () => {
      console.log('\n[bus-to-cache] Shutting down...');
      sub.punsubscribe().catch(() => {});
      sub.quit().catch(() => {});
      process.exit(0);
    });
    return;
  }

  console.log('[bus-to-cache] Usage:');
  console.log('  --flush [keys...]  Flush cache keys (default: agent-state, dashboard, decisions-recent)');
  console.log('  --listen           Start interrupt listener (BUS→CACHE bridge)');
  redis?.quit().catch(() => {});
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { flushCache, subscribeToInterrupts, publishSystemInterrupt, CACHE_KEYS };

