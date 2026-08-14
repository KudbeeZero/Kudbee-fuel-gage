/**
 * services/storage/agentLedger.ts
 * ---------------------------------------------------------------------------
 * Per-agent ledger: credentials, card levels, badge levels, write authority.
 *
 * Every agent registered in company-manifest.json gets a ledger entry that
 * tracks:
 *   - Ed25519 public key (from agents.json registry)
 *   - Card level (writeAuthority.level from manifest)
 *   - Badge level (derived from card level + status)
 *   - Allowed integrations
 *   - Approval boundary
 *   - Neon branch name
 *   - Storage tier quotas
 *   - Created / updated timestamps
 *
 * The ledger is the source of truth for "who can do what, where is their
 * data, and what does it cost." It lives in Redis for hot access and is
 * mirrored to the main Neon `agent_ledger` table for persistence.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from '../lib/redis.js';
import { runQuery, runInsert } from '../lib/db.js';

const LEDGER_REDIS_PREFIX = 'kudbee:agent:ledger';
const LEDGER_TABLE = 'agent_ledger';

export type CardLevel =
  | 'repository-verification-only'
  | 'orchestration-only'
  | 'internal-bus-only'
  | 'audit-record-only'
  | 'reviewed-memory-only'
  | 'metrics-observation-only'
  | 'local-observation-only'
  | 'diagnostic-only'
  | 'security-observation-only'
  | 'pending-approval-token-only';

export type BadgeLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'observer';

export interface AgentLedgerEntry {
  agentId: string;
  name: string;
  department: string;
  publicKey?: string;
  cardLevel: CardLevel;
  badgeLevel: BadgeLevel;
  allowedIntegrations: string[];
  approvalBoundary: {
    humanApprovalRequired: string[];
    autonomousBoundary: string;
  };
  neonBranch: string;
  memoryId: string;
  storageQuotaHotGb: number;
  storageQuotaWarmGb: number;
  storageQuotaColdGb: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'suspended' | 'provisioning';
}

const CARD_TO_BADGE: Record<CardLevel, BadgeLevel> = {
  'repository-verification-only': 'silver',
  'orchestration-only': 'gold',
  'internal-bus-only': 'silver',
  'audit-record-only': 'platinum',
  'reviewed-memory-only': 'gold',
  'metrics-observation-only': 'silver',
  'local-observation-only': 'bronze',
  'diagnostic-only': 'silver',
  'security-observation-only': 'gold',
  'pending-approval-token-only': 'bronze',
};

function badgeToTier(badge: BadgeLevel): { hot: number; warm: number; cold: number } {
  switch (badge) {
    case 'bronze':
      return { hot: 1, warm: 5, cold: 50 };
    case 'silver':
      return { hot: 5, warm: 20, cold: 200 };
    case 'gold':
      return { hot: 20, warm: 100, cold: 1000 };
    case 'platinum':
      return { hot: 100, warm: 500, cold: 5000 };
    case 'observer':
      return { hot: 0.5, warm: 2, cold: 20 };
  }
}

export function deriveBadgeLevel(cardLevel: CardLevel): BadgeLevel {
  return CARD_TO_BADGE[cardLevel] || 'bronze';
}

export async function ensureLedgerSchema(): Promise<void> {
  const pool = (await import('../lib/db.js')).getDbPool();
  const isHealthy = (await import('../lib/db.js')).isDbHealthy();
  if (!pool || !isHealthy) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_ledger (
      agent_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      public_key TEXT,
      card_level TEXT NOT NULL,
      badge_level TEXT NOT NULL,
      allowed_integrations JSONB NOT NULL DEFAULT '[]'::jsonb,
      approval_boundary JSONB NOT NULL DEFAULT '{}'::jsonb,
      neon_branch TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      storage_quota_hot_gb NUMERIC NOT NULL DEFAULT 1,
      storage_quota_warm_gb NUMERIC NOT NULL DEFAULT 5,
      storage_quota_cold_gb NUMERIC NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_ledger_status ON agent_ledger(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_ledger_card_level ON agent_ledger(card_level)');
}

export async function registerAgentFromManifest(agent: {
  id: string;
  name: string;
  department: string;
  memoryId: string;
  allowedIntegrations: string[];
  writeAuthority: { level: CardLevel; allowed: string[]; forbidden: string[] };
  approvalBoundary: { humanApprovalRequired: string[]; autonomousBoundary: string };
}): Promise<AgentLedgerEntry> {
  const cardLevel = agent.writeAuthority.level;
  const badgeLevel = deriveBadgeLevel(cardLevel);
  const tiers = badgeToTier(badgeLevel);
  const neonBranch = `agent-${agent.id}`;
  const now = new Date().toISOString();

  const entry: AgentLedgerEntry = {
    agentId: agent.id,
    name: agent.name,
    department: agent.department,
    cardLevel,
    badgeLevel,
    allowedIntegrations: agent.allowedIntegrations,
    approvalBoundary: agent.approvalBoundary,
    neonBranch,
    memoryId: agent.memoryId,
    storageQuotaHotGb: tiers.hot,
    storageQuotaWarmGb: tiers.warm,
    storageQuotaColdGb: tiers.cold,
    createdAt: now,
    updatedAt: now,
    status: 'provisioning',
  };

  await upsertLedgerEntry(entry);
  return entry;
}

export async function upsertLedgerEntry(entry: AgentLedgerEntry): Promise<void> {
  const redis = getRedisClient({ label: 'agent-ledger' });
  const key = `${LEDGER_REDIS_PREFIX}:${entry.agentId}`;

  if (redis?.status === 'ready') {
    await redis
      .multi()
      .hSet(key, {
        agentId: entry.agentId,
        name: entry.name,
        department: entry.department,
        publicKey: entry.publicKey || '',
        cardLevel: entry.cardLevel,
        badgeLevel: entry.badgeLevel,
        allowedIntegrations: JSON.stringify(entry.allowedIntegrations),
        approvalBoundary: JSON.stringify(entry.approvalBoundary),
        neonBranch: entry.neonBranch,
        memoryId: entry.memoryId,
        storageQuotaHotGb: String(entry.storageQuotaHotGb),
        storageQuotaWarmGb: String(entry.storageQuotaWarmGb),
        storageQuotaColdGb: String(entry.storageQuotaColdGb),
        status: entry.status,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })
      .expire(key, 86400)
      .exec()
      .catch(() => {});
  }

  const pool = (await import('../lib/db.js')).getDbPool();
  const isHealthy = (await import('../lib/db.js')).isDbHealthy();
  if (pool && isHealthy) {
    await runInsert(
      `INSERT INTO agent_ledger (agent_id, name, department, public_key, card_level, badge_level,
       allowed_integrations, approval_boundary, neon_branch, memory_id,
       storage_quota_hot_gb, storage_quota_warm_gb, storage_quota_cold_gb, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (agent_id) DO UPDATE SET
         name = EXCLUDED.name,
         card_level = EXCLUDED.card_level,
         badge_level = EXCLUDED.badge_level,
         allowed_integrations = EXCLUDED.allowed_integrations,
         approval_boundary = EXCLUDED.approval_boundary,
         neon_branch = EXCLUDED.neon_branch,
         storage_quota_hot_gb = EXCLUDED.storage_quota_hot_gb,
         storage_quota_warm_gb = EXCLUDED.storage_quota_warm_gb,
         storage_quota_cold_gb = EXCLUDED.storage_quota_cold_gb,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        entry.agentId,
        entry.name,
        entry.department,
        entry.publicKey || null,
        entry.cardLevel,
        entry.badgeLevel,
        JSON.stringify(entry.allowedIntegrations),
        JSON.stringify(entry.approvalBoundary),
        entry.neonBranch,
        entry.memoryId,
        entry.storageQuotaHotGb,
        entry.storageQuotaWarmGb,
        entry.storageQuotaColdGb,
        entry.status,
        entry.createdAt,
        entry.updatedAt,
      ]
    ).catch(() => {});
  }
}

export async function getLedgerEntry(agentId: string): Promise<AgentLedgerEntry | null> {
  const redis = getRedisClient({ label: 'agent-ledger' });
  const key = `${LEDGER_REDIS_PREFIX}:${agentId}`;

  if (redis?.status === 'ready') {
    const raw = await redis.hGetAll(key).catch(() => ({}));
    if (raw && Object.keys(raw).length > 0) {
      return {
        agentId: raw.agentId || agentId,
        name: raw.name || '',
        department: raw.department || '',
        publicKey: raw.publicKey || undefined,
        cardLevel: (raw.cardLevel as CardLevel) || 'local-observation-only',
        badgeLevel: (raw.badgeLevel as BadgeLevel) || 'bronze',
        allowedIntegrations: raw.allowedIntegrations ? JSON.parse(raw.allowedIntegrations) : [],
        approvalBoundary: raw.approvalBoundary ? JSON.parse(raw.approvalBoundary) : { humanApprovalRequired: [], autonomousBoundary: '' },
        neonBranch: raw.neonBranch || `agent-${agentId}`,
        memoryId: raw.memoryId || agentId,
        storageQuotaHotGb: Number(raw.storageQuotaHotGb) || 1,
        storageQuotaWarmGb: Number(raw.storageQuotaWarmGb) || 5,
        storageQuotaColdGb: Number(raw.storageQuotaColdGb) || 50,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        status: (raw.status as AgentLedgerEntry['status']) || 'active',
      };
    }
  }

  const rows = await runQuery(
    `SELECT * FROM agent_ledger WHERE agent_id = $1 LIMIT 1`,
    [agentId]
  );
  if (!rows || rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    agentId: String(r.agent_id),
    name: String(r.name || ''),
    department: String(r.department || ''),
    publicKey: r.public_key ? String(r.public_key) : undefined,
    cardLevel: (r.card_level as CardLevel) || 'local-observation-only',
    badgeLevel: (r.badge_level as BadgeLevel) || 'bronze',
    allowedIntegrations: r.allowed_integrations ? JSON.parse(String(r.allowed_integrations)) : [],
    approvalBoundary: r.approval_boundary ? JSON.parse(String(r.approval_boundary)) : { humanApprovalRequired: [], autonomousBoundary: '' },
    neonBranch: String(r.neon_branch || `agent-${agentId}`),
    memoryId: String(r.memory_id || agentId),
    storageQuotaHotGb: Number(r.storage_quota_hot_gb) || 1,
    storageQuotaWarmGb: Number(r.storage_quota_warm_gb) || 5,
    storageQuotaColdGb: Number(r.storage_quota_cold_gb) || 50,
    createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
    updatedAt: r.updated_at ? String(r.updated_at) : new Date().toISOString(),
    status: (r.status as AgentLedgerEntry['status']) || 'active',
  };
}

export async function listAllLedgerEntries(): Promise<AgentLedgerEntry[]> {
  const redis = getRedisClient({ label: 'agent-ledger' });
  if (redis?.status === 'ready') {
    const keys = await redis.keys(`${LEDGER_REDIS_PREFIX}:*`).catch(() => []);
    if (keys.length > 0) {
      const entries: AgentLedgerEntry[] = [];
      for (const key of keys) {
        const raw = await redis.hGetAll(key).catch(() => ({}));
        if (raw && Object.keys(raw).length > 0) {
          entries.push({
            agentId: raw.agentId || key.split(':').pop() || '',
            name: raw.name || '',
            department: raw.department || '',
            publicKey: raw.publicKey || undefined,
            cardLevel: (raw.cardLevel as CardLevel) || 'local-observation-only',
            badgeLevel: (raw.badgeLevel as BadgeLevel) || 'bronze',
            allowedIntegrations: raw.allowedIntegrations ? JSON.parse(raw.allowedIntegrations) : [],
            approvalBoundary: raw.approvalBoundary ? JSON.parse(raw.approvalBoundary) : { humanApprovalRequired: [], autonomousBoundary: '' },
            neonBranch: raw.neonBranch || '',
            memoryId: raw.memoryId || '',
            storageQuotaHotGb: Number(raw.storageQuotaHotGb) || 1,
            storageQuotaWarmGb: Number(raw.storageQuotaWarmGb) || 5,
            storageQuotaColdGb: Number(raw.storageQuotaColdGb) || 50,
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || new Date().toISOString(),
            status: (raw.status as AgentLedgerEntry['status']) || 'active',
          });
        }
      }
      return entries;
    }
  }

  const rows = await runQuery(`SELECT * FROM agent_ledger ORDER BY created_at DESC`);
  if (!rows || rows.length === 0) return [];
  return rows.map((r: Record<string, unknown>) => ({
    agentId: String(r.agent_id),
    name: String(r.name || ''),
    department: String(r.department || ''),
    publicKey: r.public_key ? String(r.public_key) : undefined,
    cardLevel: (r.card_level as CardLevel) || 'local-observation-only',
    badgeLevel: (r.badge_level as BadgeLevel) || 'bronze',
    allowedIntegrations: r.allowed_integrations ? JSON.parse(String(r.allowed_integrations)) : [],
    approvalBoundary: r.approval_boundary ? JSON.parse(String(r.approval_boundary)) : { humanApprovalRequired: [], autonomousBoundary: '' },
    neonBranch: String(r.neon_branch || ''),
    memoryId: String(r.memory_id || ''),
    storageQuotaHotGb: Number(r.storage_quota_hot_gb) || 1,
    storageQuotaWarmGb: Number(r.storage_quota_warm_gb) || 5,
    storageQuotaColdGb: Number(r.storage_quota_cold_gb) || 50,
    createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
    updatedAt: r.updated_at ? String(r.updated_at) : new Date().toISOString(),
    status: (r.status as AgentLedgerEntry['status']) || 'active',
  }));
}
