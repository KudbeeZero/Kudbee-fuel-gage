import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export interface MiddlewareGuardStatus {
  name: string;
  healthy: boolean;
  state: 'ACTIVE' | 'BYPASSED' | 'DEGRADED';
  failures: number;
  successes: number;
  bypassed: number;
  lastFailure: string | null;
  cooldownUntil: string | null;
}

export interface RouteLatencyStats {
  [routeKey: string]: {
    count: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    lastStatusCode: number;
  };
}

export interface MiddlewareStatusResponse {
  timestamp: string;
  routes: RouteLatencyStats;
  middleware: MiddlewareGuardStatus[];
}

export function useMiddlewareStatus() {
  const [data, setData] = useState<MiddlewareStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await apiGet<MiddlewareStatusResponse>('/api/system/route-latencies');
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch middleware status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return {
    guards: data?.middleware ?? [],
    routes: data?.routes ?? {},
    timestamp: data?.timestamp ?? null,
    loading,
    error,
    refresh,
  };
}
