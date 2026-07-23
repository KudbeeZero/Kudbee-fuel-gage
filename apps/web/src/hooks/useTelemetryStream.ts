import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/apiClient';

export type StreamMode = 'SSE' | 'POLLING' | 'DISCONNECTED';

export interface ThroughputMetrics {
  windowMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensPerSec: number;
  ttftAvgMs: number | null;
  ttftSamples: number;
  sampleCount: number;
  asOf: string;
}

interface UseTelemetryStreamOptions {
  pollIntervalMs?: number;
  reconnectMs?: number;
}

const DEFAULT_POLL_MS = 5000;
const DEFAULT_RECONNECT_MS = 4000;

export function useTelemetryStream(
  options: UseTelemetryStreamOptions = {}
) {
  const { pollIntervalMs = DEFAULT_POLL_MS, reconnectMs = DEFAULT_RECONNECT_MS } = options;
  const [mode, setMode] = useState<StreamMode>('DISCONNECTED');
  const [throughput, setThroughput] = useState<ThroughputMetrics | null>(null);
  const [lastEvent, setLastEvent] = useState<{ type: string; ts: string; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stoppedRef = useRef(false);

  const loadThroughput = useCallback(async () => {
    try {
      const data = await apiGet<ThroughputMetrics>('/api/telemetry/throughput');
      setThroughput(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Throughput fetch failed');
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    setMode('POLLING');
    stopPolling();
    void loadThroughput();
    pollTimerRef.current = setInterval(() => void loadThroughput(), pollIntervalMs);
  }, [loadThroughput, pollIntervalMs, stopPolling]);

  const disconnectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.close();
      } catch {
        /* ignore */
      }
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectSSE = useCallback(() => {
    disconnectSSE();
    if (stoppedRef.current) return;
    if (typeof EventSource === 'undefined') {
      startPolling();
      return;
    }
    try {
      const es = new EventSource('/api/telemetry/stream');
      eventSourceRef.current = es;
      es.onopen = () => {
        setMode('SSE');
        setError(null);
      };
      es.onerror = () => {
        // EventSource auto-reconnects, but if we end up here for too long we
        // fall back to polling so the UI is never empty.
        disconnectSSE();
        if (!stoppedRef.current) {
          startPolling();
        }
      };
      const handleEvent = (type: string) => (evt: MessageEvent) => {
        try {
          const payload = JSON.parse(evt.data);
          setLastEvent({ type, ts: new Date().toISOString(), payload });
          void loadThroughput();
        } catch {
          /* ignore malformed */
        }
      };
      es.addEventListener('snapshot', handleEvent('snapshot'));
      es.addEventListener('telemetry', handleEvent('telemetry'));
      es.addEventListener('router', handleEvent('router'));
      // Reconnect safety net (in case browser auto-reconnect stalls).
      reconnectTimerRef.current = setTimeout(() => {
        if (!stoppedRef.current && eventSourceRef.current === es) {
          disconnectSSE();
          connectSSE();
        }
      }, reconnectMs * 5);
    } catch (e) {
      startPolling();
    }
  }, [disconnectSSE, loadThroughput, reconnectMs, startPolling]);

  useEffect(() => {
    stoppedRef.current = false;
    connectSSE();
    return () => {
      stoppedRef.current = true;
      disconnectSSE();
      stopPolling();
    };
  }, [connectSSE, disconnectSSE, stopPolling]);

  const refresh = useCallback(() => {
    void loadThroughput();
  }, [loadThroughput]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const isActive = !paused && mode !== 'DISCONNECTED';

  return { mode, throughput, lastEvent, error, paused, togglePause, isActive, refresh, reconnect: connectSSE };
}
