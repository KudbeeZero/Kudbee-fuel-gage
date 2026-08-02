/**
 * OPS-013 — Cost Dashboard Frontend
 */

import { useState } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';

interface CostData {
  date: string;
  totalCost: number;
  byCategory: Record<string, number>;
  byProvider: Record<string, number>;
  byAgent: Record<string, number>;
  sessionCost: number;
  dailyBudget: number;
  monthlyProjection: number;
  budgetRemaining: number;
  budgetHealth: string;
}

interface Optimization {
  recommendation: string;
  estimatedSavingsUsd: number;
  confidence: number;
}

interface CostDashboardProps { costs?: CostData; optimizations?: Optimization[] }

export function CostDashboard({ costs: external, optimizations: externalOpts }: CostDashboardProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['providers']));
  const costs = external ?? {
    date: new Date().toISOString().split('T')[0], totalCost: 0.00, sessionCost: 0.00,
    byCategory: { provider: 0.00, agent: 0.00 }, byProvider: { deepseek: 0.00 }, byAgent: { KILOH: 0.00 },
    dailyBudget: 1.00, monthlyProjection: 0.00, budgetRemaining: 1.00, budgetHealth: 'green',
  };
  const opts = externalOpts ?? [{ recommendation: 'Budget healthy — $0.00 spent today', estimatedSavingsUsd: 0, confidence: 1, evidence: 'No provider calls in sandbox' }];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10"><DollarSign className="w-3.5 h-3.5 text-emerald-400" /></div>
          <div><h3 className="font-display text-sm font-semibold text-slate-200">Cost Intelligence</h3><p className="text-[10px] text-slate-500">{costs.date}</p></div>
        </div>
        <span className={`text-[9px] px-2 py-1 rounded-full font-mono ${costs.budgetHealth === 'green' ? 'bg-emerald-500/10 text-emerald-400' : costs.budgetHealth === 'yellow' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{costs.budgetHealth}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[{ l: 'Today', v: `$${costs.totalCost.toFixed(3)}` }, { l: 'Session', v: `$${costs.sessionCost.toFixed(3)}` }, { l: 'Budget', v: `$${costs.budgetRemaining.toFixed(2)}` }, { l: 'Monthly Est.', v: `$${costs.monthlyProjection.toFixed(2)}` }].map(s => (
          <div key={s.l} className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-3 text-center">
            <div className="text-[8px] text-slate-500 uppercase">{s.l}</div>
            <div className="text-sm font-display font-bold text-slate-200">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {Object.entries(costs.byProvider).map(([p, c]) => (
          <div key={p} className="flex items-center justify-between text-[10px] p-1.5 rounded border border-slate-800/40 bg-slate-950/40">
            <span className="text-slate-300 font-mono">{p}</span>
            <span className="text-slate-400">${c.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {opts.map((o, i) => (
        <div key={i} className="flex items-start gap-2 text-[10px] p-2 rounded border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
          <div><div className="text-slate-300">{o.recommendation}</div><div className="text-[9px] text-slate-600 mt-0.5">Save ~${o.estimatedSavingsUsd.toFixed(3)} · {Math.round(o.confidence * 100)}% confidence</div></div>
        </div>
      ))}
    </div>
  );
}
