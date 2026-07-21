/**
 * apps/web/src/hooks/useGovernanceStream.ts
 * ---------------------------------------------------------------------------
 * Polls the HITL Governance Gate (`GET /api/governance/pending`) and exposes the
 * list of proposed actions awaiting human approval, plus a `submitApproval`
 * resolver. Resilient-First: a fetch failure clears to an empty list (no throw),
 * so the dashboard degrades gracefully when the backend/router is unavailable.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';
import type { ApprovalRequest, ApprovalDecision } from '@kudbee/types';

const EMPTY: ApprovalRequest[] = [];

export interface GovernanceStream {
  pending: ApprovalRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitApproval: (id: string, decision: ApprovalDecision, onResolve?: (success: boolean, error?: string) => void) => Promise<boolean>;
}

export function useGovernanceStream(pollMs = 5000): GovernanceStream {
  const [pending, setPending] = useState<ApprovalRequest[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<ApprovalRequest[]>('/api/governance/pending');
      setPending(Array.isArray(data) ? data : EMPTY);
      setError(null);
    } catch (err) {
      // Resilient-First: keep last state, surface a non-fatal error.
      setError(err instanceof Error ? err.message : 'Failed to load pending approvals');
      setPending(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  const submitApproval = useCallback(
    async (id: string, decision: ApprovalDecision, onResolve?: (success: boolean, error?: string) => void): Promise<boolean> => {
      setPending((prev) => prev.filter((p) => p.id !== id));
      try {
        await apiPost<{ success: boolean }>('/api/governance/resolve', { id, decision });
        void refresh();
        onResolve?.(true);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit approval';
        setError(message);
        onResolve?.(false, message);
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

  return { pending, loading, error, refresh, submitApproval };
}

export default useGovernanceStream;
