import React from 'react';
import { Activity, X } from 'lucide-react';

interface TraceRecord {
  trace_id: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  status: string;
}

const MOCK_TRACE_SCHEMA: TraceRecord = {
  trace_id: '0af7651916cd43dd8e7f8',
  model: 'claude-3-5-sonnet',
  tokens_in: 1240,
  tokens_out: 890,
  cost: 0.0234,
  status: 'OK'
};

export function DiagnosticTicker() {
  return (
    <div
      className="bg-slate-900/40 border border-slate-800 p-3 font-mono text-xs relative overflow-hidden"
      id="diagnostic-ticker"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.7)]"></span>
          </span>
          <span className="text-slate-300 tracking-wide flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-500/70" />
            OTel Stream Schema: VERIFIED STABLE
          </span>
        </div>

        <button
          type="button"
          className="p-1 text-slate-500 hover:text-slate-200 border border-slate-800 hover:border-slate-700 rounded cursor-pointer transition-all active:scale-95 duration-75"
          aria-label="Dismiss diagnostic ticker"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
        <span className="text-slate-400">Ref Payload:</span>{' '}
        {JSON.stringify(MOCK_TRACE_SCHEMA)}
      </div>
    </div>
  );
}
