import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';

export type VectorSyncState = 'IDLE' | 'INDEXING' | 'SYNCED' | 'FAILED';

export interface VectorSyncStatus {
  state: VectorSyncState;
  lastSyncAt: string | null;
  totalChunks: number;
  totalVectors: number;
  recentDocs: Array<{ id: string; chunkCount: number }>;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
}

const DEFAULT_STATUS: VectorSyncStatus = {
  state: 'IDLE',
  lastSyncAt: null,
  totalChunks: 0,
  totalVectors: 0,
  recentDocs: []
};

export function useVectorSync() {
  const [status, setStatus] = useState<VectorSyncStatus>(DEFAULT_STATUS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resyncing, setResyncing] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [chunks, setChunks] = useState<RetrievedChunk[]>([]);
  const [recallError, setRecallError] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<VectorSyncStatus>('/api/vector/sync');
      setStatus({
        state: data?.state || 'IDLE',
        lastSyncAt: data?.lastSyncAt || null,
        totalChunks: Number(data?.totalChunks) || 0,
        totalVectors: Number(data?.totalVectors) || 0,
        recentDocs: Array.isArray(data?.recentDocs) ? data.recentDocs : []
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vector status unavailable');
      setStatus(DEFAULT_STATUS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const resync = useCallback(async () => {
    setResyncing(true);
    setError(null);
    setStatus((prev) => ({ ...prev, state: 'INDEXING' }));
    try {
      await apiPost('/api/vector/sync', {});
      // Poll for the SYNCED state a few times.
      const t1 = setTimeout(() => void loadStatus(), 800);
      const t2 = setTimeout(() => void loadStatus(), 1800);
      timersRef.current.push(t1, t2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vector sync failed');
      setStatus((prev) => ({ ...prev, state: 'FAILED' }));
    } finally {
      const t3 = setTimeout(() => setResyncing(false), 400);
      timersRef.current.push(t3);
    }
  }, [loadStatus]);

  const recall = useCallback(async (prompt: string) => {
    if (!prompt.trim()) {
      setChunks([]);
      setRecallError(null);
      return;
    }
    setRecalling(true);
    setRecallError(null);
    try {
      const res = await apiPost<{ retrieved: RetrievedChunk[] }>('/api/vector/recall', { prompt });
      setChunks(Array.isArray(res?.retrieved) ? res.retrieved : []);
    } catch (e) {
      setRecallError(e instanceof Error ? e.message : 'Recall failed');
      setChunks([]);
    } finally {
      setRecalling(false);
    }
  }, []);

  return { status, loading, error, resyncing, resync, recall, recalling, chunks, recallError, refresh: loadStatus };
}
