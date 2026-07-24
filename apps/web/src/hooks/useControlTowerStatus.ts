import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '../../lib/apiClient';

export interface ZoneStatus {
  zoneId: string;
  status: 'ACTIVE' | 'BREACHED' | 'LOCKED';
  threatScore: number;
  lastUpdate: string;
}

export interface ControlTowerState {
  zones: ZoneStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useControlTowerStatus(pollMs = 5000): ControlTowerState {
  const [zones, setZones] = useState<ZoneStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    try {
      const data = await apiGet<{ zones?: ZoneStatus[] }>('/api/zones/status', {
        signal: abortRef.current.signal
      });
      const list = Array.isArray(data?.zones) ? data.zones : [];
      setZones(list);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load Control Tower status');
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => {
      clearInterval(id);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [refresh, pollMs]);

  return { zones, loading, error, refresh };
}
