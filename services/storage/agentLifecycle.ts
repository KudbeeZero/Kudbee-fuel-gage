/**
 * services/storage/agentLifecycle.ts
 * ---------------------------------------------------------------------------
 * Agent Lifecycle Manager — boots, monitors, and retires spawned agents
 * inside their THINK Boxes.
 *
 * Lifecycle states:
 *   PENDING → SPAWNING → BOOTING → ACTIVE → DEGRADED → RETIRED
 *
 * The manager:
 *   1. Polls for pending genesis entries
 *   2. Spawns a THINK Box (Neon branch + Redis namespace + S3 prefix)
 *   3. Boots the agent process (PM2 slot or Docker container)
 *   4. Monitors health (heartbeat via Redis)
 *   5. Retires on failure or manual trigger
 * ---------------------------------------------------------------------------
 */

import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../lib/redis.js';
import { publishEvent as publishUnifiedEvent } from '../lib/unifiedEvents.ts';
import {
  getPendingGenesisEntries,
  type ThinkTokenGenesis,
} from './thinkTokenGenesis.js';
import {
  spawnBoxFromGenesis,
  getBox,
  updateBoxHealth,
  retireBox,
  type ThinkBox,
} from './thinkBoxSpawner.js';
import { recordTierWrite } from './agentInventory.js';

const LIFECYCLE_REDIS_PREFIX = 'kudbee:agent:lifecycle';
const LIFECYCLE_POLL_INTERVAL_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const MAX_ERRORS_BEFORE_RETIRE = 5;

export type AgentLifecycleState =
  | 'pending'
  | 'spawning'
  | 'booting'
  | 'active'
  | 'degraded'
  | 'retired'
  | 'failed';

export interface AgentLifecycleEntry {
  lifecycleId: string;
  genesisId: string;
  boxId: string;
  state: AgentLifecycleState;
  agentArchetype: string;
  neonBranch: string;
  redisNamespace: string;
  pm2ProcessName?: string;
  containerId?: string;
  errorCount: number;
  lastHeartbeat: string;
  createdAt: string;
  updatedAt: string;
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _healthTimer: ReturnType<typeof setInterval> | null = null;
let _running = false;

export function startLifecycleManager(): void {
  if (_running) return;
  _running = true;

  console.log('[Lifecycle] Starting Agent Lifecycle Manager...');

  _pollTimer = setInterval(async () => {
    try {
      await pollPendingGenesis();
    } catch (err) {
      console.warn('[Lifecycle] Poll error:', err instanceof Error ? err.message : String(err));
    }
  }, LIFECYCLE_POLL_INTERVAL_MS);

  _healthTimer = setInterval(async () => {
    try {
      await runHealthChecks();
    } catch (err) {
      console.warn('[Lifecycle] Health check error:', err instanceof Error ? err.message : String(err));
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  if (_pollTimer.unref) _pollTimer.unref();
  if (_healthTimer.unref) _healthTimer.unref();
}

export function stopLifecycleManager(): void {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
  _running = false;
  console.log('[Lifecycle] Stopped.');
}

async function pollPendingGenesis(): Promise<void> {
  const pending = await getPendingGenesisEntries(20);
  if (pending.length === 0) return;

  console.log(`[Lifecycle] Processing ${pending.length} pending genesis entries...`);

  for (const genesis of pending) {
    try {
      await processGenesisEntry(genesis);
    } catch (err) {
      console.warn(`[Lifecycle] Failed to process genesis ${genesis.genesisId}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function processGenesisEntry(genesis: ThinkTokenGenesis): Promise<void> {
  const lifecycleId = `lc-${genesis.genesisId}`;

  await recordLifecycleState(lifecycleId, {
    lifecycleId,
    genesisId: genesis.genesisId,
    boxId: '',
    state: 'spawning',
    agentArchetype: genesis.agentArchetype,
    neonBranch: genesis.neonBranch,
    redisNamespace: `think:box-${genesis.genesisId.slice(0, 8)}`,
    errorCount: 0,
    lastHeartbeat: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const box = await spawnBoxFromGenesis(genesis);
  console.log(`[Lifecycle] Spawned THINK Box: ${box.boxId} (${box.agentArchetype})`);

  await recordLifecycleState(lifecycleId, {
    lifecycleId,
    genesisId: genesis.genesisId,
    boxId: box.boxId,
    state: 'booting',
    agentArchetype: genesis.agentArchetype,
    neonBranch: genesis.neonBranch,
    redisNamespace: box.redisNamespace,
    errorCount: 0,
    lastHeartbeat: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await bootAgentInBox(box);

  await recordLifecycleState(lifecycleId, {
    lifecycleId,
    genesisId: genesis.genesisId,
    boxId: box.boxId,
    state: 'active',
    agentArchetype: genesis.agentArchetype,
    neonBranch: box.neonBranch,
    redisNamespace: box.redisNamespace,
    pm2ProcessName: `kudbee-${box.boxId}`,
    errorCount: 0,
    lastHeartbeat: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await recordTierWrite({
    agentId: box.boxId,
    tier: 'HOT',
    category: 'memory',
    bytes: 0,
    objectId: `box-creation-${box.boxId}`,
    neonBranch: box.neonBranch,
  });

  try {
    await publishUnifiedEvent('genesis', 'think_agent_booted', {
      lifecycleId,
      boxId: box.boxId,
      genesisId: genesis.genesisId,
      agentArchetype: genesis.agentArchetype,
      neonBranch: box.neonBranch,
      timestamp: new Date().toISOString(),
    });
  } catch { /* best-effort */ }
}

async function bootAgentInBox(box: ThinkBox): Promise<void> {
  console.log(`[Lifecycle] Booting agent in box ${box.boxId}...`);

  const redis = getRedisClient({ label: 'think-box' });
  const heartbeatKey = `${LIFECYCLE_REDIS_PREFIX}:heartbeat:${box.boxId}`;

  if (redis?.status === 'ready') {
    await redis
      .multi()
      .hSet(heartbeatKey, {
        boxId: box.boxId,
        lastSeen: new Date().toISOString(),
        status: 'booting',
      })
      .expire(heartbeatKey, 120)
      .exec()
      .catch(() => {});
  }
}

async function runHealthChecks(): Promise<void> {
  const boxes = await (await import('./thinkBoxSpawner.js')).listActiveBoxes();
  const redis = getRedisClient({ label: 'lifecycle' });

  for (const box of boxes) {
    const heartbeatKey = `${LIFECYCLE_REDIS_PREFIX}:heartbeat:${box.boxId}`;
    let healthy = false;

    if (redis?.status === 'ready') {
      const raw = await redis.hGetAll(heartbeatKey).catch(() => ({}));
      if (raw && raw.status === 'active') {
        const lastSeen = new Date(raw.lastSeen || 0).getTime();
        const ageMs = Date.now() - lastSeen;
        healthy = ageMs < HEALTH_CHECK_INTERVAL_MS * 2;
      }
    }

    if (!healthy && box.errorCount >= MAX_ERRORS_BEFORE_RETIRE) {
      console.warn(`[Lifecycle] Retiring box ${box.boxId} (too many errors)`);
      await retireBox(box.boxId);
      continue;
    }

    await updateBoxHealth(box.boxId, healthy);
  }
}

async function recordLifecycleState(entry: Partial<AgentLifecycleEntry>): Promise<void> {
  const redis = getRedisClient({ label: 'lifecycle' });
  const key = `${LIFECYCLE_REDIS_PREFIX}:${entry.lifecycleId}`;

  if (redis?.status === 'ready') {
    await redis.hSet(key, {
      lifecycleId: entry.lifecycleId,
      genesisId: entry.genesisId,
      boxId: entry.boxId || '',
      state: entry.state,
      agentArchetype: entry.agentArchetype,
      neonBranch: entry.neonBranch,
      redisNamespace: entry.redisNamespace,
      pm2ProcessName: entry.pm2ProcessName || '',
      containerId: entry.containerId || '',
      errorCount: String(entry.errorCount || 0),
      lastHeartbeat: entry.lastHeartbeat,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }).catch(() => {});
    await redis.expire(key, 86400 * 7).catch(() => {});
  }
}

export async function getLifecycleEntry(lifecycleId: string): Promise<AgentLifecycleEntry | null> {
  const redis = getRedisClient({ label: 'lifecycle' });
  const key = `${LIFECYCLE_REDIS_PREFIX}:${lifecycleId}`;

  if (redis?.status === 'ready') {
    const raw = await redis.hGetAll(key).catch(() => ({}));
    if (raw && Object.keys(raw).length > 0) {
      return {
        lifecycleId: raw.lifecycleId || lifecycleId,
        genesisId: raw.genesisId || '',
        boxId: raw.boxId || '',
        state: (raw.state as AgentLifecycleState) || 'pending',
        agentArchetype: raw.agentArchetype || '',
        neonBranch: raw.neonBranch || '',
        redisNamespace: raw.redisNamespace || '',
        pm2ProcessName: raw.pm2ProcessName || undefined,
        containerId: raw.containerId || undefined,
        errorCount: Number(raw.errorCount) || 0,
        lastHeartbeat: raw.lastHeartbeat || new Date().toISOString(),
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };
    }
  }

  return null;
}
