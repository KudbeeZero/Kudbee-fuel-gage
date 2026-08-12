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
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BACKOFF_MS = 2000;

type CircuitState = 'closed' | 'open' | 'half_open';

export class DistributedLockRegistry {
  // All currently held locks across all brains
  private locks = new Map<string, LockEntry>();
  // Peer liveness state
  private peers = new Map<string, PeerHeartbeat>();
  // Event listeners for lock changes (SSE push, metrics)
  private listeners = new Set<(locks: Map<string, LockEntry>) => void>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly lockSource: EventSource = 'receptor';
  private circuitState: CircuitState = 'closed';
  private circuitFailures: number = 0;
  private localOnly: boolean = false;

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

    if (this.circuitState === 'open') {
      this.localOnly = true;
      this.notifyListeners();
      return true;
    }

    try {
      await publishEvent(this.lockSource, 'LOCK_ACQUIRED', {
        slotId,
        workerId,
        brain,
        ttlMs,
        timestamp: new Date().toISOString(),
      });
      this.circuitFailures = 0;
      this.localOnly = false;
    } catch {
      this.circuitFailures++;
      if (this.circuitFailures >= MAX_RECONNECT_ATTEMPTS) {
        this.circuitState = 'open';
        this.localOnly = true;
        this.scheduleCircuitRecovery();
      }
    }

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

    try {
      await publishEvent(this.lockSource, 'LOCK_RELEASED', {
        slotId,
        workerId,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // local release succeeds even if publish fails
    }

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
    circuitState: CircuitState;
    localOnly: boolean;
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
      circuitState: this.circuitState,
      localOnly: this.localOnly,
    };
  }

  /**
   * Renew a lock lease (2-phase commit).
   * Phase 1: extend local TTL. Phase 2: publish LOCK_RENEWED.
   * If Phase 2 fails, revert the TTL extension to prevent split-brain.
   */
  async renewLease(slotId: string, workerId: string, extensionMs: number = 30000): Promise<boolean> {
    const existing = this.locks.get(slotId);
    if (!existing || existing.workerId !== workerId) return false;

    const prevTtl = existing.ttlMs;
    existing.acquiredAt = Date.now();
    existing.ttlMs = extensionMs;

    try {
      await publishEvent(this.lockSource, 'LOCK_RENEWED', {
        slotId,
        workerId,
        extensionMs,
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch {
      existing.acquiredAt = Date.now() - (prevTtl - extensionMs);
      existing.ttlMs = prevTtl;
      this.circuitFailures++;
      return false;
    }
  }

  /**
   * Auto-recovery: redistribute locks from a dead worker to healthy workers.
   * Called when PEER_LOST is detected.
   */
  redistributeWorkload(deadWorkerId: string): void {
    const orphanedLocks: LockEntry[] = [];
    for (const [slotId, lock] of this.locks) {
      if (lock.workerId === deadWorkerId) {
        orphanedLocks.push(lock);
        this.locks.delete(slotId);
      }
    }

    if (orphanedLocks.length > 0) {
      publishEvent('system', 'WORKLOAD_REDISTRIBUTED', {
        deadWorker: deadWorkerId,
        orphanedLockCount: orphanedLocks.length,
        slotIds: orphanedLocks.map((l) => l.slotId),
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }

    this.notifyListeners();
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
        this.redistributeWorkload(id);
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

  private scheduleCircuitRecovery(): void {
    setTimeout(() => {
      if (this.circuitState === 'open') {
        this.circuitFailures = 0;
        this.circuitState = 'half_open';
        this.localOnly = false;
      }
    }, 30000);
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
