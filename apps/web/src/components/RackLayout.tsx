import { CORE_RACK_PLUGINS } from '../registry/frontend-plugins';
import { ThinkStormPlugin } from './ThinkStormPlugin';
import { ThinkStreamPlugin } from './ThinkStreamPlugin';
import { ThinkStoragePlugin } from './ThinkStoragePlugin';
import { GovernanceGatePlugin } from './GovernanceGatePlugin';
import { EdgeSentinelPlugin } from './EdgeSentinelPlugin';
import { HermesAuditorPlugin } from './HermesAuditorPlugin';
import { HermesAuditLogSchema, type HermesAuditLog } from './HermesAuditorPlugin';
import { useEffect, useState } from 'react';
import { apiGet } from '../lib/apiClient';
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

// Real-data hook: poll the worker's HERMES audit log stream. Resilient-First —
// a fetch failure degrades to an empty list (clean state), never throws.
function useHermesAuditLogs(): { logs: HermesAuditLog[]; connected: boolean } {
  const [logs, setLogs] = useState<HermesAuditLog[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const raw = await apiGet<unknown>('/api/governance/hermes-logs');
        if (cancelled || !Array.isArray(raw)) return;
        const parsed = raw
          .map((r) => HermesAuditLogSchema.safeParse(r))
          .filter((r) => r.success)
          .map((r) => r.data);
        setLogs(parsed);
        setConnected(parsed.length > 0);
      } catch {
        setConnected(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { logs, connected };
}

function renderPlugin(plugin: IKudbeePlugin, hermes: { logs: HermesAuditLog[]; connected: boolean }) {
  const span = COL_SPAN_CLASS[plugin.gridSpan.colSpan] ?? 'lg:col-span-4';
  switch (plugin.id) {
    case 'plugin-storm':
      return (
        <div key={plugin.id} className={span}>
          <ThinkStormPlugin plugin={plugin} />
        </div>
      );
    case 'plugin-stream':
      return (
        <div key={plugin.id} className={span}>
          <ThinkStreamPlugin plugin={plugin} />
        </div>
      );
    case 'plugin-storage':
      return (
        <div key={plugin.id} className={span}>
          <ThinkStoragePlugin plugin={plugin} />
        </div>
      );
    case 'plugin-gov-gate':
      return (
        <div key={plugin.id} className={span}>
          <GovernanceGatePlugin plugin={plugin} />
        </div>
      );
    case 'plugin-hermes-auditor':
      return (
        <div key={plugin.id} className={span}>
          <HermesAuditorPlugin plugin={plugin} {...hermes} />
        </div>
      );
    default:
      return null;
  }
}

export function RackLayout() {
  const plugins = Object.values(CORE_RACK_PLUGINS);
  const hermes = useHermesAuditLogs();

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
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-12">
        {plugins.map((plugin) => renderPlugin(plugin, hermes))}
        <div className="lg:col-span-12">
          <EdgeSentinelPlugin />
        </div>
      </div>
    </section>
  );
}

export default RackLayout;
