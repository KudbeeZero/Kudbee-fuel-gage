import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

interface ControlTowerRaw {
  status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  timestamp: string;
  uptimeSeconds: number;
  services: {
    postgres: { status: string; latencyMs: number | null };
    redis: { status: string; latencyMs: number | null };
  };
  routerProviders: Array<{ id: string; status: string; latencyMs: number | null; lastError: string | null }>;
  governanceLedger: boolean;
  vectorIndex: { detail: string };
  logBuffer: { detail: string };
}

export interface ControlTowerStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  timestamp: string;
  uptimeSeconds: number;
  postgres: { status: string; latencyMs: number | null };
  redis: { status: string; latencyMs: number | null };
  routerProviders: Array<{ id: string; status: string; latencyMs: number | null; lastError: string | null }>;
  governanceLedger: boolean;
  vectorIndex: { detail: string };
  logBuffer: { detail: string };
}

const DEFAULT_STATUS: ControlTowerStatus = {
  status: 'OFFLINE',
  timestamp: '',
  uptimeSeconds: 0,
  postgres: { status: 'OFFLINE', latencyMs: null },
  redis: { status: 'OFFLINE', latencyMs: null },
  routerProviders: [],
  governanceLedger: false,
  vectorIndex: { detail: 'no vector store' },
  logBuffer: { detail: 'unknown' },
};

export function useControlTowerStatus(pollMs = 5000) {
  const [status, setStatus] = useState<ControlTowerStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<ControlTowerRaw>('/api/system/diagnostics');
      if (data?.status) setStatus({
        status: data.status,
        timestamp: data.timestamp || '',
        uptimeSeconds: data.uptimeSeconds || 0,
        postgres: data.services?.postgres || { status: 'OFFLINE', latencyMs: null },
        redis: data.services?.redis || { status: 'OFFLINE', latencyMs: null },
        routerProviders: Array.isArray(data.routerProviders) ? data.routerProviders : [],
        governanceLedger: Boolean(data.governanceLedger),
        vectorIndex: data.vectorIndex || { detail: 'no vector store' },
        logBuffer: data.logBuffer || { detail: 'unknown' },
      });
    } catch {
      setStatus((prev) => ({ ...prev, status: 'OFFLINE' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { status, loading, refresh };
}

export default useControlTowerStatus;
