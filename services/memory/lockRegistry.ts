/**
 * services/memory/lockRegistry.ts
 * ---------------------------------------------------------------------------
 * Phase 34 — Distributed Lock Registry for P2P Cross-Brain Synchronization.
 *
 * Upgrades the ReceptorGatingEngine to coordinate lock state across the
 * physically separated Fast Brain (REDIS_URL, UI telemetry) and Slow Brain
 * (REDIS_WORKER_URL, governance workers) via the unified pub/sub channel
 * kudbee:events:v2.
 *
 * Lifecycle:
 *   1. Guard Token locks coordinate slot in Slow Brain
 *   2. Registry publishes LOCK_ACQUIRED to kudbee:events:v2
 *   3. All peer brains (including Fast Brain) receive and replicate the lock
 *   4. Heartbeat pings track worker liveness
 *   5. If a worker dies, any dangling locks are auto-released
 *   6. Lock state exposed via SSE for HealthMatrixPlugin
 * ---------------------------------------------------------------------------
 */

import { publishEvent, type EventSource } from '../lib/unifiedEvents.ts';

export interface LockEntry {
  slotId: string;
  workerId: string;
  brain: 'fast' | 'slow';
  acquiredAt: number;
  ttlMs: number;
  metadata?: Record<string, unknown>;
}

interface PeerHeartbeat {
  workerId: string;
  brain: 'fast' | 'slow';
  lastSeen: number;
  status: 'alive' | 'suspect' | 'dead';
  lockCount: number;
}

const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_GRACE_MS = 25000;

export class DistributedLockRegistry {
  // All currently held locks across all brains
  private locks = new Map<string, LockEntry>();
  // Peer liveness state
  private peers = new Map<string, PeerHeartbeat>();
  // Event listeners for lock changes (SSE push, metrics)
  private listeners = new Set<(locks: Map<string, LockEntry>) => void>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly lockSource: EventSource = 'receptor';

  /**
   * Acquire a lock on a coordinate slot.
   * Publishes LOCK_ACQUIRED to kudbee:events:v2 for peer replication.
   */
  async acquireLock(
    slotId: string,
    workerId: string,
    brain: 'fast' | 'slow',
    ttlMs: number = 30000
  ): Promise<boolean> {
    this.locks.set(slotId, {
      slotId,
      workerId,
      brain,
      acquiredAt: Date.now(),
      ttlMs,
    });

    await publishEvent(this.lockSource, 'LOCK_ACQUIRED', {
      slotId,
      workerId,
      brain,
      ttlMs,
      timestamp: new Date().toISOString(),
    });

    this.notifyListeners();
    return true;
  }

  /**
   * Release a lock on a coordinate slot.
   * Publishes LOCK_RELEASED to kudbee:events:v2 for peer replication.
   */
  async releaseLock(slotId: string, workerId: string): Promise<void> {
    const existing = this.locks.get(slotId);
    if (!existing || existing.workerId !== workerId) return;

    this.locks.delete(slotId);

    await publishEvent(this.lockSource, 'LOCK_RELEASED', {
      slotId,
      workerId,
      timestamp: new Date().toISOString(),
    });

    this.notifyListeners();
  }

  /**
   * Replicate a lock from a peer brain (called via kudbee:events:v2 subscriber).
   */
  replicatePeerLock(entry: LockEntry): void {
    this.locks.set(entry.slotId, { ...entry, acquiredAt: entry.acquiredAt || Date.now() });
    this.notifyListeners();
  }

  /**
   * Remove a peer's lock (called on LOCK_RELEASED from peer).
   */
  replicatePeerRelease(slotId: string): void {
    this.locks.delete(slotId);
    this.notifyListeners();
  }

  /**
   * Register a peer heartbeat.
   */
  registerHeartbeat(workerId: string, brain: 'fast' | 'slow'): void {
    const existing = this.peers.get(workerId);
    this.peers.set(workerId, {
      workerId,
      brain,
      lastSeen: Date.now(),
      status: 'alive',
      lockCount: this.countLocksForWorker(workerId),
    });
    if (!existing) {
      publishEvent('system', 'PEER_DISCOVERED', {
        workerId,
        brain,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  /**
   * Start heartbeat and cleanup timers.
   */
  start(brain: 'fast' | 'slow', workerId: string): void {
    this.heartbeatTimer = setInterval(() => {
      this.registerHeartbeat(workerId, brain);
      publishEvent('system', 'HEARTBEAT', {
        workerId,
        brain,
        lockCount: this.locks.size,
        peerCount: this.peers.size,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    this.cleanupTimer = setInterval(() => {
      this.cleanupDeadPeers();
      this.expireStaleLocks();
    }, HEARTBEAT_GRACE_MS);

    console.log(`[LockRegistry] Started — brain: ${brain}, worker: ${workerId}`);
  }

  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.heartbeatTimer = null;
    this.cleanupTimer = null;
  }

  /**
   * Subscribe to lock state changes (for SSE push to HealthMatrixPlugin).
   */
  onLockChange(callback: (locks: Map<string, LockEntry>) => void): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  /**
   * Get metrics for SSE exposure.
   */
  getMetrics(): {
    totalLocks: number;
    fastBrainLocks: number;
    slowBrainLocks: number;
    peerCount: number;
    peerStatuses: Record<string, string>;
  } {
    let fast = 0;
    let slow = 0;
    for (const lock of this.locks.values()) {
      if (lock.brain === 'fast') fast++;
      else slow++;
    }

    const peerStatuses: Record<string, string> = {};
    for (const peer of this.peers.values()) {
      peerStatuses[peer.workerId] = peer.status;
    }

    return {
      totalLocks: this.locks.size,
      fastBrainLocks: fast,
      slowBrainLocks: slow,
      peerCount: this.peers.size,
      peerStatuses,
    };
  }

  // --- Private ---

  private countLocksForWorker(workerId: string): number {
    let count = 0;
    for (const lock of this.locks.values()) {
      if (lock.workerId === workerId) count++;
    }
    return count;
  }

  private cleanupDeadPeers(): void {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      const age = now - peer.lastSeen;
      if (age > HEARTBEAT_GRACE_MS * 2) {
        this.peers.set(id, { ...peer, status: 'dead' });
        this.releaseWorkerLocks(id);
        publishEvent('system', 'PEER_LOST', {
          workerId: id,
          age: Math.floor(age / 1000),
          locksReleased: this.countLocksForWorker(id),
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      } else if (age > HEARTBEAT_GRACE_MS) {
        this.peers.set(id, { ...peer, status: 'suspect' });
      }
    }
  }

  private expireStaleLocks(): void {
    const now = Date.now();
    for (const [slotId, lock] of this.locks) {
      if (now - lock.acquiredAt > lock.ttlMs + HEARTBEAT_GRACE_MS) {
        this.locks.delete(slotId);
        publishEvent(this.lockSource, 'LOCK_EXPIRED', {
          slotId,
          workerId: lock.workerId,
          age: Math.floor((now - lock.acquiredAt) / 1000),
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    }
    this.notifyListeners();
  }

  private releaseWorkerLocks(workerId: string): void {
    for (const [slotId, lock] of this.locks) {
      if (lock.workerId === workerId) {
        this.locks.delete(slotId);
      }
    }
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const snapshot = new Map(this.locks);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        /* ignore — isolate listener failures */
      }
    }
  }
}

// Singleton for the app process
let _registry: DistributedLockRegistry | null = null;

export function getLockRegistry(): DistributedLockRegistry {
  if (!_registry) {
    _registry = new DistributedLockRegistry();
  }
  return _registry;
}
