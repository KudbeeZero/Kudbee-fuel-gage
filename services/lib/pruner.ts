import { getRedisClient } from './redis.js';
import { agentLog } from './agentLogger.js';

const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StaleJob {
  id: string;
  createdAt: string;
}

function isStale(iso: string): boolean {
  return new Date(iso).getTime() < Date.now() - STALE_TTL_MS;
}

async function pruneRedisList(redisKey: string, label: string): Promise<number> {
  let removed = 0;
  try {
    const redis = getRedisClient({ label: 'pruner' });
    const len = await redis.llen(redisKey);
    if (len === 0) return 0;

    const all = await redis.lrange(redisKey, 0, -1);
    const survivors: string[] = [];

    for (const raw of all) {
      try {
        const parsed = JSON.parse(raw) as StaleJob;
        if (parsed.createdAt && isStale(parsed.createdAt)) {
          removed++;
        } else {
          survivors.push(raw);
        }
      } catch {
        survivors.push(raw);
      }
    }

    if (removed > 0) {
      await redis.del(redisKey);
      for (const s of survivors) {
        await redis.lpush(redisKey, s);
      }
    }
  } catch {
    /* best-effort */
  }

  if (removed > 0) {
    agentLog('pruner', 'stale-purge', 'INFO', { key: redisKey, removed }, `${label}: purged ${removed} stale entries`);
  }
  return removed;
}

export async function runSystemPruner(): Promise<{
  governanceTasks: number;
  governanceDlq: number;
  slowJobs: number;
}> {
  let governanceTasks = 0;
  let governanceDlq = 0;
  let slowJobs = 0;

  try {
    governanceTasks = await pruneRedisList('kudbee-governance-tasks', 'governance-tasks');
  } catch { /* best-effort */ }

  try {
    governanceDlq = await pruneRedisList('kudbee-governance-tasks-failed', 'governance-dlq');
  } catch { /* best-effort */ }

  try {
    const redis = getRedisClient({ label: 'pruner' });
    const keys = await redis.keys('kudbee:jobs:*:dead');
    for (const key of keys) {
      slowJobs += await pruneRedisList(key, key);
    }
  } catch { /* best-effort */ }

  return { governanceTasks, governanceDlq, slowJobs };
}
