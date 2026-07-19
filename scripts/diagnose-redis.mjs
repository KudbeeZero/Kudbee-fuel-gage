import { buildRedisUri, getRedisConfigFromEnv } from './lib/redis-uri.mjs';
import Redis from 'ioredis';

function maskUri(uri) {
  try {
    const u = new URL(uri);
    if (u.password) {
      u.password = '****';
    }
    return u.toString();
  } catch {
    return uri;
  }
}

async function diagnose() {
  console.log('[Diagnose] Starting Redis connectivity audit...\n');

  const config = getRedisConfigFromEnv();
  const uri = buildRedisUri(config);

  console.log('[Diagnose] Environment configuration:');
  console.log(`  REDIS_URL:     ${config.url || '(not set)'}`);
  console.log(`  REDIS_HOST:    ${config.host || '(not set)'}`);
  console.log(`  REDIS_PORT:    ${config.port || '(not set)'}`);
  console.log(`  REDIS_PASSWORD:${config.password ? '(set)' : '(not set)'}`);
  console.log(`  REDIS_TOKEN:   ${config.token ? '(set)' : '(not set)'}`);
  console.log(`  REDIS_DB:      ${config.db || '(not set)'}`);
  console.log(`  REDIS_TLS:     ${config.tls || '(not set)'}`);
  console.log(`\n[Diagnose] Constructed URI: ${maskUri(uri)}`);

  if (!uri || uri.trim().length === 0) {
    console.error('[Diagnose] FATAL: No Redis URI could be constructed from environment variables.');
    console.error('[Diagnose] Please set REDIS_URL, or provide REDIS_HOST + REDIS_PORT (+ REDIS_PASSWORD/REDIS_TOKEN if required).');
    process.exit(1);
  }

  let redis;
  try {
    redis = new Redis(uri, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 2000)
    });
  } catch (err) {
    console.error(`[Diagnose] FATAL: Failed to create Redis client: ${err.message}`);
    process.exit(1);
  }

  redis.on('connect', () => console.log('[Diagnose] TCP connection established.'));
  redis.on('ready', () => console.log('[Diagnose] Redis handshake complete.'));
  redis.on('error', (err) => {
    const msg = err.message || String(err);
    if (msg.includes('auth') || msg.includes('password') || msg.includes('invalid password')) {
      console.error(`[Diagnose] AUTH FAILURE: ${msg}`);
    } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      console.error(`[Diagnose] CONNECTION FAILURE: ${msg}`);
    } else if (msg.includes('ETIMEDOUT')) {
      console.error(`[Diagnose] TIMEOUT: ${msg}`);
    } else {
      console.error(`[Diagnose] Redis error: ${msg}`);
    }
  });

  try {
    console.log('[Diagnose] Sending PING...');
    const pong = await redis.ping();
    console.log(`[Diagnose] PING response: ${pong}`);

    console.log('[Diagnose] Attempting GET on test key...');
    const testKey = 'kudbee:diagnostic:test';
    const setResult = await redis.set(testKey, Date.now().toString(), 'EX', 60);
    console.log(`[Diagnose] SET test key: ${setResult}`);

    const getResult = await redis.get(testKey);
    console.log(`[Diagnose] GET test key: ${getResult}`);

    await redis.del(testKey);
    console.log('[Diagnose] Cleaned up test key.');

    console.log('\n[Diagnose] SUCCESS: Redis is fully operational.');
    process.exit(0);
  } catch (err) {
    console.error(`[Diagnose] OPERATION FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    try {
      await redis.quit();
    } catch {}
  }
}

diagnose();
