import React from 'react';
import { useControlTowerStatus } from '../../hooks/useControlTowerStatus';
import { useControlTowerStore } from '../../store/useControlTowerStore';
import { ShieldAlert, ShieldCheck, ShieldX, Scale, ArrowRightLeft, Clock, Gauge } from 'lucide-react';

function RiskBadge({ level }: { level: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const styles = {
    LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    HIGH: 'border-rose-500/30 bg-rose-500/10 text-rose-400'
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${styles[level]}`}>
      {level}
    </span>
  );
}

export function ControlTowerPanel() {
  const { zones, loading, error } = useControlTowerStatus();
  const proposals = useControlTowerStore((s) => s.governanceProposals);
  const thinkRecords = useControlTowerStore((s) => s.thinkTokenRecords);
  const groqMetrics = useControlTowerStore((s) => s.groqMetrics);

  const activeCount = zones.filter((z) => z.status === 'ACTIVE').length;
  const breachedCount = zones.filter((z) => z.status === 'BREACHED').length;
  const lockedCount = zones.filter((z) => z.status === 'LOCKED').length;

  const pendingProposals = proposals.filter((p) => p.status === 'PENDING');
  const mintVelocity = thinkRecords.length;
  const avgLatency = groqMetrics.length > 0
    ? Math.round(groqMetrics.reduce((sum, m) => sum + m.latencyMs, 0) / groqMetrics.length)
    : null;

  return (
    <div className="bg-slate-900/40 border border-slate-800 p-4 font-mono text-xs rounded-xl">
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
      {error && <div className="text-rose-400 text-[10px] mb-2">{error}</div>}
      {!loading && !error && zones.length === 0 && (
        <div className="text-slate-600">No zones registered.</div>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3">
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

      {pendingProposals.length > 0 && (
        <div className="border-t border-slate-800/60 pt-3 mt-2">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Scale className="w-3.5 h-3.5 text-amber-400/70" />
            <span className="uppercase tracking-widest text-[10px]">Pending Governance</span>
            <span className="ml-auto rounded-full bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[9px] text-amber-400 font-bold">
              {pendingProposals.length}
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {pendingProposals.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-slate-800/20 border border-slate-700/50 px-2 py-1 rounded">
                <span className="text-slate-400 text-[10px] truncate">{p.action}</span>
                <div className="flex items-center gap-1.5">
                  <RiskBadge level={p.riskLevel} />
                  <span className="text-slate-600 text-[9px]">
                    {new Date(p.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-slate-800/60 pt-3 mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="flex items-center gap-1.5 text-slate-500">
          <ArrowRightLeft className="w-3 h-3 text-cyan-400/70" />
          <span>GROQ routes: {groqMetrics.length}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Gauge className="w-3 h-3 text-violet-400/70" />
          <span>Think tokens: {mintVelocity}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Clock className="w-3 h-3 text-amber-400/70" />
          <span>Avg lat: {avgLatency !== null ? `${avgLatency}ms` : '—'}</span>
        </div>
      </div>
    </div>
  );
}
