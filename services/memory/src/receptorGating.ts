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
 * Phase 34 — P2P Peer Discovery: the lock store is now backed by a shared
 * Redis hash (kudbee:receptor:locks) with pub/sub sync (kudbee:receptor:sync)
 * so that every sentinel dyno and worker process sees a coherent lock map.
 * Locks survive process restarts and propagate across Heroku dyno boundaries
 * in real time. The in-memory Map is still a synchronous cache for sub-ms
 * reads, but writes fan out through Redis.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from '../../lib/redis.js';
import { getDbPool, isDbHealthy, runInsert } from '../../lib/db.js';

export const LOCK_THRESHOLD = 0.05;
export const GUARD_TOKEN_AFFINITY_MIN = 0.90;
const REDIS_LOCK_KEY = 'kudbee:receptor:locks';
const REDIS_SYNC_CHANNEL = 'kudbee:receptor:sync';

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
  tokenType?: 'ORDINARY' | 'CHALLENGE_TOKEN' | 'ADMIN';
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

// --- Phase 34: Shared Redis lock registry with pub/sub sync ----------------
// Locks are stored as a Redis hash (kudbee:receptor:locks) mapping slotKey →
// JSON-serialised LockRecord. Every write publishes to kudbee:receptor:sync
// so other processes can apply the update to their local caches immediately.

async function persistLock(record: LockRecord): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'receptor-locks' });
    await redis.hset(REDIS_LOCK_KEY, record.slotKey, JSON.stringify(record));
    await redis.publish(REDIS_SYNC_CHANNEL, JSON.stringify({ type: 'lock_set', record }));
  } catch { /* best-effort — local cache still holds the lock */ }
}

async function removeLock(slotKey: string): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'receptor-locks' });
    await redis.hdel(REDIS_LOCK_KEY, slotKey);
    await redis.publish(REDIS_SYNC_CHANNEL, JSON.stringify({ type: 'lock_released', slotKey }));
  } catch { /* best-effort */ }
}

async function loadAllLocks(): Promise<Map<string, LockRecord>> {
  const map = new Map<string, LockRecord>();
  try {
    const redis = getRedisClient({ label: 'receptor-locks' });
    const all = await redis.hgetall(REDIS_LOCK_KEY);
    if (all) {
      for (const [key, value] of Object.entries(all)) {
        try {
          const record = JSON.parse(value as string) as LockRecord;
          if (record.slotKey && record.tokenHash) {
            map.set(key, record);
          }
        } catch { /* skip malformed */ }
      }
    }
  } catch { /* return empty cache on Redis failure */ }
  return map;
}

const lockStore: Map<string, LockRecord> = new Map();
let lockStoreLoaded = false;

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

  async bootstrap(): Promise<void> {
    if (lockStoreLoaded) return;
    const remote = await loadAllLocks();
    for (const [key, record] of remote) {
      this.lockStore.set(key, record);
    }
    lockStoreLoaded = true;

    try {
      const redis = getRedisClient({ label: 'receptor-sync' });
      const sub = redis.duplicate();
      await sub.subscribe(REDIS_SYNC_CHANNEL);
      sub.on('message', (channel: string, message: string) => {
        if (channel !== REDIS_SYNC_CHANNEL) return;
        try {
          const msg = JSON.parse(message);
          if (msg.type === 'lock_set' && msg.record) {
            this.lockStore.set(msg.record.slotKey, msg.record);
          } else if (msg.type === 'lock_released' && msg.slotKey) {
            this.lockStore.delete(msg.slotKey);
          }
        } catch { /* skip malformed sync messages */ }
      });
    } catch { /* resilient — keep working with local cache */ }
    console.log('[Receptor] Lock registry bootstrapped from Redis.');
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

    if (token.tokenType === 'ADMIN') {
      const existingLock = this.lockStore.get(key);
      if (existingLock) {
        this.lockStore.delete(key);
        void removeLock(key);
      }
      const auditEvent: Record<string, unknown> = {
        tokenId: token.tokenId, tokenHash: token.tokenHash, slot: key,
        action: existingLock ? 'ADMIN_BYPASS_RELEASE' : 'ADMIN_BYPASS',
        bypass: true, tokenType: 'ADMIN', auditHash: ''
      };
      auditEvent.auditHash = computeAuditHash(auditEvent);
      await publishAuditEvent(auditEvent);
      return {
        admitted: true,
        reason: existingLock ? `ADMIN bypass — lock released and token admitted.` : `ADMIN bypass — token admitted without gating.`,
        currentOccupant: null,
        auditHash: auditEvent.auditHash as string
      };
    }

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
        void persistLock(lockRecord);
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
      void persistLock({ slotKey: key, tokenHash: token.tokenHash, kd: token.kd, lockedAt: new Date().toISOString() });

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
      void removeLock(key);
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
