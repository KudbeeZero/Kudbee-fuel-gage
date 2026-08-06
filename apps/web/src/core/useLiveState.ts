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

import { useEffect, useState } from 'react';

export interface LiveAgent {
  id: string;
  category?: string;
  schedule?: string;
  description?: string;
  [key: string]: unknown;
}

export interface LiveState {
  agents: LiveAgent[];
  updatedAt: string | null;
  source: string;
  error: string | null;
}

const POLL_MS = 4000; // matches TerminalMirror's poll cadence

export function useLiveState(): LiveState {
  const [state, setState] = useState<LiveState>({ agents: [], updatedAt: null, source: 'loading', error: null });

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch('/api/system/agent-status', { cache: 'no-store' });
        const data = (await res.json()) as { agents?: LiveAgent[]; timestamp?: string; source?: string };
        if (cancelled) return;
        const agents = Array.isArray(data) ? (data as unknown as LiveAgent[]) : data.agents ?? [];
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

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return state;
}
