import { getLocalDb, type SyncQueueEntry } from './localDb';
import { apiPost, apiGet } from '../lib/apiClient';

const SYNC_INTERVAL_MS = 5_000;
const PULL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let isPulling = false;
let lastSyncTime = 0;
let lastPullTime = 0;
let syncError: string | null = null;

export function getSyncState() {
  return {
    isSyncing,
    isPulling,
    lastSyncTime,
    lastPullTime,
    syncError,
  };
}

export function setSyncError(err: string | null) {
  syncError = err;
}

async function processSyncQueue(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const db = getLocalDb();
    const pending = await db.syncQueue
      .orderBy('createdAt')
      .filter((e) => e.attempts < MAX_ATTEMPTS)
      .limit(20)
      .toArray();

    if (pending.length === 0) {
      lastSyncTime = Date.now();
      syncError = null;
      return;
    }

    for (const entry of pending) {
      try {
        await pushEntry(entry);
        await db.syncQueue.delete(entry.id!);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await db.syncQueue.update(entry.id!, {
          attempts: entry.attempts + 1,
          lastAttempt: Date.now(),
          lastError: errorMsg,
        });
        syncError = `Sync failed: ${errorMsg}`;
      }
    }

    lastSyncTime = Date.now();
  } finally {
    isSyncing = false;
  }
}

async function pushEntry(entry: SyncQueueEntry): Promise<void> {
  const path = `/api/${entry.tableName}/ingest/batch`;
  try {
    await apiPost(path, entry.payload);
  } catch (err) {
    if (err instanceof Error && (err as { status?: number }).status === 429) {
      const backoffMs = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, entry.attempts),
        MAX_BACKOFF_MS,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
    throw err;
  }
}

async function pullTelemetry(): Promise<void> {
  if (isPulling) return;
  isPulling = true;

  try {
    const db = getLocalDb();
    const data = await apiGet('/api/telemetry/recent?limit=50');
    if (Array.isArray(data)) {
      const records = data.map((item: Record<string, unknown>) => ({
        traceId: String(item.trace_id ?? ''),
        model: String(item.model ?? ''),
        tokens: Number(item.tokens ?? 0),
        cost: Number(item.cost ?? 0),
        status: String(item.status ?? ''),
        timestamp: String(item.timestamp ?? new Date().toISOString()),
        cachedAt: Date.now(),
      }));
      await db.transaction('rw', db.telemetry, async () => {
        await db.telemetry.clear();
        await db.telemetry.bulkAdd(records);
      });
    }
    lastPullTime = Date.now();
  } catch {
    // pull failures are non-critical
  } finally {
    isPulling = false;
  }
}

export function startSyncEngine(): void {
  if (syncTimer) return;
  syncTimer = setInterval(processSyncQueue, SYNC_INTERVAL_MS);
  pullTimer = setInterval(pullTelemetry, PULL_INTERVAL_MS);
  processSyncQueue();
  pullTelemetry();
}

export function stopSyncEngine(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (pullTimer) {
    clearInterval(pullTimer);
    pullTimer = null;
  }
}

export function enqueueSync(
  tableName: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string,
  payload: unknown,
): void {
  const db = getLocalDb();
  void db.syncQueue.add({
    tableName,
    operation,
    recordId,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    lastAttempt: null,
    lastError: null,
  });
}
