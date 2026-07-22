/**
 * apps/web/src/hooks/useThinkTrajectories.ts
 * ---------------------------------------------------------------------------
 * Streams the THINK token trajectory spatial data from
 * `GET /api/think/trajectories`. Polls on an interval and exposes the
 * latest trajectory blocks for the spatial visualizer in the DAW motherboard.
 * Resilient-First: failures clear to an empty list instead of throwing.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import type { ThinkTrajectory, ThinkTrajectoryResponse } from '@kudbee/types';

const EMPTY: ThinkTrajectory[] = [];

export interface ThinkTrajectoryStream {
  trajectories: ThinkTrajectory[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useThinkTrajectories(limit = 25, pollMs = 4000): ThinkTrajectoryStream {
  const [trajectories, setTrajectories] = useState<ThinkTrajectory[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<ThinkTrajectoryResponse>(
        `/api/think/trajectories?limit=${Number(limit) || 25}`
      );
      const list = Array.isArray(data?.trajectories) ? data.trajectories : EMPTY;
      setTrajectories(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load think trajectories');
      setTrajectories(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { trajectories, loading, error, refresh };
}

export default useThinkTrajectories;
