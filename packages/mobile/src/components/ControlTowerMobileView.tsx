import React, { useState, useEffect } from 'react';
import { useMobileTelemetryStore } from '../store/useMobileTelemetryStore';
import { MobileTelemetryCard } from './MobileTelemetryCard';
import { MobileGovernanceQueue } from './MobileGovernanceQueue';
import { MobileThinkTokenBadge } from './MobileThinkTokenBadge';

interface ControlTowerMobileProps {
  onNavigate?: (tab: string) => void;
}

export function ControlTowerMobileView({ onNavigate }: ControlTowerMobileProps) {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'governance' | 'tokens'>('telemetry');
  const snapshots = useMobileTelemetryStore((s) => s.snapshots);
  const governanceItems = useMobileTelemetryStore((s) => s.governanceItems);
  const online = useMobileTelemetryStore((s) => s.online);

  const tabs = [
    { key: 'telemetry' as const, label: 'Telemetry', count: snapshots.length },
    { key: 'governance' as const, label: 'Governance', count: governanceItems.filter((g) => g.status === 'PENDING').length },
    { key: 'tokens' as const, label: 'Tokens', count: 0 }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 font-mono min-h-screen">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
          <h1 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Control Tower</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-[10px] text-slate-500">{online ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </header>

      <nav className="flex border-b border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              onNavigate?.(tab.key);
            }}
            className={`flex-1 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === tab.key
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                : 'text-slate-500 border-b-2 border-transparent hover:text-slate-300'
            }`}
            style={{ minHeight: 44 }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[8px] text-emerald-400">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'telemetry' && (
          <div className="space-y-3">
            {snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <span className="text-[10px] uppercase tracking-widest">No telemetry snapshots</span>
              </div>
            ) : (
              snapshots.slice(0, 12).map((s) => (
                <MobileTelemetryCard key={s.id} snapshot={s} />
              ))
            )}
          </div>
        )}

        {activeTab === 'governance' && (
          <MobileGovernanceQueue />
        )}

        {activeTab === 'tokens' && (
          <MobileThinkTokenBadge />
        )}
      </main>

      <footer className="px-4 py-2 border-t border-slate-800 text-center">
        <span className="text-[9px] text-slate-600 uppercase tracking-widest">Kudbee Fuel Gauge v1.0</span>
      </footer>
    </div>
  );
}
