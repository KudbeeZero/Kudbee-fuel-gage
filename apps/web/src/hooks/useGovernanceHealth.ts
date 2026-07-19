import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export interface GovernanceHealth {
  governanceActive: boolean;
  routerHealthy: boolean;
  proposedCount: number;
  hermes: { status: string; online: boolean };
  timestamp: string;
}

const DEFAULT_HEALTH: GovernanceHealth = {
  governanceActive: false,
  routerHealthy: false,
  proposedCount: 0,
  hermes: { status: 'Offline', online: false },
  timestamp: ''
};

/**
 * Polls the Governance Router health endpoint every 5s (per project standard
 * dashboard interval) and exposes Governance + HERMES status to the global
 * status bar. Treats network/parse failures as "offline/unknown" rather than
 * throwing, so the status bar degrades gracefully.
 */
export function useGovernanceHealth(pollMs = 5000) {
  const [health, setHealth] = useState<GovernanceHealth>(DEFAULT_HEALTH);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<GovernanceHealth>('/api/governance/health');
      setHealth({
        governanceActive: Boolean(data.governance_active),
        routerHealthy: Boolean(data.router_healthy),
        proposedCount: Number(data.proposed_count) || 0,
        hermes: {
          status: data.hermes?.status || 'Offline',
          online: Boolean(data.hermes?.online)
        },
        timestamp: data.timestamp || new Date().toISOString()
      });
    } catch {
      // Degrade gracefully — keep last known state but mark HERMES offline.
      setHealth((prev) => ({ ...prev, hermes: { status: 'Offline', online: false } }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { health, loading, refresh };
}

export default useGovernanceHealth;
