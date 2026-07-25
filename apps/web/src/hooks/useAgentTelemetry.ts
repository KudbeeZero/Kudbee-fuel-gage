import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '../lib/apiClient';

export interface AgentTelemetryEvent {
  zone_id: string;
  vector: { x: number; y: number; z: number };
  velocity: number;
  threat_score: number;
  status: 'ACTIVE' | 'BREACHED' | 'LOCKED';
  timestamp: string;
}

export interface AgentTelemetryState {
  events: AgentTelemetryEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAgentTelemetry(limit = 50, pollMs = 4000): AgentTelemetryState {
  const [events, setEvents] = useState<AgentTelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    try {
      const data = await apiGet<{ events?: AgentTelemetryEvent[] }>(
        `/api/agent/telemetry?limit=${Number(limit) || 50}`,
        { signal: abortRef.current.signal }
      );
      const list = Array.isArray(data?.events) ? data.events : [];
      setEvents(list);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load agent telemetry');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

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

  return { events, loading, error, refresh };
}
