/**
 * THINKBOX PR-004 — thinkbox event stream hook
 *
 * Subscribes to THINKBOX-specific events through the existing SSE /api/events
 * infrastructure. Filters for workspace-specific events.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useEventStream } from '../hooks/useEventStream';

export interface ThinkboxLiveEvent {
  id: string;
  type: string;
  workspaceId: string | null;
  agentId: string | null;
  timestamp: string;
  data: Record<string, unknown>;
  severity: 'info' | 'warn' | 'error' | 'success';
}

export interface UseThinkboxStreamResult {
  connected: boolean;
  subscribe: (handler: (event: ThinkboxLiveEvent) => void) => () => void;
}

export function useThinkboxStream(): UseThinkboxStreamResult {
  const { connected, on } = useEventStream();
  const handlerRef = useRef<((event: ThinkboxLiveEvent) => void) | null>(null);

  const subscribe = useCallback((handler: (event: ThinkboxLiveEvent) => void) => {
    handlerRef.current = handler;

    const unsubs: Array<() => void> = [];

    const eventTypes = [
      'snapshot',
      'os_telemetry',
      'governance',
      'hermes_suggestion',
    ];

    for (const type of eventTypes) {
      const unsub = on(type, (data: unknown) => {
        if (!handlerRef.current) return;
        if (data && typeof data === 'object') {
          const d = data as Record<string, unknown>;
          if (d.type && typeof d.type === 'string' && (d.type as string).startsWith('thinkbox:')) {
            const payload = d.data as ThinkboxLiveEvent | undefined;
            if (payload && payload.type) {
              handlerRef.current(payload as ThinkboxLiveEvent);
            }
          }
        }
      });
      unsubs.push(unsub);
    }

    return () => {
      handlerRef.current = null;
      for (const u of unsubs) u();
    };
  }, [on]);

  return { connected, subscribe };
}
