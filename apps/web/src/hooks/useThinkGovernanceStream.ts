import { useCallback, useState } from 'react';
import { usePollingQueue } from './usePollingQueue';
import { apiPatch } from '../lib/apiClient';
import type { ThinkTrajectory } from '@kudbee/types';

export interface ThinkGovernanceStream {
  pending: ThinkTrajectory[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  promoteToken: (hash: string, status: 'VERIFIED' | 'RECYCLED', reviewerNotes?: string, tokenId?: string) => Promise<boolean>;
}

export function useThinkGovernanceStream(pollMs = 4000): ThinkGovernanceStream {
  const { items, loading, error, refresh, setItems } = usePollingQueue<ThinkTrajectory>(
    '/api/think/trajectories?limit=100',
    pollMs,
    (t) => t.status === 'PENDING_APPROVAL',
    undefined,
    (data: unknown) => {
      const d = data as { trajectories?: ThinkTrajectory[] } | null;
      return Array.isArray(d?.trajectories) ? d.trajectories : [];
    }
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const promoteToken = useCallback(
    async (hash: string, status: 'VERIFIED' | 'RECYCLED', reviewerNotes?: string, tokenId?: string): Promise<boolean> => {
      setItems((prev) => prev.filter((p) => p.token_hash !== hash));
      try {
        await apiPatch<{ success: boolean; tokenId: string; status: string }>(
          `/api/think/trajectories/${encodeURIComponent(hash)}/status`,
          { status, reviewerNotes, tokenId }
        );
        void refresh();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update token status';
        setActionError(message);
        return false;
      }
    },
    [refresh, setItems]
  );

  return { pending: items, loading, error: error ?? actionError, refresh, promoteToken };
}

export default useThinkGovernanceStream;
