import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, ArrowRight, RotateCcw, Server, ShieldCheck, Zap, AlertTriangle, Clock } from 'lucide-react';
import { useProviderStatus, type ProviderStatus, type RouterDecision } from '../../hooks/useProviderStatus';

function statusClasses(status: ProviderStatus['status']): { wrap: string; dot: string; label: string } {
  if (status === 'OFFLINE') {
    return {
      wrap: 'border-rose-500/30 bg-rose-500/5',
      dot: 'bg-rose-400',
      label: 'text-rose-300'
    };
  }
  if (status === 'DEGRADED') {
    return {
      wrap: 'border-amber-500/30 bg-amber-500/5',
      dot: 'bg-amber-400',
      label: 'text-amber-300'
    };
  }
  return {
    wrap: 'border-emerald-500/30 bg-emerald-500/5',
    dot: 'bg-emerald-400',
    label: 'text-emerald-300'
  };
}

function decisionStatus(decision: RouterDecision): { label: string; color: string } {
  if (decision.failover) {
    return { label: 'FAILOVER', color: 'text-rose-300' };
  }
  return { label: 'PRIMARY', color: 'text-emerald-300' };
}

export function ProviderStatusGrid() {
  const { providers, decisions, totals, loading, error, selectProvider, reset } = useProviderStatus();
  const [pending, setPending] = useState<string | null>(null);

  const handleSelect = async (providerId: string) => {
    setPending(providerId);
    try {
      await selectProvider(providerId);
    } finally {
      setPending(null);
    }
  };

  const handleSimulateRateLimit = async (providerId: string) => {
    setPending(providerId);
    try {
      await selectProvider(providerId, { simulateRateLimit: true });
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      id="provider-status-grid"
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-emerald-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Multi-Provider Load Balancer</h3>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">
          {totals.totalRequests} routed · {totals.failovers} failovers
        </span>
        <button
          id="router-reset-btn"
          type="button"
          onClick={() => void reset()}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-300 hover:text-emerald-300"
          title="Reset provider health"
        >
          <RotateCcw className="h-3 w-3" />
          Reset Health
        </button>
      </div>

      {error && !providers.length ? (
        <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </div>
      ) : null}

      {loading && providers.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((p) => {
            const cfg = statusClasses(p.status);
            const busy = pending === p.id;
            return (
              <div
                key={p.id}
                id={`provider-card-${p.id}`}
                className={`rounded-lg border p-3 ${cfg.wrap}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                  <span className="font-display text-sm font-semibold text-slate-200">
                    {p.label}
                  </span>
                  <span className={`ml-auto font-mono text-[9px] font-bold uppercase tracking-widest ${cfg.label}`}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                  <Stat label="Weight" value={`${p.weight}`} />
                  <Stat label="Latency" value={`${p.measuredLatencyMs}ms`} />
                  <Stat label="Thresh" value={`${p.maxLatencyMs}ms`} />
                  <Stat label="Rate" value={`${Math.round(p.rateLimitPct * 100)}%`} />
                </div>
                {p.lastError && (
                  <div className="mt-2 truncate rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 font-mono text-[9px] text-rose-300">
                    {p.lastError}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    id={`provider-route-${p.id}`}
                    type="button"
                    onClick={() => void handleSelect(p.id)}
                    disabled={busy || !p.healthy}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                  >
                    <Zap className="h-3 w-3" />
                    Route
                  </button>
                  <button
                    id={`provider-simulate-${p.id}`}
                    type="button"
                    onClick={() => void handleSimulateRateLimit(p.id)}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                    title="Simulate 429 rate limit"
                  >
                    429
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-slate-800/60 pt-3">
        <div className="mb-1.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-500">
          <Activity className="h-3 w-3" />
          Recent Routing Decisions
        </div>
        {decisions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-3 text-center font-mono text-[10px] text-slate-500">
            [IDLE] · no decisions yet
          </div>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {decisions.slice(0, 6).map((d) => {
                const stat = decisionStatus(d);
                return (
                  <motion.li
                    key={d.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 font-mono text-[10px]"
                  >
                    <span className="text-slate-500">
                      <Clock className="h-3 w-3 inline" /> {new Date(d.ts).toLocaleTimeString()}
                    </span>
                    {d.preferred && (
                      <>
                        <span className="text-slate-300">{d.preferred}</span>
                        <ArrowRight className="h-3 w-3 text-slate-500" />
                      </>
                    )}
                    <span className="font-bold text-emerald-300">{d.selected}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
                      d.failover
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    }`}>
                      FAILOVER_TRIGGERED: {stat.label}
                    </span>
                    <span className="ml-auto text-cyan-300">{d.latencyMs}ms</span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 px-1.5 py-0.5">
      <div className="text-[8px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-bold text-slate-200">{value}</div>
    </div>
  );
}

// Empty re-export for compatibility (used elsewhere as a placeholder for type).
export type { ProviderStatus as ProviderStatusType };
