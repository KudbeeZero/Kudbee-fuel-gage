import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

interface AgentTelemetryRaw {
  total_think_tokens: number;
  verified_trajectories: number;
  cumulative_token_cost: number;
}

export interface AgentTelemetry {
  totalThinkTokens: number;
  verifiedTrajectories: number;
  cumulativeTokenCost: number;
}

const DEFAULT_TELEMETRY: AgentTelemetry = {
  totalThinkTokens: 0,
  verifiedTrajectories: 0,
  cumulativeTokenCost: 0,
};

export function useAgentTelemetry(pollMs = 5000) {
  const [telemetry, setTelemetry] = useState<AgentTelemetry>(DEFAULT_TELEMETRY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<AgentTelemetryRaw>('/api/think/metrics');
      if (data) setTelemetry({
        totalThinkTokens: Number(data.total_think_tokens || 0),
        verifiedTrajectories: Number(data.verified_trajectories || 0),
        cumulativeTokenCost: Number(data.cumulative_token_cost || 0),
      });
    } catch {
      setTelemetry((prev) => ({ ...prev }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { telemetry, loading, refresh };
}

export default useAgentTelemetry;
