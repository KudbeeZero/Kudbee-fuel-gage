import { useMemo } from 'react';
import {
  Activity,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Database,
  GitBranch,
  Radio,
  ShieldCheck,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react';
import { useSystemPulse, type PulseItem } from '../../hooks/useSystemPulse';

const iconFor: Record<string, typeof Database> = {
  postgres: Database,
  redis: Activity,
  qstash: Radio,
  vector: Boxes,
  workflow: Workflow,
  ci: CheckCircle2,
  synapse: ShieldCheck,
};

const statusStyles: Record<PulseItem['status'], { dot: string; text: string; border: string; bg: string; label: string }> = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-400/20', bg: 'bg-emerald-400/[0.06]', label: 'OK' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/20', bg: 'bg-amber-400/[0.06]', label: 'WARN' },
  error: { dot: 'bg-rose-400', text: 'text-rose-300', border: 'border-rose-400/20', bg: 'bg-rose-400/[0.06]', label: 'ERROR' },
  unknown: { dot: 'bg-slate-500', text: 'text-slate-300', border: 'border-slate-700', bg: 'bg-slate-800/40', label: 'UNKNOWN' },
};

export function SystemPulse() {
  const pulse = useSystemPulse();

  const overall = useMemo(() => {
    const statuses = pulse.items.map((i) => i.status);
    if (statuses.length === 0) return 'UNKNOWN';
    if (statuses.every((s) => s === 'ok')) return 'ALL SYSTEMS OPERATIONAL';
    if (statuses.some((s) => s === 'error')) return 'DEGRADED — ACTION NEEDED';
    if (statuses.some((s) => s === 'warn')) return 'DEGRADED';
    return 'UNKNOWN';
  }, [pulse.items]);

  const overallTone = overall === 'ALL SYSTEMS OPERATIONAL' ? 'text-emerald-300' : overall.includes('DEGRADED') ? 'text-amber-300' : 'text-slate-300';

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <Zap className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">System Pulse</h2>
            <p className="text-[11px] text-slate-500">Live infrastructure status</p>
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <GitBranch className="h-3 w-3" />
            {pulse.sha}
          </span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 uppercase tracking-wider">{pulse.environment}</span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${pulse.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {pulse.connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Overall status banner */}
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2.5">
        <span className={`h-2 w-2 rounded-full ${overall.includes('ALL') ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'}`} />
        <span className={`font-mono text-[11px] font-bold uppercase tracking-widest ${overallTone}`}>{overall}</span>
        <span className="ml-auto font-mono text-[9px] text-slate-600">
          {pulse.items.length} subsystems · updated {pulse.lastUpdated ? new Date(pulse.lastUpdated).toLocaleTimeString() : '—'}
        </span>
      </div>

      {/* Grid of pulse items */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {pulse.items.map((item) => {
          const style = statusStyles[item.status];
          const Icon = iconFor[item.key] ?? CircleDashed;
          return (
            <div key={item.key} className={`rounded-lg border ${style.border} ${style.bg} p-3`}>
              <div className="flex items-center gap-2.5">
                <div className={`flex h-7 w-7 items-center justify-center rounded-md border ${style.border} ${style.text}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    <h3 className="text-xs font-semibold text-slate-200">{item.label}</h3>
                  </div>
                  <p className={`font-mono text-[10px] font-bold uppercase tracking-wider ${style.text}`}>{style.label}</p>
                </div>
              </div>
              <p className="mt-2 truncate text-[11px] text-slate-400" title={item.detail}>{item.detail}</p>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-slate-600">
                <span className="truncate">{item.source}</span>
                {item.latencyMs !== null && item.latencyMs !== undefined && <span>{item.latencyMs}ms</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mission footer */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Current Mission</span>
        </div>
        <span className="font-mono text-[11px] font-bold text-emerald-300">{pulse.mission}</span>
      </div>
    </section>
  );
}
