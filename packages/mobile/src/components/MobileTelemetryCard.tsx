import React from 'react';
import type { MobileTelemetrySnapshot } from '../store/useMobileTelemetryStore';

interface MobileTelemetryCardProps {
  snapshot: MobileTelemetrySnapshot;
  onPress?: () => void;
}

export function MobileTelemetryCard({ snapshot, onPress }: MobileTelemetryCardProps) {
  const statusStyles: Record<string, string> = {
    OK: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    ERROR: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    PENDING: 'border-amber-500/30 bg-amber-500/10 text-amber-400'
  };

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/60 p-3 active:bg-slate-800/50 transition-colors"
      style={{ minHeight: 44 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-300 truncate flex-1">{snapshot.agentId}</span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${statusStyles[snapshot.status] || statusStyles.PENDING}`}>
          {snapshot.status}
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-800/30 px-2 py-1">
          <div className="text-[8px] font-mono text-slate-500 uppercase">Tokens In</div>
          <div className="font-mono text-[11px] text-slate-300 mt-0.5">{snapshot.tokensIn.toLocaleString()}</div>
        </div>
        <div className="rounded-lg bg-slate-800/30 px-2 py-1">
          <div className="text-[8px] font-mono text-slate-500 uppercase">Tokens Out</div>
          <div className="font-mono text-[11px] text-slate-300 mt-0.5">{snapshot.tokensOut.toLocaleString()}</div>
        </div>
        <div className="rounded-lg bg-slate-800/30 px-2 py-1">
          <div className="text-[8px] font-mono text-slate-500 uppercase">Cost</div>
          <div className="font-mono text-[11px] text-slate-300 mt-0.5">${snapshot.cost.toFixed(4)}</div>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-slate-500">
        <span>{snapshot.model} · {snapshot.provider}</span>
        <span className={snapshot.synced ? 'text-emerald-400' : 'text-amber-400'}>
          {snapshot.synced ? 'SYNCED' : 'PENDING'}
        </span>
      </div>
    </button>
  );
}
