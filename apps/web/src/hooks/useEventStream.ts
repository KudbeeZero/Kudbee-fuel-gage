import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { apiUrl, apiPost } from '../lib/apiClient';

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
// Module-level singleton: only ONE EventSource is ever created.
// All useEventStream() calls share it via ref-counting.
// When ref count hits 0, the connection is closed.
let _es: EventSource | null = null;
let _refCount = 0;
let _connected = false;
let _listeners: Array<{ type: string; fn: (ev: MessageEvent) => void }> = [];
const _handlers = new Map<string, Set<(data: any) => void>>();
let _ticketPromise: Promise<string | null> | null = null; // deduplicate concurrent ticket requests

async function obtainTicket(): Promise<string | null> {
  try {
    const data = await apiPost<{ ticket: string; signature: string; expiresIn: number }>('/api/auth/stream-ticket', {});
    return data.ticket || null;
  } catch {
    return null;
  }
}

function getTicket(): Promise<string | null> {
  if (!_ticketPromise) {
    _ticketPromise = obtainTicket().finally(() => { _ticketPromise = null; });
  }
  return _ticketPromise;
}

async function ensureConnection() {
  if (_es && _es.readyState !== EventSource.CLOSED) return;
  if (typeof EventSource === 'undefined') return;

  // Obtain a fresh single-use ticket before opening the stream
  const ticket = await getTicket();
  if (!ticket) {
    // Retry after a short delay if ticket fetch failed
    setTimeout(() => { void ensureConnection(); }, 5000);
    return;
  }

  _es = new EventSource(apiUrl(`/api/events?ticket=${encodeURIComponent(ticket)}`));
  _connected = true;

  const dispatch = (type: string, data: any) => {
    const set = _handlers.get(type);
    if (set) set.forEach((h) => { try { h(data); } catch {} });
  };

  _es.onopen = () => { _connected = true; };
  _es.onerror = () => {
    _connected = false;
    // On error, tear down and reconnect with a new ticket
    teardownConnection();
    setTimeout(() => { void ensureConnection(); }, 3000);
  };

  _es.onmessage = (ev) => {
    try { const parsed = JSON.parse(ev.data); dispatch('message', parsed); } catch {}
  };

  const namedTypes = ['snapshot', 'telemetry', 'triage', 'governance', 'slow_brain', 'hermes_suggestion', 'hermes', 'ask', 'storage_metrics', 'os_telemetry'];
  for (const type of namedTypes) {
    const fn = (ev: MessageEvent) => {
      let data: any = ev.data;
      try { data = JSON.parse(ev.data); } catch {}
      dispatch(type, data);
    };
    _es.addEventListener(type, fn as EventListener);
    _listeners.push({ type, fn });
  }
}

function teardownConnection() {
  if (!_es) return;
  _listeners.forEach(({ type, fn }) => _es!.removeEventListener(type, fn as EventListener));
  _listeners = [];
  _es.close();
  _es = null;
  _connected = false;
}

export function useEventStream(): UseEventStreamResult {
  const [connected, setConnected] = useState(_connected);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);

  const on = useCallback((type: string, handler: (data: any) => void) => {
    if (!_handlers.has(type)) _handlers.set(type, new Set());
    _handlers.get(type)!.add(handler);
    return () => { _handlers.get(type)?.delete(handler); };
  }, []);

  useEffect(() => {
    _refCount += 1;
    void ensureConnection();
    const check = setInterval(() => setConnected(_connected), 1000);
    return () => {
      clearInterval(check);
      _refCount -= 1;
      if (_refCount <= 0) teardownConnection();
    };
  }, []);

  return useMemo(() => ({ connected, lastEvent, on }), [connected, lastEvent, on]);
}

export default useEventStream;
