import React, { useEffect, useState } from 'react';
import { useMobileTelemetryStore } from '../store/useMobileTelemetryStore';

interface TokenBudget {
  minted24h: number;
  budgetCap: number;
  utilizationPct: number;
  velocity24h: number;
}

function computeBudget(snapshots: { timestamp: string; tokensOut: number }[]): TokenBudget {
  const now = Date.now();
  const last24h = snapshots.filter((s) => now - new Date(s.timestamp).getTime() < 86_400_000);
  const minted24h = last24h.length;
  const budgetCap = 10_000;
  const utilizationPct = Math.min(100, Math.round((minted24h / budgetCap) * 100));
  const velocity24h = last24h.reduce((sum, s) => sum + s.tokensOut, 0);

  return { minted24h, budgetCap, utilizationPct, velocity24h };
}

export function MobileThinkTokenBadge() {
  const snapshots = useMobileTelemetryStore((s) => s.snapshots);
  const [budget, setBudget] = useState<TokenBudget>({
    minted24h: 0, budgetCap: 10_000, utilizationPct: 0, velocity24h: 0
  });

  useEffect(() => {
    setBudget(computeBudget(snapshots));
  }, [snapshots]);

  const barColor = budget.utilizationPct > 80
    ? 'bg-rose-500'
    : budget.utilizationPct > 50
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const statusText = budget.utilizationPct > 80
    ? 'CRITICAL'
    : budget.utilizationPct > 50
      ? 'WARNING'
      : 'HEALTHY';

  const statusColor = budget.utilizationPct > 80
    ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
    : budget.utilizationPct > 50
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">
            Think Token Budget
          </span>
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${statusColor}`}>
            {statusText}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-lg bg-slate-800/30 p-2 text-center">
            <div className="text-[8px] font-mono text-slate-500 uppercase">24h Minted</div>
            <div className="font-mono text-lg text-slate-200">{budget.minted24h.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-slate-800/30 p-2 text-center">
            <div className="text-[8px] font-mono text-slate-500 uppercase">Velocity</div>
            <div className="font-mono text-lg text-slate-200">{budget.velocity24h.toLocaleString()}</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
            <span>Budget utilization</span>
            <span>{budget.minted24h} / {budget.budgetCap}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full ${barColor} transition-all duration-500`}
              style={{ width: `${budget.utilizationPct}%` }}
            />
          </div>
          <div className="text-right text-[9px] font-mono text-slate-600">
            {budget.utilizationPct}%
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">
          Recent Mint Events
        </span>
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {snapshots.slice(0, 10).filter((s) => s.status === 'OK').map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-800/20 px-2 py-1.5">
              <span className="font-mono text-[10px] text-slate-400 truncate flex-1">{s.agentId}</span>
              <span className="font-mono text-[9px] text-slate-500 ml-2">{s.tokensOut} tok</span>
            </div>
          ))}
          {snapshots.filter((s) => s.status === 'OK').length === 0 && (
            <div className="text-center py-4 text-[10px] text-slate-600 uppercase tracking-widest">
              No mint events yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
