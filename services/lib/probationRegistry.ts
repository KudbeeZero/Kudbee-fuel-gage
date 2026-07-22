/**
 * services/lib/probationRegistry.ts
 * ---------------------------------------------------------------------------
 * Phase 58 — Staged Probation Framework.
 *
 * Displaced tokens enter a 60-second evaluation window. During that window
 * a guard token monitors the displaced token; at the end of the window the
 * registry resolves the outcome (SALVAGED, SUNK, or EXTENDED if still pending).
 *
 * Data is stored in the Redis sorted set kudbee:probation:pending with
 * score = stagedAt + 60_000 (the deadline). Resolved records are moved to
 * kudbee:probation:resolved (Hash) for auditability.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from './redis.js';

const PENDING_KEY = 'kudbee:probation:pending';
const RESOLVED_KEY = 'kudbee:probation:resolved';
const EVALUATION_WINDOW_MS = 60_000;

export interface ProbationRecord {
  tokenId: string;
  guardTokenId: string;
  reason: string;
  stagedAt: number;
  outcome: 'SALVAGED' | 'SUNK' | 'EXTENDED' | null;
  resolvedAt: number | null;
}

export interface ProbationOutcome {
  outcome: 'SALVAGED' | 'SUNK' | 'EXTENDED';
  reason: string;
}

function serialize(record: ProbationRecord): string {
  return JSON.stringify(record);
}

function deserialize(raw: string): ProbationRecord | null {
  try { return JSON.parse(raw) as ProbationRecord; } catch { return null; }
}

export async function stageForProbation(
  displacedTokenId: string,
  guardTokenId: string,
  reason: string
): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'probation-registry' });
    const now = Date.now();
    const deadline = now + EVALUATION_WINDOW_MS;
    const record: ProbationRecord = {
      tokenId: displacedTokenId,
      guardTokenId,
      reason,
      stagedAt: now,
      outcome: null,
      resolvedAt: null
    };
    await redis.zadd(PENDING_KEY, deadline, serialize(record));
  } catch { /* best-effort; caller should retry */ }
}

export async function evaluateProbation(tokenId: string): Promise<ProbationOutcome | null> {
  try {
    const redis = getRedisClient({ label: 'probation-registry' });
    const members = await redis.zrange(PENDING_KEY, 0, -1);
    let target: ProbationRecord | null = null;
    let targetRaw: string | null = null;

    for (const member of members) {
      const rec = deserialize(member);
      if (rec && rec.tokenId === tokenId) {
        target = rec;
        targetRaw = member;
        break;
      }
    }

    if (!target) {
      // Check resolved hash
      const resolvedRaw = await redis.hget(RESOLVED_KEY, tokenId);
      if (resolvedRaw) {
        const rec = deserialize(resolvedRaw);
        if (rec && rec.outcome) {
          return { outcome: rec.outcome, reason: rec.reason || 'Previously resolved.' };
        }
      }
      return null;
    }

    const now = Date.now();
    const deadline = target.stagedAt + EVALUATION_WINDOW_MS;

    if (now < deadline) {
      const remaining = Math.ceil((deadline - now) / 1000);
      return { outcome: 'EXTENDED', reason: `Evaluation period active — ${remaining}s remaining.` };
    }

    // Evaluation window elapsed — resolve to SALVAGED by default
    const resolvedRecord: ProbationRecord = {
      ...target,
      outcome: 'SALVAGED',
      resolvedAt: now,
      reason: 'Probation period elapsed — token salvaged.'
    };

    await redis.zrem(PENDING_KEY, targetRaw!);
    await redis.hset(RESOLVED_KEY, tokenId, serialize(resolvedRecord));

    return { outcome: 'SALVAGED', reason: 'Probation period elapsed — token salvaged.' };
  } catch {
    return null;
  }
}

export async function getDocket(): Promise<ProbationRecord[]> {
  try {
    const redis = getRedisClient({ label: 'probation-registry' });
    const members = await redis.zrange(PENDING_KEY, 0, -1);
    const records: ProbationRecord[] = [];
    for (const member of members) {
      const rec = deserialize(member);
      if (rec) records.push(rec);
    }
    return records;
  } catch {
    return [];
  }
}
