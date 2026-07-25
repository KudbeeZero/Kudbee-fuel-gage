import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '../lib/apiClient';
import { useControlTowerStore } from '../store/useControlTowerStore';

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
  reconnectAttempt: number;
}

const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 1000;

export function useControlTowerStatus(pollMs = 5000): ControlTowerState {
  const [zones, setZones] = useState<ZoneStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const pushTelemetryEvent = useControlTowerStore((s) => s.pushTelemetryEvent);

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
      setReconnectAttempt(0);

      for (const zone of list) {
        pushTelemetryEvent({
          kind: 'telemetry',
          payload: {
            zoneId: zone.zoneId,
            status: zone.status,
            threatScore: zone.threatScore,
            lastUpdate: zone.lastUpdate
          }
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load Control Tower status');
      setZones([]);

      setReconnectAttempt((prev) => {
        const next = Math.min(prev + 1, MAX_RECONNECT_ATTEMPTS);
        const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, next - 1), 30000);
        const jitter = backoff + Math.random() * 1000;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => { void refresh(); }, jitter);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [pushTelemetryEvent]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => {
      clearInterval(id);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    };
  }, [refresh, pollMs]);

  return { zones, loading, error, refresh, reconnectAttempt };
}
