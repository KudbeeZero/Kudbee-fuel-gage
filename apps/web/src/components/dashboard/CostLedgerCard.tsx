import { useMemo } from 'react';
import { motion } from 'motion/react';
import { DollarSign, Flame, Gauge, TrendingUp, AlertTriangle, Wallet } from 'lucide-react';
import { useCostLedger } from '../../hooks/useCostLedger';

function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

function formatTokens(n: number | null | undefined): string {
  if (!n) return '0';
  return n.toLocaleString();
}

export function CostLedgerCard() {
  const { ledger, settled, loading, error } = useCostLedger();

  // Prefer the dedicated /api/metrics/cost-ledger response, falling back to
  // the community-value settled payload if the dedicated endpoint failed.
  const effective = ledger ?? (settled
    ? {
        budgetUsd: settled.budgetUsd,
        totalCostUsd: settled.totalCostUsd,
        cost24hUsd: 0,
        cost7dUsd: 0,
        remainingBudgetUsd: settled.remainingBudgetUsd,
        budgetPct: settled.budgetPct,
        burnRatePerHourUsd: 0,
        projectedMonthUsd: 0,
        inputTokens: settled.inputTokens,
        outputTokens: settled.outputTokens,
        sampleCount: settled.sampleCount,
        byProvider: {},
        asOf: new Date().toISOString()
      }
    : null);

  const projectedPct = useMemo(() => {
    if (!effective || effective.budgetUsd <= 0) return 0;
    return Math.min(150, (effective.projectedMonthUsd / effective.budgetUsd) * 100);
  }, [effective]);

  const burnColor = useMemo(() => {
    if (!effective) return 'text-slate-300';
    if (effective.budgetPct >= 80) return 'text-rose-300';
    if (effective.budgetPct >= 50) return 'text-amber-300';
    return 'text-emerald-300';
  }, [effective]);

  return (
    <section
      id="cost-ledger-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Community Cost Ledger</h3>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-300">
            SETTLED
          </span>
        </div>
        {effective && effective.budgetPct >= 80 && (
          <span className="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            BUDGET ALERT
          </span>
        )}
      </div>

      {error && !effective ? (
        <div className="p-5">
          <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </div>
        </div>
      ) : !effective || loading ? (
        <div className="space-y-3 p-5">
          <div className="h-10 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Budget progress bar */}
          <div>
            <div className="mb-1.5 flex items-center justify-between font-mono text-[10px]">
              <span className="text-slate-500 uppercase tracking-widest">Budget Utilization</span>
              <span className={`font-bold ${burnColor}`}>
                {effective.budgetPct.toFixed(2)}% of {formatCurrency(effective.budgetUsd)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, effective.budgetPct)}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  effective.budgetPct >= 80
                    ? 'bg-gradient-to-r from-rose-500 to-rose-400'
                    : effective.budgetPct >= 50
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                }`}
              />
            </div>
          </div>

          {/* Headline cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <LedgerCard
              id="cost-ledger-total"
              label="Total Settled"
              value={formatCurrency(effective.totalCostUsd)}
              accent="amber"
              icon={<Wallet className="h-3.5 w-3.5" />}
            />
            <LedgerCard
              id="cost-ledger-24h"
              label="24h Cost"
              value={formatCurrency(effective.cost24hUsd)}
              accent="emerald"
              icon={<TrendingUp className="h-3.5 w-3.5" />}
            />
            <LedgerCard
              id="cost-ledger-burn"
              label="Burn Rate / hr"
              value={formatCurrency(effective.burnRatePerHourUsd)}
              accent="rose"
              icon={<Flame className="h-3.5 w-3.5" />}
            />
            <LedgerCard
              id="cost-ledger-projected"
              label="Projected / Month"
              value={formatCurrency(effective.projectedMonthUsd)}
              accent={projectedPct >= 100 ? 'rose' : 'cyan'}
              icon={<Gauge className="h-3.5 w-3.5" />}
            />
          </div>

          {/* By-provider breakdown */}
          <div>
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Settlement by Provider
            </div>
            {Object.keys(effective.byProvider).length === 0 ? (
              <div
                id="cost-ledger-by-provider-empty"
                className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-3 text-center font-mono text-[10px] text-slate-500"
              >
                [NO TRACES] · no settled cost rows yet
              </div>
            ) : (
              <ul className="space-y-1.5">
                {Object.entries(effective.byProvider).map(([provider, row]) => (
                  <li
                    key={provider}
                    id={`cost-ledger-row-${provider}`}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5 font-mono text-[10px]"
                  >
                    <span className="font-bold text-slate-200 uppercase">{provider}</span>
                    <span className="text-cyan-300">
                      {formatTokens(row.inputTokens)}+{formatTokens(row.outputTokens)} tokens
                    </span>
                    <span className="ml-auto font-bold text-amber-300">{formatCurrency(row.cost)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-[10px] font-mono text-slate-500">
            <Stat label="Tokens (settled)" value={`${formatTokens(effective.inputTokens)} in / ${formatTokens(effective.outputTokens)} out`} />
            <Stat label="Traces Settled" value={formatTokens(effective.sampleCount)} />
            <Stat label="As of" value={new Date(effective.asOf).toLocaleTimeString()} />
          </div>
        </div>
      )}
    </section>
  );
}

function LedgerCard({
  id,
  label,
  value,
  accent,
  icon
}: {
  id: string;
  label: string;
  value: string;
  accent: 'amber' | 'emerald' | 'rose' | 'cyan';
  icon: React.ReactNode;
}) {
  const accentMap: Record<typeof accent, string> = {
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    cyan: 'text-cyan-300'
  };
  return (
    <div
      id={id}
      className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
    >
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-bold ${accentMap[accent]}`}>
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uppercase tracking-widest text-slate-600">{label}</div>
      <div className="text-slate-300">{value}</div>
    </div>
  );
}
