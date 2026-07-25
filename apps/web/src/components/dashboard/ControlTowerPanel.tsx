import React from 'react';
import { useControlTowerStatus } from '../../hooks/useControlTowerStatus';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

export function ControlTowerPanel() {
  const { zones, loading, error } = useControlTowerStatus();

  const activeCount = zones.filter((z) => z.status === 'ACTIVE').length;
  const breachedCount = zones.filter((z) => z.status === 'BREACHED').length;
  const lockedCount = zones.filter((z) => z.status === 'LOCKED').length;

  return (
    <div className="bg-slate-900/40 border border-slate-800 p-4 font-mono text-xs">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-300 tracking-wide flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-indigo-500/70" />
          Control Tower
        </span>
        <div className="flex gap-3 text-[10px]">
          <span className="text-emerald-400">{activeCount} ACTIVE</span>
          <span className="text-amber-400">{breachedCount} BREACHED</span>
          <span className="text-rose-400">{lockedCount} LOCKED</span>
        </div>
      </div>

      {loading && <div className="text-slate-500">Probing zones…</div>}
      {error && <div className="text-rose-400">{error}</div>}
      {!loading && !error && zones.length === 0 && (
        <div className="text-slate-600">No zones registered.</div>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {zones.map((zone) => (
          <div
            key={zone.zoneId}
            className="flex items-center justify-between bg-slate-800/30 border border-slate-700/50 px-2 py-1 rounded"
          >
            <span className="text-slate-400 truncate flex-1">{zone.zoneId}</span>
            <span
              className={`flex items-center gap-1 ml-2 ${
                zone.status === 'ACTIVE'
                  ? 'text-emerald-400'
                  : zone.status === 'BREACHED'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {zone.status === 'ACTIVE' && <ShieldCheck className="w-3 h-3" />}
              {zone.status === 'BREACHED' && <ShieldAlert className="w-3 h-3" />}
              {zone.status === 'LOCKED' && <ShieldX className="w-3 h-3" />}
              {zone.status}
            </span>
            <span className="text-slate-500 ml-2 tabular-nums">
              {(zone.threatScore * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
