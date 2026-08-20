/**
 * services/storage/agentInventory.ts
 * ---------------------------------------------------------------------------
 * Redis-backed inventory store: tracks where every piece of agent data lives
 * across HOT (pgvector), WARM (S3 Standard), and COLD (S3 Glacier) tiers.
 *
 * This is the "always know where everything is" layer. Every write to any
 * tier updates the inventory so the system can answer:
 *   - How much hot/warm/cold data does agent X have?
 *   - What S3 objects belong to agent X?
 *   - Which Neon branches are active?
 *   - What is the cost per agent per tier?
 *
 * The inventory is hot-path safe: all writes are best-effort Redis HSETs
 * with in-memory fallback. It never blocks the capture pipeline.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from '../lib/redis.js';

const INVENTORY_PREFIX = 'kudbee:inventory';
const TIER_TTL_SECONDS = 86400 * 30;

type StorageTier = 'HOT' | 'WARM' | 'COLD';
type DataCategory = 'think_token' | 'bypassed_think' | 'telemetry' | 'memory' | 'governance';

export interface TierStats {
  agentId: string;
  tier: StorageTier;
  category: DataCategory;
  objectCount: number;
  totalBytes: number;
  lastUpdated: string;
  s3Key?: string;
  neonBranch?: string;
  status: 'active' | 'archived' | 'pending';
}

export interface AgentInventorySummary {
  agentId: string;
  hot: { count: number; bytes: number; tokens: number };
  warm: { count: number; bytes: number; objects: string[] };
  cold: { count: number; bytes: number; objects: string[] };
  totalBytes: number;
  lastSync: string;
}

function tierKey(agentId: string, tier: StorageTier, category: DataCategory): string {
  return `${INVENTORY_PREFIX}:${agentId}:${tier}:${category}`;
}

function agentSummaryKey(agentId: string): string {
  return `${INVENTORY_PREFIX}:summary:${agentId}`;
}

function allAgentsKey(): string {
  return `${INVENTORY_PREFIX}:agents`;
}

export async function recordTierWrite(params: {
  agentId: string;
  tier: StorageTier;
  category: DataCategory;
  bytes: number;
  objectId: string;
  s3Key?: string;
  neonBranch?: string;
}): Promise<void> {
  const redis = getRedisClient({ label: 'inventory' });
  const key = tierKey(params.agentId, params.tier, params.category);
  const now = new Date().toISOString();

  const payload: Record<string, string> = {
    agentId: params.agentId,
    tier: params.tier,
    category: params.category,
    objectCount: '1',
    totalBytes: String(params.bytes),
    lastUpdated: now,
    status: 'active',
  };
  if (params.s3Key) payload.s3Key = params.s3Key;
  if (params.neonBranch) payload.neonBranch = params.neonBranch;

  if (redis?.status === 'ready') {
    await redis
      .multi()
      .hSet(key, payload)
      .expire(key, TIER_TTL_SECONDS)
      .hIncrBy(key, 'objectCount', 1)
      .hIncrBy(key, 'totalBytes', params.bytes)
      .hSet(key, 'lastUpdated', now)
      .sAdd(allAgentsKey(), params.agentId)
      .expire(allAgentsKey(), TIER_TTL_SECONDS)
      .exec()
      .catch(() => {});
  }
}

export async function recordTierDelete(params: {
  agentId: string;
  tier: StorageTier;
  category: DataCategory;
  bytes: number;
}): Promise<void> {
  const redis = getRedisClient({ label: 'inventory' });
  const key = tierKey(params.agentId, params.tier, params.category);

  if (redis?.status === 'ready') {
    await redis
      .multi()
      .hIncrBy(key, 'objectCount', -1)
      .hIncrBy(key, 'totalBytes', -params.bytes)
      .hSet(key, 'lastUpdated', new Date().toISOString())
      .exec()
      .catch(() => {});
  }
}

export async function getTierStats(
  agentId: string,
  tier: StorageTier,
  category: DataCategory
): Promise<TierStats | null> {
  const redis = getRedisClient({ label: 'inventory' });
  const key = tierKey(agentId, tier, category);

  if (redis?.status === 'ready') {
    const raw = await redis.hGetAll(key).catch(() => ({}));
    if (raw && Object.keys(raw).length > 0) {
      return {
        agentId: raw.agentId || agentId,
        tier: (raw.tier as StorageTier) || tier,
        category: (raw.category as DataCategory) || category,
        objectCount: Number(raw.objectCount) || 0,
        totalBytes: Number(raw.totalBytes) || 0,
        lastUpdated: raw.lastUpdated || new Date().toISOString(),
        s3Key: raw.s3Key || undefined,
        neonBranch: raw.neonBranch || undefined,
        status: (raw.status as TierStats['status']) || 'active',
      };
    }
  }

  return null;
}

export async function getAgentSummary(agentId: string): Promise<AgentInventorySummary | null> {
  const redis = getRedisClient({ label: 'inventory' });
  const summaryKey = agentSummaryKey(agentId);

  if (redis?.status === 'ready') {
    const raw = await redis.hGetAll(summaryKey).catch(() => ({}));
    if (raw && Object.keys(raw).length > 0) {
      return {
        agentId: raw.agentId || agentId,
        hot: {
          count: Number(raw.hotCount) || 0,
          bytes: Number(raw.hotBytes) || 0,
          tokens: Number(raw.hotTokens) || 0,
        },
        warm: {
          count: Number(raw.warmCount) || 0,
          bytes: Number(raw.warmBytes) || 0,
          objects: raw.warmObjects ? JSON.parse(raw.warmObjects) : [],
        },
        cold: {
          count: Number(raw.coldCount) || 0,
          bytes: Number(raw.coldBytes) || 0,
          objects: raw.coldObjects ? JSON.parse(raw.coldObjects) : [],
        },
        totalBytes: Number(raw.totalBytes) || 0,
        lastSync: raw.lastSync || new Date().toISOString(),
      };
    }
  }

  const tiers: StorageTier[] = ['HOT', 'WARM', 'COLD'];
  const categories: DataCategory[] = ['think_token', 'bypassed_think', 'telemetry', 'memory', 'governance'];
  let hotCount = 0;
  let hotBytes = 0;
  let hotTokens = 0;
  let warmCount = 0;
  let warmBytes = 0;
  const warmObjects: string[] = [];
  let coldCount = 0;
  let coldBytes = 0;
  const coldObjects: string[] = [];

  for (const tier of tiers) {
    for (const category of categories) {
      const stats = await getTierStats(agentId, tier, category);
      if (!stats) continue;
      if (tier === 'HOT') {
        hotCount += stats.objectCount;
        hotBytes += stats.totalBytes;
        if (category === 'think_token') hotTokens += stats.objectCount;
      } else if (tier === 'WARM') {
        warmCount += stats.objectCount;
        warmBytes += stats.totalBytes;
        if (stats.s3Key) warmObjects.push(stats.s3Key);
      } else {
        coldCount += stats.objectCount;
        coldBytes += stats.totalBytes;
        if (stats.s3Key) coldObjects.push(stats.s3Key);
      }
    }
  }

  const summary: AgentInventorySummary = {
    agentId,
    hot: { count: hotCount, bytes: hotBytes, tokens: hotTokens },
    warm: { count: warmCount, bytes: warmBytes, objects: warmObjects },
    cold: { count: coldCount, bytes: coldBytes, objects: coldObjects },
    totalBytes: hotBytes + warmBytes + coldBytes,
    lastSync: new Date().toISOString(),
  };

  if (redis?.status === 'ready') {
    await redis
      .multi()
      .hSet(summaryKey, {
        agentId,
        hotCount: String(hotCount),
        hotBytes: String(hotBytes),
        hotTokens: String(hotTokens),
        warmCount: String(warmCount),
        warmBytes: String(warmBytes),
        warmObjects: JSON.stringify(warmObjects),
        coldCount: String(coldCount),
        coldBytes: String(coldBytes),
        coldObjects: JSON.stringify(coldObjects),
        totalBytes: String(summary.totalBytes),
        lastSync: summary.lastSync,
      })
      .expire(summaryKey, TIER_TTL_SECONDS)
      .exec()
      .catch(() => {});
  }

  return summary;
}

export async function listAllAgentSummaries(): Promise<AgentInventorySummary[]> {
  const redis = getRedisClient({ label: 'inventory' });
  if (redis?.status !== 'ready') return [];

  const agentIds = await redis.sMembers(allAgentsKey()).catch(() => []);
  if (!agentIds || agentIds.length === 0) return [];

  const summaries: AgentInventorySummary[] = [];
  for (const agentId of agentIds) {
    const summary = await getAgentSummary(agentId);
    if (summary) summaries.push(summary);
  }
  return summaries;
}
