import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/apiClient';

export interface CostLedger {
  budgetUsd: number;
  totalCostUsd: number;
  cost24hUsd: number;
  cost7dUsd: number;
  remainingBudgetUsd: number;
  budgetPct: number;
  burnRatePerHourUsd: number;
  projectedMonthUsd: number;
  inputTokens: number;
  outputTokens: number;
  sampleCount: number;
  byProvider: Record<string, { inputTokens: number; outputTokens: number; cost: number }>;
  providerCosts?: Record<string, { in: number; out: number }>;
  asOf: string;
}

export interface CommunityValueSettled {
  community_value_score: string;
  governance_actions: number;
  verified_traces: number;
  settled: {
    totalCostUsd: number;
    inputTokens: number;
    outputTokens: number;
    sampleCount: number;
    budgetUsd: number;
    remainingBudgetUsd: number;
    budgetPct: number;
  };
}

export function useCostLedger() {
  const [ledger, setLedger] = useState<CostLedger | null>(null);
  const [settled, setSettled] = useState<CommunityValueSettled['settled'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ledgerData, communityData] = await Promise.allSettled([
        apiGet<CostLedger>('/api/metrics/cost-ledger'),
        apiGet<CommunityValueSettled>('/api/metrics/community-value')
      ]);
      if (ledgerData.status === 'fulfilled') setLedger(ledgerData.value);
      if (communityData.status === 'fulfilled' && communityData.value?.settled) {
        setSettled(communityData.value.settled);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cost ledger fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  return { ledger, settled, loading, error, refresh: load };
}
