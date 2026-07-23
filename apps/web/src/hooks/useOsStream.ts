import { useEffect, useRef, useState, useCallback } from 'react';
import { apiUrl } from '../lib/apiClient';

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
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const es = new EventSource(apiUrl('/api/os-stream'));
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
      if (mountedRef.current) setConnected(true);
    });

    es.addEventListener('error', () => {
      if (!mountedRef.current) return;
      setConnected(false);
      es.close();
      esRef.current = null;

      const jitter = 1000 + Math.random() * 4000;
      reconnectTimerRef.current = setTimeout(() => connect(), jitter);
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  return { snapshot, connected, error };
}
