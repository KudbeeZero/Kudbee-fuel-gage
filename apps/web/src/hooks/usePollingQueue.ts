import { useState, useEffect, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';

export interface PollingQueueState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setItems: Dispatch<SetStateAction<T[]>>;
  executeAction: (item: T, action: 'approve' | 'reject' | 'promote') => Promise<boolean>;
}

const DEFAULT_EXTRACT = <T>(data: unknown): T[] =>
  Array.isArray(data) ? (data as T[]) : [];

export function usePollingQueue<T>(
  endpoint: string,
  pollMs: number,
  filterFn?: (item: T) => boolean,
  actionEndpoint?: string,
  extractItems?: (data: unknown) => T[]
): PollingQueueState<T> {
  const extract = extractItems ?? DEFAULT_EXTRACT;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<unknown>(endpoint);
      const list = extract(data);
      setItems(filterFn ? list.filter(filterFn) : list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, extract, filterFn]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const executeAction = useCallback(
    async (item: T, action: 'approve' | 'reject' | 'promote'): Promise<boolean> => {
      if (!actionEndpoint) return false;
      try {
        await apiPost<unknown>(actionEndpoint, { item, action });
        void refresh();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed';
        setError(message);
        return false;
      }
    },
    [actionEndpoint, refresh]
  );

  return { items, loading, error, refresh, setItems, executeAction };
}

export default usePollingQueue;
