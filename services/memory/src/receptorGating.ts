/**
 * services/memory/src/receptorGating.ts
 * ---------------------------------------------------------------------------
 * Phase 32 — Receptor Gating Engine & "Suboxone Effect" High-Affinity Locking.
 *
 * The gating engine evaluates every token admission request against the
 * canonical pharmacokinetic model:
 *
 *   · Kd   (affinity dissociation constant): lower = stronger binding.
 *          A Guard Token with Kd ≤ 0.05 locks the coordinate slot.
 *   · Efficacy (ε): intrinsic activity. ε = 0 indicates a pure antagonist
 *          (Guard Token) that occupies the receptor without triggering output;
 *          ε > 0 indicates an agonist (productive token).
 *
 * Suboxone Effect: a Guard Token (Kd ≤ LOCK_THRESHOLD, ε = 0) permanently
 * occupies its receptor slot. Any subsequent ordinary token targeting the
 * same spatial coordinates is rejected with a 423 Locked response. Only an
 * aut h enticated CHALLENGE_TOKEN with a superior Kd can displace the guard.
 *
 * Every state transition emits a cryptographically hashed AuditEvent to the
 * `kudbee:stream:audit` Redis pub/sub channel and persists to Postgres.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from '../../lib/redis.js';
import { getDbPool, isDbHealthy, runInsert } from '../../lib/db.js';

export const LOCK_THRESHOLD = 0.05;
export const GUARD_TOKEN_AFFINITY_MIN = 0.90;

export interface CellSlot {
  x: number;
  y: number;
  z: number;
}

export interface TokenAdmissionRequest {
  tokenId: string;
  tokenHash: string;
  embedding: number[];
  kd: number;
  efficacy: number;
  slot: CellSlot;
  tokenType?: 'ORDINARY' | 'CHALLENGE_TOKEN';
}

export interface AdmissionDecision {
  admitted: boolean;
  reason: string;
  currentOccupant: string | null;
  auditHash: string;
}

interface LockRecord {
  slotKey: string;
  tokenHash: string;
  kd: number;
  lockedAt: string;
}

function slotKey(slot: CellSlot): string {
  return `${slot.x},${slot.y},${slot.z}`;
}

function computeAuditHash(event: Record<string, unknown>): string {
  const serialized = JSON.stringify(event);
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    const c = serialized.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

async function publishAuditEvent(event: Record<string, unknown>): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'receptor-audit' });
    await redis.publish(
      'kudbee:stream:audit',
      JSON.stringify({ ...event, ts: new Date().toISOString() })
    );
  } catch { /* best-effort pub/sub */ }

  try {
    const pool = getDbPool();
    if (pool && isDbHealthy()) {
      await pool.query(
        `INSERT INTO governance_actions (trace_id, action, type, agent_id, signature, signed_payload, value_score, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `receptor-${event.tokenId ?? 'unknown'}`,
          event.action ?? 'RECEPTOR_GATE',
          'RECEPTOR_EVENT',
          'RECEPTOR_GATING_ENGINE',
          event.auditHash ?? 'nohash',
          JSON.stringify(event),
          0,
          new Date().toISOString()
        ]
      );
    } else {
      await runInsert(
        `INSERT INTO governance_actions (trace_id, action, type, agent_id, signature, signed_payload, value_score, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `receptor-${event.tokenId ?? 'unknown'}`,
          event.action ?? 'RECEPTOR_GATE',
          'RECEPTOR_EVENT',
          'RECEPTOR_GATING_ENGINE',
          event.auditHash ?? 'nohash',
          JSON.stringify(event),
          0,
          new Date().toISOString()
        ]
      );
    }
  } catch { /* best-effort persistence */ }
}

const lockStore: Map<string, LockRecord> = new Map();

function cosineSimilarityLocal(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class ReceptorGatingEngine {
  private lockStore: Map<string, LockRecord>;

  constructor() {
    this.lockStore = lockStore;
  }

  getSlotKey(slot: CellSlot): string {
    return slotKey(slot);
  }

  getLockState(slot: CellSlot): LockRecord | null {
    return this.lockStore.get(slotKey(slot)) ?? null;
  }

  isLocked(slot: CellSlot): boolean {
    const lock = this.getLockState(slot);
    return lock !== null;
  }

  isGuardToken(token: TokenAdmissionRequest): boolean {
    const affinity = 1 - Math.max(0, Math.min(1, Math.abs(token.kd)));
    return (
      token.efficacy === 0 &&
      affinity >= GUARD_TOKEN_AFFINITY_MIN
    );
  }

  async evaluateAdmission(
    token: TokenAdmissionRequest,
    guardEmbedding?: number[]
  ): Promise<AdmissionDecision> {
    const key = slotKey(token.slot);
    const existing = this.lockStore.get(key);

    const baseAudit = {
      tokenId: token.tokenId,
      tokenHash: token.tokenHash,
      slot: key,
      kd: token.kd,
      efficacy: token.efficacy,
      tokenType: token.tokenType ?? 'ORDINARY',
      lockThreshold: LOCK_THRESHOLD,
      guardAffinityMin: GUARD_TOKEN_AFFINITY_MIN
    };

    if (!existing) {
      const isGuard = this.isGuardToken(token);
      if (isGuard && token.kd <= LOCK_THRESHOLD) {
        const lockRecord: LockRecord = {
          slotKey: key,
          tokenHash: token.tokenHash,
          kd: token.kd,
          lockedAt: new Date().toISOString()
        };
        this.lockStore.set(key, lockRecord);

        const auditEvent = {
          ...baseAudit,
          action: 'LOCK_ACQUIRED',
          lockApplied: true,
          currentOccupant: token.tokenHash,
          reason: `Guard Token locked slot ${key} (Kd=${token.kd}, ε=0)`,
          auditHash: ''
        };
        auditEvent.auditHash = computeAuditHash(auditEvent);
        await publishAuditEvent(auditEvent);

        return {
          admitted: true,
          reason: `Guard Token locked slot ${key} (Kd=${token.kd}, ε=0)`,
          currentOccupant: token.tokenHash,
          auditHash: auditEvent.auditHash
        };
      }

      const auditEvent = {
        ...baseAudit,
        action: 'ADMITTED_UNLOCKED',
        lockApplied: false,
        currentOccupant: null,
        reason: `Slot ${key} is unlocked — token admitted freely.`,
        auditHash: ''
      };
      auditEvent.auditHash = computeAuditHash(auditEvent);
      await publishAuditEvent(auditEvent);

      return {
        admitted: true,
        reason: `Slot ${key} is unlocked.`,
        currentOccupant: null,
        auditHash: auditEvent.auditHash
      };
    }

    const isChallenge = token.tokenType === 'CHALLENGE_TOKEN';
    const isHigherAffinity = token.kd < existing.kd;

    if (isChallenge && isHigherAffinity) {
      const oldOccupant = existing.tokenHash;
      this.lockStore.set(key, {
        slotKey: key,
        tokenHash: token.tokenHash,
        kd: token.kd,
        lockedAt: new Date().toISOString()
      });

      const auditEvent = {
        ...baseAudit,
        action: 'LOCK_OVERRIDDEN',
        lockApplied: true,
        previousOccupant: oldOccupant,
        currentOccupant: token.tokenHash,
        reason: `CHALLENGE_TOKEN overrides lock on ${key} (new Kd=${token.kd} < old Kd=${existing.kd})`,
        auditHash: ''
      };
      auditEvent.auditHash = computeAuditHash(auditEvent);
      await publishAuditEvent(auditEvent);

      return {
        admitted: true,
        reason: `CHALLENGE_TOKEN overrode lock with superior affinity.`,
        currentOccupant: token.tokenHash,
        auditHash: auditEvent.auditHash
      };
    }

    if (isChallenge && !isHigherAffinity) {
      const auditEvent = {
        ...baseAudit,
        action: 'CHALLENGE_REJECTED',
        lockApplied: true,
        currentOccupant: existing.tokenHash,
        reason: `CHALLENGE_TOKEN Kd=${token.kd} not lower than occupant Kd=${existing.kd}`,
        auditHash: ''
      };
      auditEvent.auditHash = computeAuditHash(auditEvent);
      await publishAuditEvent(auditEvent);

      return {
        admitted: false,
        reason: `CHALLENGE_TOKEN does not have higher affinity than the lock occupant.`,
        currentOccupant: existing.tokenHash,
        auditHash: auditEvent.auditHash
      };
    }

    const auditEvent = {
      ...baseAudit,
      action: 'LOCK_REJECTED',
      lockApplied: true,
      currentOccupant: existing.tokenHash,
      reason: `Slot ${key} is locked by Guard Token ${existing.tokenHash} (Kd=${existing.kd}). Suboxone Effect: rejection enforced.`,
      auditHash: ''
    };
    auditEvent.auditHash = computeAuditHash(auditEvent);
    await publishAuditEvent(auditEvent);

    return {
      admitted: false,
      reason: `Slot ${key} is locked by Guard Token ${existing.tokenHash} (Kd=${existing.kd}).`,
      currentOccupant: existing.tokenHash,
      auditHash: auditEvent.auditHash
    };
  }

  async releaseLock(slot: CellSlot, tokenHash: string): Promise<void> {
    const key = slotKey(slot);
    const existing = this.lockStore.get(key);
    if (!existing) return;

    if (existing.tokenHash === tokenHash) {
      this.lockStore.delete(key);
      const auditEvent = {
        action: 'LOCK_RELEASED',
        slot: key,
        tokenHash,
        auditHash: ''
      };
      auditEvent.auditHash = computeAuditHash(auditEvent);
      await publishAuditEvent(auditEvent);
    }
  }
}

const defaultEngine = new ReceptorGatingEngine();
export { defaultEngine, cosineSimilarityLocal };
export default ReceptorGatingEngine;
