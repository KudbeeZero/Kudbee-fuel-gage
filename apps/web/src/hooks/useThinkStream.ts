/**
 * apps/web/src/hooks/useThinkStream.ts
 * ---------------------------------------------------------------------------
 * Streams the agent's chain-of-thought reasoning tokens from
 * `GET /api/think/archive` (the Think: Stream layer). Polls on an interval and
 * exposes the most recent thought blocks, plus a live "latest" reasoning string
 * for visual streaming into the AgentTerminal / OTel trace view.
 * Resilient-First: failures clear to an empty list instead of throwing.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import type { ThinkThought, ThinkArchiveResponse } from '@kudbee/types';

const EMPTY: ThinkThought[] = [];

export interface ThinkStream {
  thoughts: ThinkThought[];
  latest: ThinkThought | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useThinkStream(limit = 25, pollMs = 4000): ThinkStream {
  const [thoughts, setThoughts] = useState<ThinkThought[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<ThinkArchiveResponse>(
        `/api/think/archive?limit=${Number(limit) || 25}`
      );
      const list = Array.isArray(data?.thoughts) ? data.thoughts : EMPTY;
      setThoughts(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load think stream');
      setThoughts(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const latest: ThinkThought | null = thoughts.length > 0 ? thoughts[0]! : null;

  return { thoughts, latest, loading, error, refresh };
}

export default useThinkStream;
