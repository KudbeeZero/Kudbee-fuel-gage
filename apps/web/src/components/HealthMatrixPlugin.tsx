import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiPost } from '../lib/apiClient';
import { Database, Server, Cpu, Globe, Activity, MemoryStick as MemoryIcon } from 'lucide-react';

interface HealthMatrixPluginProps {
  plugin: IKudbeePlugin;
}

interface ServiceStatus {
  status: string;
  latencyMs: number;
}

interface HealthReport {
  status: string;
  services?: { postgres?: ServiceStatus; redis?: ServiceStatus; groq?: { status: string } };
  agent?: { status: string };
  metrics?: { pgLatencyMs?: number; redisLatencyMs?: number };
}

function StatusDot({ status }: { status: string | undefined }) {
  const active = status === 'connected' || status === 'running' || status === 'configured';
  return (
    <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
  );
}

export function HealthMatrixPlugin({ plugin }: HealthMatrixPluginProps) {
  const [health, setHealth] = useState<HealthReport | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await apiPost<HealthReport>('/api/system/lifecycle', { action: 'status' });
        setHealth(data);
      } catch { /* degraded */ }
    };
    void fetch();
    const id = setInterval(() => void fetch(), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!health) return <PluginCard plugin={plugin} accent="border-slate-500/20" glow="via-slate-500/50"><p className="text-[11px] text-slate-400">Loading health matrix...</p></PluginCard>;

  const overallHealth = health.status === 'HEALTHY' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : 'border-rose-500/20 bg-rose-500/5 text-rose-300';

  return (
    <PluginCard plugin={plugin} accent="border-slate-500/20" glow="via-slate-500/50">
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${overallHealth}`}>{health.status}</span>
        {health.metrics && <span className="font-mono text-[9px] text-slate-500">PG {health.metrics.pgLatencyMs ?? '—'}ms · Redis {health.metrics.redisLatencyMs ?? '—'}ms</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
          <StatusDot status={health.services?.postgres?.status} />
          <div className="mt-1 font-mono text-[10px] text-slate-300">Postgres</div>
          <div className="font-mono text-[9px] text-slate-500">{health.services?.postgres?.latencyMs ?? '—'}ms</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
          <StatusDot status={health.services?.redis?.status} />
          <div className="mt-1 font-mono text-[10px] text-slate-300">Redis</div>
          <div className="font-mono text-[9px] text-slate-500">{health.services?.redis?.latencyMs ?? '—'}ms</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
          <StatusDot status={health.agent?.status} />
          <div className="mt-1 font-mono text-[10px] text-slate-300">Worker</div>
          <div className="font-mono text-[9px] text-slate-500">{health.agent?.status ?? 'idle'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
          <StatusDot status={health.services?.groq?.status} />
          <div className="mt-1 font-mono text-[10px] text-slate-300">Groq LPU</div>
          <div className="font-mono text-[9px] text-slate-500">{health.services?.groq?.status ?? '—'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
          <Activity className="mx-auto h-3 w-3 text-slate-500" />
          <div className="mt-1 font-mono text-[10px] text-slate-300">Receptor</div>
          <div className="font-mono text-[9px] text-slate-500">P2P sync</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
          <Globe className="mx-auto h-3 w-3 text-slate-500" />
          <div className="mt-1 font-mono text-[10px] text-slate-300">Sentinel</div>
          <div className="font-mono text-[9px] text-slate-500">edge</div>
        </div>
      </div>
      <footer className="mt-3 border-t border-slate-800/60 pt-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">health matrix · 10s poll</footer>
    </PluginCard>
  );
}

export default HealthMatrixPlugin;
