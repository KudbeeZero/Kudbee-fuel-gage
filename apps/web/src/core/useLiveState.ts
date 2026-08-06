/**
 * apps/web/src/core/useLiveState.ts — Stream Lab plugin data source
 * ---------------------------------------------------------------------------
 * Shared hook that lets every plugin consume the Stream Lab pipeline:
 *   Cache → BUS → Bridge → Frontend
 *
 * Polls the agent-bridge endpoint (the same one TerminalMirror uses) so every
 * plugin reflects live system state — no static props, no stale data.
 *
 * Serverless-aligned: stateless read, no-store fetch, auto-refresh.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react';

export interface LiveState {
  agents: any[];
  updatedAt: string | null;
  source: string;
  error: string | null;
}

const POLL_MS = 4000; // matches TerminalMirror's poll cadence

export function useLiveState(): LiveState {
  const [state, setState] = useState<LiveState>({ agents: [], updatedAt: null, source: 'loading', error: null });
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch('/api/system/agent-status', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        const agents = Array.isArray(data) ? data : data.agents ?? [];
        setState({
          agents,
          updatedAt: data.timestamp ?? new Date().toISOString(),
          source: data.source ?? 'bridge',
          error: null,
        });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; active.current = false; clearInterval(id); };
  }, []);

  return state;
}
