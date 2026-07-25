import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '../lib/apiClient';
import { useControlTowerStore } from '../store/useControlTowerStore';

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
  reconnectAttempt: number;
}

const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 1000;

export function useAgentTelemetry(limit = 50, pollMs = 4000): AgentTelemetryState {
  const [events, setEvents] = useState<AgentTelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushTelemetryEvent = useControlTowerStore((s) => s.pushTelemetryEvent);
  const pushGroqMetric = useControlTowerStore((s) => s.pushGroqMetric);

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
      setReconnectAttempt(0);

      for (const event of list) {
        const velocity = event.velocity ?? 0;
        pushTelemetryEvent({
          kind: 'telemetry',
          payload: {
            zoneId: event.zone_id,
            status: event.status,
            threatScore: event.threat_score,
            vector: event.vector,
            velocity,
            agentTimestamp: event.timestamp
          }
        });

        if (velocity > 0 && event.threat_score > 0) {
          pushGroqMetric({
            model: event.zone_id,
            latencyMs: Math.round(velocity * 10),
            tokensIn: Math.round(event.vector?.x ?? 0),
            tokensOut: Math.round(event.vector?.y ?? 0),
            cost: event.threat_score * 0.001,
            provider: 'groq',
            status: event.status === 'BREACHED' ? 'ERROR' : event.status === 'LOCKED' ? 'TIMEOUT' : 'OK'
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load agent telemetry');
      setEvents([]);

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
  }, [limit, pushTelemetryEvent, pushGroqMetric]);

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
    };
  }, [refresh, pollMs]);

  return { events, loading, error, refresh, reconnectAttempt };
}
