import { useCallback, useEffect, useRef, useState } from 'react';
import { useMobileTelemetryStore } from '../store/useMobileTelemetryStore';
import { defaultCache } from '../cache/sqliteCache';
import type { MobileTelemetrySnapshot } from '../store/useMobileTelemetryStore';

const FLUSH_INTERVAL_MS = 10_000;
const MAX_FLUSH_BATCH = 50;
const CACHE_PREFIX = 'pending_snap_';

interface UseMobileTelemetrySyncResult {
  pendingCount: number;
  lastFlushAt: string | null;
  flushError: string | null;
  flushNow: () => Promise<void>;
}

export function useMobileTelemetrySync(
  apiEndpoint: string = '/api/mobile/telemetry'
): UseMobileTelemetrySyncResult {
  const snapshots = useMobileTelemetryStore((s) => s.snapshots);
  const updateSyncStatus = useMobileTelemetryStore((s) => s.updateSyncStatus);
  const setOnline = useMobileTelemetryStore((s) => s.setOnline);
  const setLastSyncAt = useMobileTelemetryStore((s) => s.setLastSyncAt);
  const online = useMobileTelemetryStore((s) => s.online);

  const [pendingCount, setPendingCount] = useState(0);
  const [lastFlushAt, setLastFlushAt] = useState<string | null>(null);
  const [flushError, setFlushError] = useState<string | null>(null);
  const flushingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unsyncedSnapshots = snapshots.filter((s) => !s.synced);

  const flushNow = useCallback(async () => {
    if (flushingRef.current || !online) return;
    const batch = unsyncedSnapshots.slice(-MAX_FLUSH_BATCH);
    if (batch.length === 0) return;

    flushingRef.current = true;
    setFlushError(null);

    try {
      const payload = batch.map((s) => ({
        id: s.id,
        agent_id: s.agentId,
        model: s.model,
        tokens_in: s.tokensIn,
        tokens_out: s.tokensOut,
        cost: s.cost,
        provider: s.provider,
        status: s.status,
        timestamp: s.timestamp
      }));

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshots: payload })
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const syncedIds = batch.map((s) => s.id);
      updateSyncStatus(syncedIds);

      for (const s of batch) {
        await defaultCache.delete(CACHE_PREFIX + s.id);
      }

      const now = new Date().toISOString();
      setLastFlushAt(now);
      setLastSyncAt(now);
      setOnline(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFlushError(message);
      setOnline(false);

      for (const s of batch) {
        await defaultCache.set(CACHE_PREFIX + s.id, s, 24 * 3600_000);
      }
    } finally {
      flushingRef.current = false;
    }
  }, [unsyncedSnapshots, online, apiEndpoint, updateSyncStatus, setOnline, setLastSyncAt]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  useEffect(() => {
    setPendingCount(unsyncedSnapshots.length);
  }, [unsyncedSnapshots.length]);

  useEffect(() => {
    if (online && unsyncedSnapshots.length > 0) {
      void flushNow();
    }
    intervalRef.current = setInterval(() => {
      void flushNow();
    }, FLUSH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [online, unsyncedSnapshots.length, flushNow]);

  return { pendingCount, lastFlushAt, flushError, flushNow };
}
