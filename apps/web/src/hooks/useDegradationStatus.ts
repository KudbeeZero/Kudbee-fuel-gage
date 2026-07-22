import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export interface DegradationCounters {
  primaryQueryCount: number;
  fallbackQueryCount: number;
  primaryInsertCount: number;
  fallbackInsertCount: number;
  redisPrimaryCount: number;
  redisFallbackCount: number;
  redisErrorCount: number;
}

export interface SubsystemStatus {
  path: 'PRIMARY' | 'FALLBACK';
  primary: boolean;
  reason: string | null;
  lastCheck: string;
  counters?: Partial<DegradationCounters>;
}

export interface DegradationStatus {
  timestamp: string;
  overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  subsystems: {
    neon: SubsystemStatus;
    redis: SubsystemStatus;
    pgvector: SubsystemStatus;
  };
  counters: DegradationCounters;
}

export function useDegradationStatus(pollMs = 5000) {
  const [status, setStatus] = useState<DegradationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<DegradationStatus>('/api/telemetry/degradation-status');
      setStatus(data);
      setError(null);
    } catch {
      setError('Degradation probe failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { status, loading, error, refresh };
}
