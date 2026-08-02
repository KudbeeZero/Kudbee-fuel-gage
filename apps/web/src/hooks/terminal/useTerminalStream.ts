/**
 * THINKBOX PR-014B — useTerminalStream
 *
 * Subscribes to the SSE/BUS from useEventStream, filters for all
 * thinkbox and engineering events, and provides a reactive line stream
 * for the Interactive Terminal. No mock data. Real BUS events only.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useEventStream } from '../hooks/useEventStream';

export interface TerminalLine {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  severity: 'info' | 'warn' | 'error' | 'success';
  content: string;
  category: string;
}

export interface UseTerminalStreamResult {
  lines: TerminalLine[];
  connected: boolean;
  paused: boolean;
  eventCount: number;
  togglePause: () => void;
  clear: () => void;
  filter: string | null;
  setFilter: (f: string | null) => void;
  exportLines: () => string;
  pushLine: (line: Omit<TerminalLine, 'id' | 'timestamp'>) => void;
}

export function useTerminalStream(): UseTerminalStreamResult {
  const { connected, on } = useEventStream();
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const lineId = useRef(0);

  const pushLine = useCallback((raw: Omit<TerminalLine, 'id' | 'timestamp'>) => {
    if (paused) return;
    const line: TerminalLine = {
      ...raw,
      id: `tl-${++lineId.current}`,
      timestamp: new Date().toISOString(),
    };
    setLines(prev => {
      const next = [...prev, line];
      return next.length > 500 ? next.slice(-500) : next;
    });
    setEventCount(c => c + 1);
  }, [paused]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // Listen for BUS events from the existing SSE stream
    const eventTypes = ['os_telemetry', 'snapshot', 'governance', 'hermes_suggestion'];

    for (const type of eventTypes) {
      const unsub = on(type, (data: unknown) => {
        if (!data || typeof data !== 'object') return;
        const d = data as Record<string, unknown>;
        const eventType = (d.type as string) ?? type;

        // Map to terminal line
        if (typeof d.type === 'string' && d.type.startsWith('thinkbox:')) {
          const payload = (d.data as Record<string, unknown>) ?? {};
          pushLine({
            type: 'event',
            source: (payload.agentId as string) ?? 'BUS',
            severity: ((payload.severity as string) ?? 'info') as TerminalLine['severity'],
            content: `${(payload.type as string) ?? eventType}: ${JSON.stringify(payload.data ?? {}).slice(0, 120)}`,
            category: 'engineering',
          });
        } else if (eventType === 'governance') {
          pushLine({ type: 'event', source: 'GUARDIAN', severity: 'info', content: `Governance update: ${JSON.stringify(d).slice(0, 100)}`, category: 'governance' });
        }
      });
      unsubs.push(unsub);
    }

    return () => { for (const u of unsubs) unsubs.forEach(u => u()); };
  }, [on, pushLine]);

  // Seed with boot lines (connection status)
  useEffect(() => {
    pushLine({ type: 'system', source: 'KILOH', severity: 'success', content: 'Terminal connected — THINKBOX v1.0', category: 'system' });
    pushLine({ type: 'system', source: 'KILOH', severity: 'info', content: `BUS: ${connected ? 'CONNECTED' : 'DISCONNECTED'} | SSE: /api/events`, category: 'system' });
    pushLine({ type: 'system', source: 'KILOH', severity: 'info', content: 'Type /help for commands. Simulation mode active.', category: 'system' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pushLine({ type: 'system', source: 'BUS', severity: connected ? 'success' : 'warn', content: `SSE ${connected ? 'connected' : 'disconnected — reconnecting...'}`, category: 'system' });
  }, [connected, pushLine]);

  const clear = useCallback(() => { setLines([]); setEventCount(0); }, []);
  const togglePause = useCallback(() => setPaused(p => !p), []);

  const exportLines = useCallback(() => {
    return JSON.stringify(lines.map(l => ({ ts: l.timestamp, src: l.source, sev: l.severity, msg: l.content })), null, 2);
  }, [lines]);

  return { lines, connected, paused, eventCount, togglePause, clear, filter, setFilter, exportLines, pushLine };
}
