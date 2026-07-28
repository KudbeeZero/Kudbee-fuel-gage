import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalDb, getSyncCount } from '../db/localDb';
import { startSyncEngine, stopSyncEngine, getSyncState } from '../db/syncEngine';

interface LocalFirstState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  syncPending: number;
  refresh: () => void;
  writeOptimistic: (record: T) => void;
}

export function useLocalFirst<T>(
  tableName: 'telemetry' | 'agents' | 'governance' | 'thinkTokens',
  primaryKey: string | null,
): LocalFirstState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [syncPending, setSyncPending] = useState(0);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const db = getLocalDb();
      const table = db.table(tableName) as unknown as { get(key: unknown): Promise<T | undefined>; toArray(): Promise<T[]> };
      let result: T | null = null;

      if (primaryKey) {
        const record = await table.get(primaryKey);
        if (record) result = record as T;
      } else {
        const records = await table.toArray();
        if (records.length > 0) {
          result = records[0] as T;
        }
      }

      if (mountedRef.current) {
        setData(result);
        setStale(!result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'LocalDB read failed');
        setStale(true);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [tableName, primaryKey]);

  const writeOptimistic = useCallback(
    (record: T) => {
      const prevData = data;
      const prevStale = stale;
      setData(record);
      setStale(false);
      void (async () => {
        try {
          const db = getLocalDb();
          const table = db.table(tableName) as unknown as { put(item: T): Promise<unknown> };
          await table.put(record);
        } catch {
          if (mountedRef.current) {
            setData(prevData);
            setStale(prevStale);
          }
        }
      })();
    },
    [tableName, data, stale],
  );

  useEffect(() => {
    mountedRef.current = true;
    void load();
    startSyncEngine();

    const pollInterval = setInterval(() => {
      void getSyncCount().then((count) => {
        if (mountedRef.current) setSyncPending(count);
      });
    }, 3000);

    return () => {
      mountedRef.current = false;
      clearInterval(pollInterval);
      stopSyncEngine();
    };
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { data, loading, error, stale, syncPending, refresh, writeOptimistic };
}
