/**
 * apps/web/src/components/plugins/ThinkStoragePlugin.tsx
 * ---------------------------------------------------------------------------
 * DAW-style "Think: Storage" plugin (4-col). Mocks a circular capacity gauge
 * for the Neon Postgres DB (placeholder telemetry: used vs. provisioned).
 *
 * Strictly typed — no `any`.
 */
import { useState, useEffect } from 'react';

interface StorageStats {
  usedMb: number;
  capacityMb: number;
  rows: number;
}

// Placeholder telemetry — in production this would come from a Neon usage
// endpoint. We simulate a slowly-growing used capacity for the gauge.
function mockStats(): StorageStats {
  const capacityMb = 512;
  const usedMb = Math.min(capacityMb, 180 + Math.round(Math.random() * 40));
  return { usedMb, capacityMb, rows: 12000 + Math.round(Math.random() * 400) };
}

export function ThinkStoragePlugin() {
  const [stats, setStats] = useState<StorageStats>(mockStats);

  useEffect(() => {
    const id = setInterval(() => setStats(mockStats()), 5000);
    return () => clearInterval(id);
  }, []);

  const pct = Math.min(100, Math.round((stats.usedMb / stats.capacityMb) * 100));
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-emerald-500/25 bg-slate-900/60 p-4">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-emerald-200">
            Think: Storage
          </h3>
        </div>
        <span className="font-mono text-[9px] text-slate-500">neon · mock</span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={radius} className="fill-none stroke-slate-800" strokeWidth="7" />
            <circle
              cx="48"
              cy="48"
              r={radius}
              className="fill-none stroke-emerald-400 transition-all duration-700"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute text-center">
            <div className="font-mono text-lg font-semibold text-emerald-300">{pct}%</div>
            <div className="font-mono text-[8px] uppercase text-slate-500">used</div>
          </div>
        </div>

        <div className="flex-1 space-y-1.5 font-mono text-[10px] text-slate-400">
          <div className="flex justify-between">
            <span>used</span>
            <span className="text-emerald-300">{stats.usedMb} MB</span>
          </div>
          <div className="flex justify-between">
            <span>capacity</span>
            <span>{stats.capacityMb} MB</span>
          </div>
          <div className="flex justify-between">
            <span>rows</span>
            <span className="text-slate-300">{stats.rows.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>ttl</span>
            <span className="text-amber-300">30d</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThinkStoragePlugin;
