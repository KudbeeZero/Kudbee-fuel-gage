import { teardownAll } from './db.js';
import { getRedisClient } from './redis.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

export function registerShutdown(label = 'worker', redisClient = null) {
  let registered = false;

  async function handleShutdown(signal) {
    if (registered) return;
    registered = true;
    const startTime = Date.now();

    const forceExitTimer = setTimeout(() => {
      console.error(JSON.stringify({ event: 'shutdown-force', label, reason: 'timeout', duration_ms: Date.now() - startTime }));
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    console.log(JSON.stringify({ event: 'shutdown-start', label, signal, pid: process.pid }));
    try {
      const redis = redisClient || getRedisClient({ label: 'shutdown' });
      await teardownAll(redis);
    } catch (err) {
      console.error(JSON.stringify({ event: 'shutdown-error', label, error: err instanceof Error ? err.message : String(err) }));
    }
    clearTimeout(forceExitTimer);
    console.log(JSON.stringify({ event: 'shutdown-complete', label, duration_ms: Date.now() - startTime }));
    process.exit(0);
  }

  process.once('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.once('SIGINT', () => void handleShutdown('SIGINT'));
}
