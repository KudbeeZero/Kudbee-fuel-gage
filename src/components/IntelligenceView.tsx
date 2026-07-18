import React from 'react';
import { Globe } from 'lucide-react';
import { GroundedIntelligenceComponent } from './GroundedIntelligenceComponent';

export function IntelligenceView() {
  return (
    <div className="space-y-6">
      {/* VIEW PANEL HEADER */}
      <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-800/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-emerald-500/[0.02] rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-5 h-5 text-emerald-400 animate-pulse drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
          <h1 className="font-display font-bold text-xl text-slate-100 tracking-tight">AI Grounded News Intelligence</h1>
        </div>
        <p className="text-xs text-slate-400">
          Real-time global breakthroughs and regulatory policies, grounded live via Google Search telemetry.
        </p>
      </div>

      {/* NESTED DYNAMIC GROUNDED COMPONENT */}
      <GroundedIntelligenceComponent />
    </div>
  );
}
