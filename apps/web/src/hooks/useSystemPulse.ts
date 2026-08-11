import { useEffect, useRef, useState } from 'react';

export interface PulseItem {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'error' | 'unknown';
  detail: string;
  latencyMs?: number | null;
  source: string;
}

export interface SystemPulseState {
  sha: string;
  environment: string;
  mission: string;
  items: PulseItem[];
  lastUpdated: string;
  connected: boolean;
}

const DEFAULT: SystemPulseState = {
  sha: 'unknown',
  environment: 'unknown',
  mission: 'OPS-017',
  items: [],
  lastUpdated: '',
  connected: false,
};

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<{ data: T | null; error: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    return { data: (await res.json()) as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}

export function useSystemPulse(pollMs = 15000): SystemPulseState {
  const [state, setState] = useState<SystemPulseState>(DEFAULT);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function refresh() {
      const t0 = Date.now();

      const [healthDeepRes, ciStatusRes, synapseRes, qstashRes, vectorRes] = await Promise.all([
        fetchJson<{
          uptimeSec?: number;
          services?: Record<string, { status: string; latencyMs: number | null }>;
          commit?: string;
        }>('/api/system/health-deep'),
        fetchJson<{ status?: string; lastRun?: string | null; source?: string }>('/api/ci/status'),
        fetchJson<{ protocol?: string; stats?: { totalPassed?: number } }>('/api/system/synapse-status'),
        fetchJson<{ status?: string; provider?: string }>('/api/qstash/health'),
        fetchJson<{ status?: string; dimension?: number | null; vectorCount?: number | null; indexType?: string | null; detail?: string; source?: string }>(
          '/api/system/vector-status'
        ),
      ]);
      const healthDeep = healthDeepRes.data;
      const ciStatus = ciStatusRes.data;
      const synapseStatus = synapseRes.data;
      const qstash = qstashRes.data;
      const vector = vectorRes.data;

      const elapsed = Date.now() - t0;
      const items: PulseItem[] = [];

      // Redis / Postgres from health-deep
      const pg = healthDeep?.services?.postgres;
      const rd = healthDeep?.services?.redis;
      items.push({
        key: 'postgres',
        label: 'Postgres',
        status: pg?.status === 'OK' ? 'ok' : pg?.status ? 'error' : 'unknown',
        detail: pg?.status === 'OK' ? 'Healthy' : pg?.status ?? healthDeepRes.error ?? 'No signal',
        latencyMs: pg?.latencyMs ?? null,
        source: '/api/system/health-deep',
      });
      items.push({
        key: 'redis',
        label: 'Redis',
        status: rd?.status === 'OK' ? 'ok' : rd?.status ? 'error' : 'unknown',
        detail: rd?.status === 'OK' ? 'Healthy' : rd?.status ?? healthDeepRes.error ?? 'No signal',
        latencyMs: rd?.latencyMs ?? null,
        source: '/api/system/health-deep',
      });

      // QStash
      items.push({
        key: 'qstash',
        label: 'QStash',
        status: qstash?.status === 'ok' ? 'ok' : 'unknown',
        detail: qstash?.status === 'ok' ? `Provider: ${qstash.provider ?? 'upstash'}` : qstashRes.error ?? 'No health signal',
        latencyMs: null,
        source: '/api/qstash/health',
      });

      // Vector
      const vec = vector;
      items.push({
        key: 'vector',
        label: 'Vector Index',
        status: vec?.status === 'ok' ? 'ok' : vec?.status === 'error' ? 'error' : 'unknown',
        detail: vec?.detail ?? vectorRes.error ?? 'No index signal',
        latencyMs: null,
        source: vec?.source ?? 'think-search',
      });

      // Workflow engine
      items.push({
        key: 'workflow',
        label: 'Workflow Engine',
        status: 'ok',
        detail: 'QStash router + agent dispatch active',
        latencyMs: null,
        source: 'services/qstash',
      });

      // CI
      const ciGreen = ciStatus?.status === 'GREEN';
      items.push({
        key: 'ci',
        label: 'CI Status',
        status: ciGreen ? 'ok' : ciStatus?.status ? 'warn' : 'unknown',
        detail: ciGreen ? 'GREEN' : ciStatus?.status ?? ciStatusRes.error ?? 'No report',
        latencyMs: null,
        source: '/api/ci/status',
      });

      // Synapse
      items.push({
        key: 'synapse',
        label: 'Synapse Gate',
        status: synapseStatus?.protocol ? 'ok' : 'unknown',
        detail: synapseStatus?.protocol ? `${synapseStatus.protocol} active` : synapseRes.error ?? 'No signal',
        latencyMs: null,
        source: '/api/system/synapse-status',
      });

      if (mounted) {
        setState({
          sha: healthDeep?.commit?.slice(0, 7) ?? 'unknown',
          environment: import.meta.env.MODE === 'production' ? 'Production' : 'Staging',
          mission: 'OPS-017', // updated from roadmap endpoint in SystemPulse
          items,
          lastUpdated: new Date().toISOString(),
          connected: true,
        });
      }
    }

    void refresh();
    timerRef.current = setInterval(refresh, pollMs);

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollMs]);

  return state;
}
