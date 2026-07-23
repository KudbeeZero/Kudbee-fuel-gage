import { CORE_RACK_PLUGINS } from '../registry/frontend-plugins';
import { ThinkStormPlugin } from './ThinkStormPlugin';
import { ThinkStreamPlugin } from './ThinkStreamPlugin';
import { ThinkStoragePlugin } from './ThinkStoragePlugin';
import { ThinkTrajectoriesPlugin } from './ThinkTrajectoriesPlugin';
import { GovernanceGatePlugin } from './GovernanceGatePlugin';
import { EdgeSentinelPlugin, parseRawSignal, type EdgeSignal } from './EdgeSentinelPlugin';
import { HermesAuditorPlugin } from './HermesAuditorPlugin';
import { HermesAuditLogSchema, type HermesAuditLog } from './HermesAuditorPlugin';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { SkeletonPanel } from './SkeletonPanel';
import { useEffect, useState } from 'react';
import { apiGet } from '../lib/apiClient';
import { useEventStream } from '../hooks/useEventStream';
import { useThinkTrajectories } from '../hooks/useThinkTrajectories';
import type { ThinkTrajectory } from '@kudbee/types';
import type { IKudbeePlugin } from '@kudbee/types';

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12'
};

// Real-data hook: subscribe to the native [HERMES:AUDITOR] SSE event stream
// (type `hermes`) instead of the legacy 5s polling loop. Resilient-First —
// a malformed payload is dropped and a dropped connection flips `connected`
// so the plugin renders its clean "awaiting" state.
export function useHermesAuditLogs(): { logs: HermesAuditLog[]; connected: boolean } {
  const stream = useEventStream();
  const [logs, setLogs] = useState<HermesAuditLog[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const off = stream.on('hermes', (data: unknown) => {
      const parsed = HermesAuditLogSchema.safeParse(data);
      if (!parsed.success) return;
      setLogs((prev) => [parsed.data, ...prev].slice(0, 40));
    });
    return off;
  }, [stream.on]);

  useEffect(() => {
    const watch = setInterval(() => setConnected(stream.connected), 1000);
    setConnected(stream.connected);
    return () => clearInterval(watch);
  }, [stream.connected]);

  return { logs, connected };
}

// Real-data hook: drive the Edge Sentinel from live egress telemetry. We seed
// the signal buffer with the most recent persisted traces (real data, never
// mocked) and append each live `telemetry` SSE event as it ingresses, so the
// Status LED and Signal/Noise visualizer pulse on real traffic. Resilient-First:
// a fetch/parse failure degrades to an empty signal set, never a crash.
export function useEdgeSignals(): {
  signals: EdgeSignal[];
  connected: boolean;
  lastIngressAt: number | null;
} {
  const stream = useEventStream();
  const [signals, setSignals] = useState<EdgeSignal[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastIngressAt, setLastIngressAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const loadRecent = async () => {
      try {
        const rows = await apiGet<unknown>('/api/telemetry/logs?limit=12');
        if (cancelled) return;
        if (!Array.isArray(rows)) return;
        const parsed = rows
          .map((r) => parseRawSignal(r))
          .filter((s): s is EdgeSignal => s !== null)
          .slice(0, 12);
        if (!cancelled) setSignals(parsed);
      } catch {
        /* degraded: keep existing/empty signals */
      }
    };
    void loadRecent();

    const off = stream.on('telemetry', (data: unknown) => {
      const parsed = parseRawSignal(data);
      if (!parsed) return;
      setSignals((prev) => [parsed, ...prev].slice(0, 12));
      setLastIngressAt(Date.now());
    });

    return () => {
      cancelled = true;
      controller.abort();
      off();
    };
  }, [stream.on]);

  useEffect(() => {
    const watch = setInterval(() => setConnected(stream.connected), 1000);
    setConnected(stream.connected);
    return () => clearInterval(watch);
  }, [stream.connected]);

  return { signals, connected, lastIngressAt };
}

function renderPlugin(
  plugin: IKudbeePlugin,
  hermes: { logs: HermesAuditLog[]; connected: boolean },
  trajectories: ThinkTrajectory[],
  trajectoryLoading: boolean
) {
  const span = COL_SPAN_CLASS[plugin.gridSpan?.colSpan ?? 999] ?? 'lg:col-span-4';
  switch (plugin.id) {
    case 'plugin-storm':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkStormPlugin plugin={plugin} trajectories={trajectories} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-stream':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkStreamPlugin plugin={plugin} trajectories={trajectories} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-storage':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkStoragePlugin plugin={plugin} trajectories={trajectories} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-trajectories':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkTrajectoriesPlugin plugin={plugin} trajectories={trajectories} loading={trajectoryLoading} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-gov-gate':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <GovernanceGatePlugin plugin={plugin} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-hermes-auditor':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <HermesAuditorPlugin plugin={plugin} {...hermes} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    default:
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.id}>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-center">
              <span className="font-mono text-[11px] text-rose-400">Unknown plugin: {plugin.id}</span>
            </div>
          </PanelErrorBoundary>
        </div>
      );
  }
}

export function RackLayout() {
  const plugins = Object.values(CORE_RACK_PLUGINS);
  const hermes = useHermesAuditLogs();
  const edge = useEdgeSignals();
  const { trajectories, loading: trajectoryLoading } = useThinkTrajectories();

  return (
    <section
      aria-label="Agentic Rack"
      className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5"
    >
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
            Agentic Rack · Motherboard
          </h2>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
          12-col grid · {plugins.length} modules
        </span>
      </header>
       <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-12 min-w-0">
        {plugins.map((plugin) => renderPlugin(plugin, hermes, trajectories, trajectoryLoading))}
        <div className="lg:col-span-12 min-w-0">
          <PanelErrorBoundary panel="EDGE: SENTINEL">
            <SkeletonPanel height="180px">
              <EdgeSentinelPlugin
                signals={edge.signals}
                connected={edge.connected}
                lastIngressAt={edge.lastIngressAt}
              />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      </div>
    </section>
  );
}

export default RackLayout;
