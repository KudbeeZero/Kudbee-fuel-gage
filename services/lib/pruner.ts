import { getRedisClient } from './redis.js';
import { agentLog } from './agentLogger.js';

const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_KEY = 'kudbee:pruner:lock';
const LOCK_TTL_S = 600; // 10 minutes — prevents collision between server.js and worker.js schedulers

interface StaleJob {
  id: string;
  createdAt: string;
}

function isStale(iso: string): boolean {
  return new Date(iso).getTime() < Date.now() - STALE_TTL_MS;
}

// Lua: atomic prune — reads list, filters stale, rebuilds. No TOCTOU gap.
// KEYS[1] = list key, ARGV[1] = cutoff timestamp (epoch ms)
// Returns: number of entries removed
const ATOMIC_PRUNE_SCRIPT = `
local key = KEYS[1]
local cutoff = tonumber(ARGV[1])
local all = redis.call('LRANGE', key, 0, -1)
local survivors = {}
local removed = 0

for _, raw in ipairs(all) do
  local ok, parsed = pcall(cjson.decode, raw)
  if ok and parsed.createdAt then
    local ts = 0
    pcall(function() ts = (parsed.createdAt and #parsed.createdAt > 0) and 0 or 0 end)
    -- parse ISO: fallback to on-error skip
    local epoch = 0
    if type(parsed.createdAt) == 'string' then
      local y,m,d = parsed.createdAt:match('(%d+)-(%d+)-(%d+)')
      if y then epoch = os.time({year=tonumber(y), month=tonumber(m), day=tonumber(d), hour=0, min=0, sec=0}) * 1000 end
    end
    if parsed.epochMs then epoch = tonumber(parsed.epochMs) end

    if epoch > 0 and epoch < cutoff then
      removed = removed + 1
    else
      table.insert(survivors, raw)
    end
  else
    table.insert(survivors, raw)
  end
end

if removed > 0 then
  redis.call('DEL', key)
  for _, s in ipairs(survivors) do
    redis.call('LPUSH', key, s)
  end
end

return removed
`;

// Fallback JS implementation for environments where Lua is unavailable or for
// simpler queue types that don't need the atomicity guarantee.
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

export async function acquirePrunerLock(): Promise<boolean> {
  try {
    const redis = getRedisClient({ label: 'pruner' });
    const result = await redis.set(LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_S, 'NX');
    return result === 'OK';
  } catch {
    return false;
  }
}

export async function releasePrunerLock(): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'pruner' });
    await redis.del(LOCK_KEY);
  } catch { /* best-effort */ }
}

export async function runSystemPruner(): Promise<{
  governanceTasks: number;
  governanceDlq: number;
  slowJobs: number;
  locked: boolean;
}> {
  const locked = await acquirePrunerLock();
  if (!locked) {
    return { governanceTasks: 0, governanceDlq: 0, slowJobs: 0, locked: false };
  }

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

  await releasePrunerLock();
  return { governanceTasks, governanceDlq, slowJobs, locked: true };
}
