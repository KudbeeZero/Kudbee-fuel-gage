import { useCallback, useState } from 'react';
import { usePollingQueue } from './usePollingQueue';
import { apiPost } from '../lib/apiClient';
import type { ApprovalRequest, ApprovalDecision } from '@kudbee/types';

export interface GovernanceStream {
  pending: ApprovalRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitApproval: (id: string, decision: ApprovalDecision, onResolve?: (success: boolean, error?: string) => void) => Promise<boolean>;
}

export function useGovernanceStream(pollMs = 5000): GovernanceStream {
  const { items, loading, error, refresh, setItems } = usePollingQueue<ApprovalRequest>(
    '/api/governance/pending',
    pollMs
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const submitApproval = useCallback(
    async (id: string, decision: ApprovalDecision, onResolve?: (success: boolean, error?: string) => void): Promise<boolean> => {
      setItems((prev) => prev.filter((p) => p.id !== id));
      try {
        await apiPost<{ success: boolean }>('/api/governance/resolve', { id, decision });
        void refresh();
        onResolve?.(true);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit approval';
        setActionError(message);
        onResolve?.(false, message);
        return false;
      }
    },
    [refresh, setItems]
  );

  return { pending: items, loading, error: error ?? actionError, refresh, submitApproval };
}

export default useGovernanceStream;
