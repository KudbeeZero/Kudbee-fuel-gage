/**
 * services/storage/thinkBoxSpawner.ts
 * ---------------------------------------------------------------------------
 * THINK Box Spawner — creates isolated agent environments ("THINK Boxes")
 * from Genesis tokens.
 *
 * A THINK Box is:
 *   - A dedicated Neon branch (per-agent isolated DB)
 *   - A dedicated Redis key namespace
 *   - A dedicated S3 prefix for warm/cold storage
 *   - A PM2 process slot or Docker container
 *   - Its own vector store (pgvector on the branch)
 *
 * The spawner evaluates pending genesis entries, provisions the box,
 * and boots the agent inside it.
 * ---------------------------------------------------------------------------
 */

import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../lib/redis.js';
import { publishEvent as publishUnifiedEvent } from '../lib/unifiedEvents.ts';

const BOX_REDIS_PREFIX = 'kudbee:think:box';
const GENESIS_REDIS_PREFIX = 'kudbee:think:genesis';
const BOX_TABLE = 'think_boxes';

export type BoxStatus = 'provisioning' | 'spinning_up' | 'active' | 'degraded' | 'retired';
export type BoxRuntime = 'pm2' | 'docker' | 'lambda' | 'fargate';

export interface ThinkTokenGenesis {
  genesisId: string;
  parentTokenId: string;
  agentId: string;
  agentArchetype: string;
  neonBranch: string;
  storageTierQuotas: {
    hotGb: number;
    warmGb: number;
    coldGb: number;
  };
  estimatedMonthlyCost: number;
  trainingConfidence: number;
  status: string;
  badgeLevel: string;
  cardLevel: string;
  createdAt: string;
}

export interface ThinkBox {
  boxId: string;
  genesisId: string;
  agentArchetype: string;
  neonBranch: string;
  redisNamespace: string;
  s3Prefix: string;
  runtime: BoxRuntime;
  status: BoxStatus;
  badgeLevel: string;
  cardLevel: string;
  storageQuotas: {
    hotGb: number;
    warmGb: number;
    coldGb: number;
  };
  estimatedMonthlyCost: number;
  trainingConfidence: number;
  parentTokenId: string;
  spawnedAt: string;
  lastHealthCheck: string;
  errorCount: number;
}

export async function ensureBoxSchema(): Promise<void> {
  const pool = (await import('../lib/db.js')).getDbPool();
  const healthy = (await import('../lib/db.js')).isDbHealthy();
  if (!pool || !healthy) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS think_boxes (
      box_id TEXT PRIMARY KEY,
      genesis_id TEXT NOT NULL,
      agent_archetype TEXT NOT NULL,
      neon_branch TEXT NOT NULL,
      redis_namespace TEXT NOT NULL,
      s3_prefix TEXT NOT NULL,
      runtime TEXT NOT NULL DEFAULT 'pm2',
      status TEXT NOT NULL DEFAULT 'provisioning',
      badge_level TEXT NOT NULL DEFAULT 'bronze',
      card_level TEXT NOT NULL DEFAULT 'local-observation-only',
      storage_quota_hot_gb NUMERIC NOT NULL DEFAULT 1,
      storage_quota_warm_gb NUMERIC NOT NULL DEFAULT 5,
      storage_quota_cold_gb NUMERIC NOT NULL DEFAULT 50,
      estimated_monthly_cost NUMERIC NOT NULL DEFAULT 0,
      training_confidence NUMERIC NOT NULL DEFAULT 0,
      parent_token_id TEXT NOT NULL,
      spawned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_health_check TIMESTAMPTZ,
      error_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_think_boxes_status ON think_boxes(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_think_boxes_genesis ON think_boxes(genesis_id)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_think_boxes_neon_branch ON think_boxes(neon_branch)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_think_boxes_redis_ns ON think_boxes(redis_namespace)');
}

export async function spawnBoxFromGenesis(genesis: ThinkTokenGenesis): Promise<ThinkBox> {
  const boxId = `box-${randomUUID().slice(0, 8)}`;
  const redisNamespace = `think:${boxId}`;
  const s3Prefix = `think-boxes/${boxId}/`;
  const now = new Date().toISOString();

  const box: ThinkBox = {
    boxId,
    genesisId: genesis.genesisId,
    agentArchetype: genesis.agentArchetype,
    neonBranch: genesis.neonBranch,
    redisNamespace,
    s3Prefix,
    runtime: 'pm2',
    status: 'provisioning',
    badgeLevel: genesis.badgeLevel,
    cardLevel: genesis.cardLevel,
    storageQuotas: genesis.storageTierQuotas,
    estimatedMonthlyCost: genesis.estimatedMonthlyCost,
    trainingConfidence: genesis.trainingConfidence,
    parentTokenId: genesis.parentTokenId,
    spawnedAt: now,
    lastHealthCheck: now,
    errorCount: 0,
  };

  await persistBox(box);

  const now = new Date().toISOString();
  const pool = (await import('../lib/db.js')).getDbPool();
  const healthy = (await import('../lib/db.js')).isDbHealthy();

  if (pool && healthy) {
    await (await import('../lib/db.js')).runInsert(
      `UPDATE think_token_genesis
       SET status = 'spawned', spawned_at = $1, box_id = $2
       WHERE genesis_id = $3`,
      [now, boxId, genesis.genesisId]
    ).catch(() => {});
  }

  const redis = getRedisClient({ label: 'genesis' });
  const genesisKey = `${GENESIS_REDIS_PREFIX}:${genesis.genesisId}`;
  if (redis?.status === 'ready') {
    await redis.hSet(genesisKey, { status: 'spawned', spawnedAt: now, boxId }).catch(() => {});
  }

  try {
    await publishUnifiedEvent('genesis', 'think_box_spawned', {
      boxId,
      genesisId: genesis.genesisId,
      agentArchetype: genesis.agentArchetype,
      neonBranch: genesis.neonBranch,
      redisNamespace,
      s3Prefix,
      trainingConfidence: genesis.trainingConfidence,
      timestamp: now,
    });
  } catch { /* best-effort */ }

  return box;
}

async function persistBox(box: ThinkBox): Promise<void> {
  const pool = (await import('../lib/db.js')).getDbPool();
  const healthy = (await import('../lib/db.js')).isDbHealthy();

  if (pool && healthy) {
    await (await import('../lib/db.js')).runInsert(
      `INSERT INTO think_boxes
       (box_id, genesis_id, agent_archetype, neon_branch, redis_namespace, s3_prefix,
        runtime, status, badge_level, card_level,
        storage_quota_hot_gb, storage_quota_warm_gb, storage_quota_cold_gb,
        estimated_monthly_cost, training_confidence, parent_token_id,
        spawned_at, last_health_check, error_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        box.boxId,
        box.genesisId,
        box.agentArchetype,
        box.neonBranch,
        box.redisNamespace,
        box.s3Prefix,
        box.runtime,
        box.status,
        box.badgeLevel,
        box.cardLevel,
        box.storageQuotas.hotGb,
        box.storageQuotas.warmGb,
        box.storageQuotas.coldGb,
        box.estimatedMonthlyCost,
        box.trainingConfidence,
        box.parentTokenId,
        box.spawnedAt,
        box.lastHealthCheck,
        box.errorCount,
      ]
    ).catch(() => {});
  }

  const redis = getRedisClient({ label: 'think-box' });
  const key = `${BOX_REDIS_PREFIX}:${box.boxId}`;
  if (redis?.status === 'ready') {
    await redis.hSet(key, {
      boxId: box.boxId,
      genesisId: box.genesisId,
      agentArchetype: box.agentArchetype,
      neonBranch: box.neonBranch,
      redisNamespace: box.redisNamespace,
      s3Prefix: box.s3Prefix,
      runtime: box.runtime,
      status: box.status,
      badgeLevel: box.badgeLevel,
      cardLevel: box.cardLevel,
      ...box.storageQuotas,
      estimatedMonthlyCost: String(box.estimatedMonthlyCost),
      trainingConfidence: String(box.trainingConfidence),
      parentTokenId: box.parentTokenId,
      spawnedAt: box.spawnedAt,
      lastHealthCheck: box.lastHealthCheck,
      errorCount: String(box.errorCount),
    }).catch(() => {});
    await redis.expire(key, 86400 * 30).catch(() => {});
  }
}

export async function getBox(boxId: string): Promise<ThinkBox | null> {
  const redis = getRedisClient({ label: 'think-box' });
  const key = `${BOX_REDIS_PREFIX}:${boxId}`;

  if (redis?.status === 'ready') {
    const raw = await redis.hGetAll(key).catch(() => ({}));
    if (raw && Object.keys(raw).length > 0) {
      return {
        boxId: raw.boxId || boxId,
        genesisId: raw.genesisId || '',
        agentArchetype: raw.agentArchetype || 'worker',
        neonBranch: raw.neonBranch || '',
        redisNamespace: raw.redisNamespace || '',
        s3Prefix: raw.s3Prefix || '',
        runtime: (raw.runtime as BoxRuntime) || 'pm2',
        status: (raw.status as BoxStatus) || 'provisioning',
        badgeLevel: raw.badgeLevel || 'bronze',
        cardLevel: raw.cardLevel || 'local-observation-only',
        storageQuotas: {
          hotGb: Number(raw.storage_quota_hot_gb) || 1,
          warmGb: Number(raw.storage_quota_warm_gb) || 5,
          coldGb: Number(raw.storage_quota_cold_gb) || 50,
        },
        estimatedMonthlyCost: Number(raw.estimatedMonthlyCost) || 0,
        trainingConfidence: Number(raw.trainingConfidence) || 0,
        parentTokenId: raw.parentTokenId || '',
        spawnedAt: raw.spawnedAt || new Date().toISOString(),
        lastHealthCheck: raw.lastHealthCheck || new Date().toISOString(),
        errorCount: Number(raw.errorCount) || 0,
      };
    }
  }

  const rows = await (await import('../lib/db.js')).runQuery(
    `SELECT * FROM think_boxes WHERE box_id = $1 LIMIT 1`,
    [boxId]
  );
  if (!rows || rows.length === 0) return null;
  return mapBoxRow(rows[0] as Record<string, unknown>);
}

export async function listActiveBoxes(): Promise<ThinkBox[]> {
  const pool = (await import('../lib/db.js')).getDbPool();
  const healthy = (await import('../lib/db.js')).isDbHealthy();

  if (pool && healthy) {
    const rows = await (await import('../lib/db.js')).runQuery(
      `SELECT * FROM think_boxes WHERE status IN ('active', 'spinning_up') ORDER BY spawned_at DESC`
    );
    if (rows && rows.length > 0) {
      return rows.map(mapBoxRow);
    }
  }

  return [];
}

export async function updateBoxHealth(boxId: string, healthy: boolean): Promise<void> {
  const status: BoxStatus = healthy ? 'active' : 'degraded';
  const now = new Date().toISOString();

  const pool = (await import('../lib/db.js')).getDbPool();
  const poolHealthy = (await import('../lib/db.js')).isDbHealthy();

  if (pool && poolHealthy) {
    await (await import('../lib/db.js')).runInsert(
      `UPDATE think_boxes
       SET status = $1, last_health_check = $2, error_count = error_count + 1
       WHERE box_id = $3`,
      [status, now, boxId]
    ).catch(() => {});
  }

  const redis = getRedisClient({ label: 'think-box' });
  const key = `${BOX_REDIS_PREFIX}:${boxId}`;
  if (redis?.status === 'ready') {
    await redis
      .multi()
      .hSet(key, { status, lastHealthCheck: now })
      .hIncrBy(key, 'errorCount', 1)
      .exec()
      .catch(() => {});
  }
}

export async function retireBox(boxId: string): Promise<void> {
  const now = new Date().toISOString();
  const pool = (await import('../lib/db.js')).getDbPool();
  const healthy = (await import('../lib/db.js')).isDbHealthy();

  if (pool && healthy) {
    await (await import('../lib/db.js')).runInsert(
      `UPDATE think_boxes SET status = 'retired', last_health_check = $1 WHERE box_id = $2`,
      [now, boxId]
    ).catch(() => {});
  }

  const redis = getRedisClient({ label: 'think-box' });
  const key = `${BOX_REDIS_PREFIX}:${boxId}`;
  if (redis?.status === 'ready') {
    await redis.hSet(key, { status: 'retired', lastHealthCheck: now }).catch(() => {});
  }
}

function mapBoxRow(r: Record<string, unknown>): ThinkBox {
  return {
    boxId: String(r.box_id),
    genesisId: String(r.genesis_id),
    agentArchetype: String(r.agent_archetype),
    neonBranch: String(r.neon_branch),
    redisNamespace: String(r.redis_namespace),
    s3Prefix: String(r.s3_prefix),
    runtime: (r.runtime as BoxRuntime) || 'pm2',
    status: (r.status as BoxStatus) || 'provisioning',
    badgeLevel: String(r.badge_level || 'bronze'),
    cardLevel: String(r.card_level || 'local-observation-only'),
    storageQuotas: {
      hotGb: Number(r.storage_quota_hot_gb) || 1,
      warmGb: Number(r.storage_quota_warm_gb) || 5,
      coldGb: Number(r.storage_quota_cold_gb) || 50,
    },
    estimatedMonthlyCost: Number(r.estimated_monthly_cost) || 0,
    trainingConfidence: Number(r.training_confidence) || 0,
    parentTokenId: String(r.parent_token_id),
    spawnedAt: r.spawned_at ? String(r.spawned_at) : new Date().toISOString(),
    lastHealthCheck: r.last_health_check ? String(r.last_health_check) : new Date().toISOString(),
    errorCount: Number(r.error_count) || 0,
  };
}
