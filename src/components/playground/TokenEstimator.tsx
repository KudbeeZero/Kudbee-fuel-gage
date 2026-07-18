import React from 'react';
import { Sparkles } from 'lucide-react';

interface TokenEstimatorProps {
  charCount: number;
  tokenCount: number;
}

export function TokenEstimator({ charCount, tokenCount }: TokenEstimatorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/60">
        <span className="block text-[10px] font-mono uppercase text-slate-500">Character Length</span>
        <span className="font-mono text-xl text-slate-200">{charCount.toLocaleString()}</span>
      </div>
      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/60 relative overflow-hidden">
        <div className="absolute right-2 bottom-1 text-emerald-500/10"><Sparkles className="w-12 h-12" /></div>
        <span className="block text-[10px] font-mono uppercase text-slate-500">Estimated Tokens</span>
        <span className="font-mono text-xl text-emerald-400 font-bold">{tokenCount.toLocaleString()}</span>
      </div>
    </div>
  );
}
