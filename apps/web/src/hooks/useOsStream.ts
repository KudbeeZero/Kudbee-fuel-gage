import { useEffect, useRef, useState, useCallback } from 'react';
import { apiUrl, apiPost } from '../lib/apiClient';

interface OsSnapshot {
  ts: string;
  uptime: number;
  services: {
    postgres: { ok: boolean; latencyMs: number | null };
    redis: { ok: boolean; latencyMs: number | null };
  };
  governance: { pending: number };
  think: { tokens: number; verified: number };
  memory: { vectors: number; chunks: number };
  alerts: number;
}

const DEFAULT_SNAPSHOT: OsSnapshot = {
  ts: '',
  uptime: 0,
  services: { postgres: { ok: false, latencyMs: null }, redis: { ok: false, latencyMs: null } },
  governance: { pending: 0 },
  think: { tokens: 0, verified: 0 },
  memory: { vectors: 0, chunks: 0 },
  alerts: 0
};

export function useOsStream() {
  const [snapshot, setSnapshot] = useState<OsSnapshot>(DEFAULT_SNAPSHOT);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const ticketData = await apiPost<{ ticket: string; signature: string }>('/api/auth/stream-ticket', {});
      const ticketUrl = apiUrl(`/api/os-stream?ticket=${encodeURIComponent(ticketData.ticket)}`);

      const es = new EventSource(ticketUrl);
      esRef.current = es;

    es.addEventListener('os:snapshot', (evt) => {
      try {
        const data = JSON.parse(evt.data) as OsSnapshot;
        if (mountedRef.current) {
          setSnapshot(data);
          setConnected(true);
          setError(null);
        }
      } catch { /* ignore malformed */ }
    });

    es.addEventListener('open', () => {
      if (mountedRef.current) {
        setConnected(true);
        retryCountRef.current = 0;
      }
    });

    es.addEventListener('error', () => {
      if (!mountedRef.current) return;
      setConnected(false);
      setError('OS stream disconnected — reconnecting...');
      es.close();
      esRef.current = null;

      retryCountRef.current += 1;
      const base = Math.min(30000, 1000 * Math.pow(2, retryCountRef.current));
      const jitter = base + Math.random() * 1000;
      reconnectTimerRef.current = setTimeout(() => void connect(), jitter);
    });
    } catch {
      if (!mountedRef.current) return;
      setError('Failed to obtain stream ticket — retrying...');
      retryCountRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => void connect(), 5000);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  return { snapshot, connected, error };
}
