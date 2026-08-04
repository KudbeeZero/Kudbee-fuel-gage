import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Radio,
  RefreshCw,
  ShieldCheck,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useOverviewHealth, type HealthSignal, type IncidentSeverity, type OverviewIncident, type OverviewState } from '../hooks/useOverviewHealth';
import { SystemPulse } from '../components/dashboard/SystemPulse';

interface OverviewPageProps {
  onNavigate: (tab: string) => void;
}

const stateStyles: Record<OverviewState, { label: string; text: string; border: string; background: string }> = {
  healthy: { label: 'Healthy', text: 'text-emerald-300', border: 'border-emerald-400/20', background: 'bg-emerald-400/10' },
  degraded: { label: 'Degraded', text: 'text-amber-300', border: 'border-amber-400/20', background: 'bg-amber-400/10' },
  offline: { label: 'Offline', text: 'text-rose-300', border: 'border-rose-400/20', background: 'bg-rose-400/10' },
  unknown: { label: 'Unknown', text: 'text-slate-300', border: 'border-slate-700', background: 'bg-slate-800/60' },
};

const severityStyles: Record<IncidentSeverity, { text: string; border: string; background: string }> = {
  critical: { text: 'text-rose-300', border: 'border-rose-400/25', background: 'bg-rose-400/[0.07]' },
  warning: { text: 'text-amber-300', border: 'border-amber-400/25', background: 'bg-amber-400/[0.07]' },
  info: { text: 'text-sky-300', border: 'border-sky-400/25', background: 'bg-sky-400/[0.07]' },
};

function SignalIcon({ signal }: { signal: HealthSignal }) {
  if (signal.id === 'postgres') return <Database className="h-4 w-4" />;
  if (signal.id === 'redis') return <Activity className="h-4 w-4" />;
  if (signal.id === 'os-stream') return signal.state === 'healthy' ? <Radio className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />;
  return <ShieldCheck className="h-4 w-4" />;
}

function IncidentIcon({ severity }: { severity: IncidentSeverity }) {
  if (severity === 'critical') return <XCircle className="h-4 w-4" />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4" />;
  return <CircleHelp className="h-4 w-4" />;
}

function SignalCard({ signal, onNavigate }: { signal: HealthSignal; onNavigate: (tab: string) => void }) {
  const style = stateStyles[signal.state];
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${style.border} ${style.background} ${style.text}`}>
          <SignalIcon signal={signal} />
        </div>
        <span className={`rounded-full border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${style.border} ${style.background} ${style.text}`}>
          {style.label}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-100">{signal.label}</h3>
      <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{signal.detail}</p>
      <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-3 font-mono text-[9px] uppercase tracking-wider">
        <div className="flex items-center justify-between gap-3 text-slate-600">
          <span>Freshness</span>
          <span className="text-slate-300">{signal.freshnessLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-600">
          <span>Durability</span>
          <span className="text-slate-300">{signal.durabilityLabel}</span>
        </div>
        {signal.latencyMs !== null && (
          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span>Latency</span>
            <span className="text-slate-300">{signal.latencyMs}ms</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onNavigate(signal.actionTab)}
        className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-300 transition-colors hover:text-emerald-200"
      >
        {signal.actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

function IncidentList({ incidents, selectedId, onSelect }: { incidents: OverviewIncident[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (incidents.length === 0) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-6 py-8 text-center">
        <CheckCircle2 className="h-7 w-7 text-emerald-300" />
        <h3 className="mt-3 text-sm font-semibold text-slate-100">No active incidents</h3>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">The current checks have not reported an incident. This is an observed empty state, not a guarantee that history is clear.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {incidents.map((incident) => {
        const style = severityStyles[incident.severity];
        return (
          <button
            key={incident.id}
            type="button"
            aria-pressed={selectedId === incident.id}
            onClick={() => onSelect(incident.id)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-slate-800/50 ${style.border} ${selectedId === incident.id ? style.background : 'bg-slate-900/30'}`}
          >
            <span className={style.text}><IncidentIcon severity={incident.severity} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-200">{incident.title}</span>
              <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-wider text-slate-600">{incident.sourceLabel} · {incident.observedLabel}</span>
            </span>
            <ChevronRight className={`h-4 w-4 shrink-0 ${selectedId === incident.id ? style.text : 'text-slate-600'}`} />
          </button>
        );
      })}
    </div>
  );
}

export function OverviewPage({ onNavigate }: OverviewPageProps) {
  const { overview, loading, error, refreshing, refresh } = useOverviewHealth();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(overview.incidents[0]?.id ?? null);
  const selectedIncident = overview.incidents.find((incident) => incident.id === selectedIncidentId) || overview.incidents[0] || null;
  const overallStyle = stateStyles[overview.overallState];

  const selectIncident = (id: string) => setSelectedIncidentId(id);

  return (
    <div className="space-y-6" id="overview-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-300/80">
            <Activity className="h-3.5 w-3.5" /> Operator overview
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-100">Overview &amp; Health Center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Start with what needs action, then follow the evidence to the right operational panel.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-400/30 hover:text-emerald-200 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Run health check
        </button>
      </header>

      <SystemPulse />

      <section className={`relative overflow-hidden rounded-2xl border p-5 sm:p-6 ${overallStyle.border} ${overallStyle.background}`}>
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-emerald-300/[0.06] blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${overallStyle.border} ${overallStyle.text}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" /> System {overview.overallLabel}
            </span>
            <h2 className="mt-4 max-w-xl font-display text-2xl font-semibold leading-tight text-slate-50">Know what is safe to do next.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{overview.incidents.length > 0 ? `${overview.incidents.length} item${overview.incidents.length === 1 ? '' : 's'} need attention before you continue.` : 'No active incidents are reported by the current health signals.'}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[390px]">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">Incidents</p>
              <p className="mt-1 text-xl font-semibold text-slate-100">{overview.incidents.length}</p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">Freshness</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-200">{overview.freshnessLabel}</p>
            </div>
            <div className="col-span-2 rounded-lg border border-slate-800/80 bg-slate-950/30 p-3 sm:col-span-1">
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">Durability</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-200">{overview.durabilityLabel}</p>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong className="font-semibold">Some signals are unavailable.</strong> {error} Use the per-signal actions below instead of assuming the whole system is down.</span>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">Step 1 · Check the surface</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-200">Runtime health signals</h2>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">{loading ? 'Collecting signals' : `${overview.signals.length} signals`}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overview.signals.map((signal) => <SignalCard key={signal.id} signal={signal} onNavigate={onNavigate} />)}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div>
          <div className="mb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">Step 2 · Decide</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-200">Incident queue</h2>
          </div>
          <IncidentList incidents={overview.incidents} selectedId={selectedIncident?.id ?? null} onSelect={selectIncident} />
        </div>

        <div>
          <div className="mb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">Step 3 · Follow through</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-200">Incident drill-down</h2>
          </div>
          {selectedIncident ? (
            <article className={`rounded-xl border p-5 ${severityStyles[selectedIncident.severity].border} ${severityStyles[selectedIncident.severity].background}`}>
              <div className={`flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider ${severityStyles[selectedIncident.severity].text}`}>
                <IncidentIcon severity={selectedIncident.severity} /> {selectedIncident.severity} incident
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-100">{selectedIncident.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{selectedIncident.detail}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800/70 pt-4 text-[10px] font-mono uppercase tracking-wider">
                <div><dt className="text-slate-600">Source</dt><dd className="mt-1 text-slate-300">{selectedIncident.sourceLabel}</dd></div>
                <div><dt className="text-slate-600">Observed</dt><dd className="mt-1 text-slate-300">{selectedIncident.observedLabel}</dd></div>
              </dl>
              <button
                type="button"
                onClick={() => onNavigate(selectedIncident.actionTab)}
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/15"
              >
                {selectedIncident.actionLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </article>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/30 px-6 py-8 text-center">
              <CircleHelp className="h-6 w-6 text-slate-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-300">Select an incident to inspect it</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">When the queue is empty, run a health check or open history to validate the absence of events.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">Operator shortcuts</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-200">Continue with context attached</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Empty states remain useful: each one leads to the next evidence source instead of stopping at “nothing here.”</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onNavigate('WORKSPACE')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/15">Resume workspace <ArrowRight className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => onNavigate('HISTORY')} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-600">Open history <Clock3 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      <p className="text-[10px] leading-5 text-slate-600">Freshness describes when a signal was observed. Durability identifies the evidence source: current probes and polls are not historical records, while stream-only data is transient. Last observation: {overview.observedAt ? new Date(overview.observedAt).toLocaleTimeString() : 'not available'}.</p>
    </div>
  );
}

export default OverviewPage;
