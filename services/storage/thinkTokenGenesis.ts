/**
 * services/storage/thinkTokenGenesis.ts
 * ---------------------------------------------------------------------------
 * THINK Token Genesis — extends vetted THINK tokens with agent-spawn metadata.
 *
 * When a THINK token reaches VERIFIED status and meets the genesis threshold,
 * this module enriches it with:
 *   - Spawnable agent template (which agent archetype to instantiate)
 *   - Neon branch allocation plan
 *   - Storage tier quotas (hot/warm/cold)
 *   - Estimated compute cost
 *   - Training confidence score
 *
 * Genesis tokens become the "seeds" for THINK Boxes — each one can spawn
 * an isolated agent environment that carries the token's knowledge forward.
 * ---------------------------------------------------------------------------
 */

import { randomUUID } from 'node:crypto';
import { getDbPool, isDbHealthy, runInsert, runQuery } from '../lib/db.js';
import { getRedisClient } from '../lib/redis.js';
import { publishEvent as publishUnifiedEvent } from '../lib/unifiedEvents.ts';
import { getLedgerEntry, type AgentLedgerEntry } from './agentLedger.js';

const GENESIS_REDIS_PREFIX = 'kudbee:think:genesis';
const GENESIS_TABLE = 'think_token_genesis';

export type AgentArchetype =
  | 'worker'
  | 'researcher'
  | 'validator'
  | 'orchestrator'
  | 'monitor'
  | 'governor'
  | 'curator'
  | 'specialist';

export interface GenesisMetadata {
  agentArchetype: AgentArchetype;
  neonBranch: string;
  storageTierQuotas: {
    hotGb: number;
    warmGb: number;
    coldGb: number;
  };
  estimatedMonthlyCost: number;
  trainingConfidence: number;
  parentTokenId: string;
  badgeLevel: string;
  cardLevel: string;
}

export interface ThinkTokenGenesis {
  genesisId: string;
  parentTokenId: string;
  agentId: string;
  agentArchetype: AgentArchetype;
  neonBranch: string;
  storageTierQuotas: {
    hotGb: number;
    warmGb: number;
    coldGb: number;
  };
  estimatedMonthlyCost: number;
  trainingConfidence: number;
  status: 'pending' | 'spawned' | 'active' | 'retired';
  badgeLevel: string;
  cardLevel: string;
  createdAt: string;
  spawnedAt?: string;
  boxId?: string;
}

const ARCHETYPE_COSTS: Record<AgentArchetype, number> = {
  worker: 5,
  researcher: 12,
  validator: 8,
  orchestrator: 15,
  monitor: 3,
  governor: 10,
  curator: 7,
  specialist: 20,
};

function inferArchetype(token: {
  correctionDelta: string;
  taskContext: Record<string, unknown>;
  failedState: Record<string, unknown>;
}): AgentArchetype {
  const text = `${token.correctionDelta} ${JSON.stringify(token.taskContext)} ${JSON.stringify(token.failedState)}`.toLowerCase();

  if (/orchestrat|coordinate|delegate|schedule/.test(text)) return 'orchestrator';
  if (/research|search|find|discover/.test(text)) return 'researcher';
  if (/valid|check|verify|audit/.test(text)) return 'validator';
  if (/monitor|watch|observe|health/.test(text)) return 'monitor';
  if (/govern|approve|reject|policy/.test(text)) return 'governor';
  if (/curat|organize|categorize|index/.test(text)) return 'curator';
  if (/special|domain|expert|custom/.test(text)) return 'specialist';
  return 'worker';
}

export async function ensureGenesisSchema(): Promise<void> {
  const pool = getDbPool();
  const healthy = isDbHealthy();
  if (!pool || !healthy) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS think_token_genesis (
      genesis_id TEXT PRIMARY KEY,
      parent_token_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_archetype TEXT NOT NULL,
      neon_branch TEXT NOT NULL,
      storage_quota_hot_gb NUMERIC NOT NULL DEFAULT 1,
      storage_quota_warm_gb NUMERIC NOT NULL DEFAULT 5,
      storage_quota_cold_gb NUMERIC NOT NULL DEFAULT 50,
      estimated_monthly_cost NUMERIC NOT NULL DEFAULT 0,
      training_confidence NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      badge_level TEXT NOT NULL DEFAULT 'bronze',
      card_level TEXT NOT NULL DEFAULT 'local-observation-only',
      box_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      spawned_at TIMESTAMPTZ
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_genesis_status ON think_token_genesis(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_genesis_agent ON think_token_genesis(agent_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_genesis_parent ON think_token_genesis(parent_token_id)');
}

export async function evaluateGenesisEligibility(tokenId: string): Promise<{
  eligible: boolean;
  reason?: string;
  metadata?: GenesisMetadata;
}> {
  const pool = getDbPool();
  const healthy = isDbHealthy();

  if (!pool || !healthy) {
    return { eligible: false, reason: 'database_unavailable' };
  }

  const rows = await runQuery(
    `SELECT id, original_trace_id, task_context, failed_state, correction_delta,
            status, kd, efficacy, token_cost, created_at
     FROM think_tokens
     WHERE id = $1`,
    [tokenId]
  );

  if (!rows || rows.length === 0) {
    return { eligible: false, reason: 'token_not_found' };
  }

  const token = rows[0] as Record<string, unknown>;

  if (token.status !== 'VERIFIED' && token.status !== 'PROVEN') {
    return { eligible: false, reason: `token_status_${token.status}` };
  }

  const kd = Number(token.kd) || 0;
  const efficacy = Number(token.efficacy) || 0;
  const confidence = Math.min(1, efficacy * (1 - kd));

  if (confidence < 0.6) {
    return { eligible: false, reason: `low_confidence_${confidence.toFixed(2)}` };
  }

  const taskContext = typeof token.task_context === 'string'
    ? JSON.parse(token.task_context)
    : (token.task_context as Record<string, unknown> || {});
  const failedState = typeof token.failed_state === 'string'
    ? JSON.parse(token.failed_state)
    : (token.failed_state as Record<string, unknown> || {});

  const agentId = String(token.original_trace_id || 'unknown').split('-')[0] || 'system';
  const ledgerEntry = await getLedgerEntry(agentId);
  const cardLevel = ledgerEntry?.cardLevel || 'local-observation-only';
  const badgeLevel = ledgerEntry?.badgeLevel || 'bronze';
  const archetype = inferArchetype({
    correctionDelta: String(token.correction_delta || ''),
    taskContext,
    failedState,
  });

  const neonBranch = ledgerEntry?.neonBranch || `agent-${agentId}`;
  const monthlyCost = ARCHETYPE_COSTS[archetype];

  return {
    eligible: true,
    metadata: {
      agentArchetype: archetype,
      neonBranch,
      storageTierQuotas: {
        hotGb: ledgerEntry?.storageQuotaHotGb || 1,
        warmGb: ledgerEntry?.storageQuotaWarmGb || 5,
        coldGb: ledgerEntry?.storageQuotaColdGb || 50,
      },
      estimatedMonthlyCost: monthlyCost,
      trainingConfidence: confidence,
      parentTokenId: tokenId,
      badgeLevel,
      cardLevel,
    },
  };
}

export async function mintGenesisEntry(metadata: GenesisMetadata): Promise<ThinkTokenGenesis> {
  const genesisId = `genesis-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const genesis: ThinkTokenGenesis = {
    genesisId,
    parentTokenId: metadata.parentTokenId,
    agentId: metadata.neonBranch.replace('agent-', ''),
    agentArchetype: metadata.agentArchetype,
    neonBranch: metadata.neonBranch,
    storageTierQuotas: metadata.storageTierQuotas,
    estimatedMonthlyCost: metadata.estimatedMonthlyCost,
    trainingConfidence: metadata.trainingConfidence,
    status: 'pending',
    badgeLevel: metadata.badgeLevel,
    cardLevel: metadata.cardLevel,
    createdAt: now,
  };

  const pool = getDbPool();
  const healthy = isDbHealthy();

  if (pool && healthy) {
    await runInsert(
      `INSERT INTO think_token_genesis
       (genesis_id, parent_token_id, agent_id, agent_archetype, neon_branch,
        storage_quota_hot_gb, storage_quota_warm_gb, storage_quota_cold_gb,
        estimated_monthly_cost, training_confidence, status, badge_level, card_level, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        genesisId,
        metadata.parentTokenId,
        genesis.agentId,
        metadata.agentArchetype,
        metadata.neonBranch,
        metadata.storageTierQuotas.hotGb,
        metadata.storageTierQuotas.warmGb,
        metadata.storageTierQuotas.coldGb,
        metadata.estimatedMonthlyCost,
        metadata.trainingConfidence,
        'pending',
        metadata.badgeLevel,
        metadata.cardLevel,
        now,
      ]
    ).catch(() => {});
  }

  const redis = getRedisClient({ label: 'genesis' });
  const key = `${GENESIS_REDIS_PREFIX}:${genesisId}`;
  if (redis?.status === 'ready') {
    await redis.hSet(key, {
      genesisId,
      parentTokenId: metadata.parentTokenId,
      agentId: genesis.agentId,
      agentArchetype: metadata.agentArchetype,
      neonBranch: metadata.neonBranch,
      ...metadata.storageTierQuotas,
      estimatedMonthlyCost: String(metadata.estimatedMonthlyCost),
      trainingConfidence: String(metadata.trainingConfidence),
      status: 'pending',
      badgeLevel: metadata.badgeLevel,
      cardLevel: metadata.cardLevel,
      createdAt: now,
    }).catch(() => {});
    await redis.expire(key, 86400 * 30).catch(() => {});
  }

  try {
    await publishUnifiedEvent('genesis', 'think_token_genesis_minted', {
      genesisId,
      parentTokenId: metadata.parentTokenId,
      agentArchetype: metadata.agentArchetype,
      trainingConfidence: metadata.trainingConfidence,
      estimatedMonthlyCost: metadata.estimatedMonthlyCost,
      timestamp: now,
    });
  } catch { /* best-effort */ }

  return genesis;
}

export async function markGenesisSpawned(genesisId: string, boxId: string): Promise<void> {
  const now = new Date().toISOString();

  const pool = getDbPool();
  const healthy = isDbHealthy();
  if (pool && healthy) {
    await runInsert(
      `UPDATE think_token_genesis
       SET status = 'spawned', spawned_at = $1, box_id = $2
       WHERE genesis_id = $3`,
      [now, boxId, genesisId]
    ).catch(() => {});
  }

  const redis = getRedisClient({ label: 'genesis' });
  const key = `${GENESIS_REDIS_PREFIX}:${genesisId}`;
  if (redis?.status === 'ready') {
    await redis.hSet(key, { status: 'spawned', spawnedAt: now, boxId }).catch(() => {});
  }
}

export async function getPendingGenesisEntries(limit = 50): Promise<ThinkTokenGenesis[]> {
  const pool = getDbPool();
  const healthy = isDbHealthy();

  if (pool && healthy) {
    const rows = await runQuery(
      `SELECT * FROM think_token_genesis
       WHERE status = 'pending'
       ORDER BY training_confidence DESC
       LIMIT $1`,
      [limit]
    );
    if (rows && rows.length > 0) {
      return rows.map((r: Record<string, unknown>) => mapGenesisRow(r));
    }
  }

  const redis = getRedisClient({ label: 'genesis' });
  if (redis?.status === 'ready') {
    const keys = await redis.keys(`${GENESIS_REDIS_PREFIX}:*`).catch(() => []);
    const entries: ThinkTokenGenesis[] = [];
    for (const key of keys.slice(0, limit)) {
      const raw = await redis.hGetAll(key).catch(() => ({}));
      if (raw && raw.status === 'pending') {
        entries.push({
          genesisId: raw.genesisId || key.split(':').pop() || '',
          parentTokenId: raw.parentTokenId || '',
          agentId: raw.agentId || '',
          agentArchetype: (raw.agentArchetype as ThinkTokenGenesis['agentArchetype']) || 'worker',
          neonBranch: raw.neonBranch || '',
          storageTierQuotas: {
            hotGb: Number(raw.storage_quota_hot_gb) || 1,
            warmGb: Number(raw.storage_quota_warm_gb) || 5,
            coldGb: Number(raw.storage_quota_cold_gb) || 50,
          },
          estimatedMonthlyCost: Number(raw.estimatedMonthlyCost) || 0,
          trainingConfidence: Number(raw.trainingConfidence) || 0,
          status: 'pending',
          badgeLevel: raw.badgeLevel || 'bronze',
          cardLevel: raw.cardLevel || 'local-observation-only',
          createdAt: raw.createdAt || new Date().toISOString(),
        });
      }
    }
    return entries.sort((a, b) => b.trainingConfidence - a.trainingConfidence).slice(0, limit);
  }

  return [];
}

function mapGenesisRow(r: Record<string, unknown>): ThinkTokenGenesis {
  return {
    genesisId: String(r.genesis_id),
    parentTokenId: String(r.parent_token_id),
    agentId: String(r.agent_id),
    agentArchetype: (r.agent_archetype as ThinkTokenGenesis['agentArchetype']) || 'worker',
    neonBranch: String(r.neon_branch),
    storageTierQuotas: {
      hotGb: Number(r.storage_quota_hot_gb) || 1,
      warmGb: Number(r.storage_quota_warm_gb) || 5,
      coldGb: Number(r.storage_quota_cold_gb) || 50,
    },
    estimatedMonthlyCost: Number(r.estimated_monthly_cost) || 0,
    trainingConfidence: Number(r.training_confidence) || 0,
    status: (r.status as ThinkTokenGenesis['status']) || 'pending',
    badgeLevel: String(r.badge_level || 'bronze'),
    cardLevel: String(r.card_level || 'local-observation-only'),
    createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
    spawnedAt: r.spawned_at ? String(r.spawned_at) : undefined,
    boxId: r.box_id ? String(r.box_id) : undefined,
  };
}
