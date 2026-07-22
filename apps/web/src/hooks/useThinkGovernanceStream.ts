/**
 * apps/web/src/hooks/useThinkGovernanceStream.ts
 * ---------------------------------------------------------------------------
 * Polls the Think Token governance queue (`GET /api/think/trajectories`)
 * and exposes pending tokens plus a `promoteToken` resolver.
 * Resilient-First: failures clear to an empty list (no throw).
 */
import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPatch } from '../lib/apiClient';
import type { ThinkTrajectory } from '@kudbee/types';

const EMPTY: ThinkTrajectory[] = [];

export interface ThinkGovernanceStream {
  pending: ThinkTrajectory[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  promoteToken: (hash: string, status: 'VERIFIED' | 'RECYCLED', reviewerNotes?: string, tokenId?: string) => Promise<boolean>;
}

export function useThinkGovernanceStream(pollMs = 4000): ThinkGovernanceStream {
  const [pending, setPending] = useState<ThinkTrajectory[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ count: number; trajectories: ThinkTrajectory[] }>(
        '/api/think/trajectories?limit=100'
      );
      const list = Array.isArray(data?.trajectories) ? data.trajectories : EMPTY;
      const pendingTokens = list.filter((t) => t.status === 'PENDING_APPROVAL');
      setPending(pendingTokens);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load think token queue');
      setPending(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  const promoteToken = useCallback(
    async (hash: string, status: 'VERIFIED' | 'RECYCLED', reviewerNotes?: string, tokenId?: string): Promise<boolean> => {
      setPending((prev) => prev.filter((p) => p.token_hash !== hash));
      try {
        await apiPatch<{ success: boolean; tokenId: string; status: string }>(
          `/api/think/trajectories/${encodeURIComponent(hash)}/status`,
          { status, reviewerNotes, tokenId }
        );
        void refresh();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update token status';
        setError(message);
        return false;
      }
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { pending, loading, error, refresh, promoteToken };
}

export default useThinkGovernanceStream;
