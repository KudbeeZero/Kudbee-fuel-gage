import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { apiUrl } from '../lib/apiClient';

export interface StreamEvent {
  type: string;
  data: any;
  ts: string;
}

export interface UseEventStreamResult {
  connected: boolean;
  lastEvent: StreamEvent | null;
  /** Subscribe to a named event type; returns an unsubscribe fn. */
  on: (type: string, handler: (data: any) => void) => () => void;
}

/**
 * Subscribes to the backend Server-Sent Events stream at `/api/events`.
 * Replaces 5s polling for real-time telemetry, HERMES audit updates, and
 * governance state changes. Automatically reconnects via the `retry:` hint.
 *
 * Consumers register typed handlers with `on(type, handler)`. The latest
 * raw event is exposed via `lastEvent` for lightweight state effects.
 */
export function useEventStream(): UseEventStreamResult {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const handlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const esRef = useRef<EventSource | null>(null);

  const on = useCallback((type: string, handler: (data: any) => void) => {
    const map = handlersRef.current;
    if (!map.has(type)) map.set(type, new Set());
    map.get(type)!.add(handler);
    return () => {
      map.get(type)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const url = apiUrl('/api/events');
    const es = new EventSource(url);
    esRef.current = es;

    const dispatch = (type: string, data: any) => {
      const set = handlersRef.current.get(type);
      if (set) set.forEach((h) => {
        try { h(data); } catch (e) { /* handler error must not kill the stream */ }
      });
    };

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    // Generic handler for all named events.
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        const event: StreamEvent = { type: 'message', data: parsed, ts: new Date().toISOString() };
        setLastEvent(event);
        dispatch('message', parsed);
      } catch {
        /* ignore malformed */
      }
    };

    // Named event types (event: <type>).
    const namedTypes = ['snapshot', 'telemetry', 'triage', 'governance', 'slow_brain', 'hermes_suggestion', 'hermes', 'ask', 'storage_metrics', 'os_telemetry'];
    const listeners: Array<{ type: string; fn: (ev: MessageEvent) => void }> = [];
    for (const type of namedTypes) {
      const fn = (ev: MessageEvent) => {
        let data: any = ev.data;
        try { data = JSON.parse(ev.data); } catch { /* keep string */ }
        const event: StreamEvent = { type, data, ts: new Date().toISOString() };
        setLastEvent(event);
        dispatch(type, data);
      };
      es.addEventListener(type, fn as EventListener);
      listeners.push({ type, fn });
    }

    return () => {
      listeners.forEach(({ type, fn }) => es.removeEventListener(type, fn as EventListener));
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, []);

  return useMemo(() => ({ connected, lastEvent, on }), [connected, lastEvent, on]);
}

export default useEventStream;
