import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';

export interface ProviderStatus {
  id: string;
  label: string;
  status: 'OK' | 'DEGRADED' | 'OFFLINE';
  weight: number;
  baseLatencyMs: number;
  measuredLatencyMs: number;
  maxLatencyMs?: number;
  rateLimitPct: number;
  lastError: string | null;
  healthy: boolean;
}

export interface RouterDecision {
  id: string;
  preferred: string | null;
  selected: string;
  failover: boolean;
  latencyMs: number;
  ts: string;
}

interface RouterStatusResponse {
  providers: ProviderStatus[];
  totalRequests: number;
  failovers: number;
  recent: RouterDecision[];
}

export function useProviderStatus() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [decisions, setDecisions] = useState<RouterDecision[]>([]);
  const [totals, setTotals] = useState({ totalRequests: 0, failovers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<RouterStatusResponse>('/api/router/status');
      setProviders(Array.isArray(data?.providers) ? data.providers : []);
      setDecisions(Array.isArray(data?.recent) ? data.recent : []);
      setTotals({ totalRequests: data?.totalRequests || 0, failovers: data?.failovers || 0 });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Router status unavailable');
      setProviders([]);
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [load]);

  const selectProvider = useCallback(
    async (preferred?: string, opts?: { simulateRateLimit?: boolean; simulateLatencyMs?: number }) => {
      try {
        const result = await apiPost<RouterDecision & { providers: ProviderStatus[] }>(
          '/api/router/select',
          {
            preferred: preferred || null,
            simulateRateLimit: !!opts?.simulateRateLimit,
            simulateLatencyMs: opts?.simulateLatencyMs || 0
          }
        );
        if (result?.providers) setProviders(result.providers);
        await load();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Router select failed');
        return null;
      }
    },
    [load]
  );

  const reset = useCallback(async () => {
    try {
      await apiPost('/api/router/reset', {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Router reset failed');
    }
  }, [load]);

  return { providers, decisions, totals, loading, error, refresh: load, selectProvider, reset };
}
