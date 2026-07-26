import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Server,
  Shield,
  CheckCircle2,
  XCircle,
  Radio,
  RefreshCw,
  Wifi,
  WifiOff,
  Zap,
  Scale,
} from 'lucide-react';
import { useControlTowerStatus } from '../../hooks/useControlTowerStatus';
import { useAgentTelemetry } from '../../hooks/useAgentTelemetry';
import { useProviderStatus } from '../../hooks/useProviderStatus';
import { useGovernanceHealth } from '../../hooks/useGovernanceHealth';
import { apiGet, apiPost } from '../../lib/apiClient';

interface Proposal {
  id: string;
  action: string;
  tags: string[];
  prompt?: string;
  created_at: string;
}

export default function ControlTowerPanel() {
  const { status: towerStatus, loading: towerLoading, refresh: refreshTower } = useControlTowerStatus(5000);
  const { telemetry, loading: telemLoading, refresh: refreshTelem } = useAgentTelemetry(5000);
  const { providers, loading: provLoading } = useProviderStatus();
  const { health: govHealth } = useGovernanceHealth(5000);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    try {
      const data = await apiGet<Proposal[]>('/api/governance/proposed');
      setProposals(Array.isArray(data) ? data.slice(0, 5) : []);
    } catch {
      setProposals([]);
    }
  }, []);

  useEffect(() => {
    void loadProposals();
    const id = setInterval(() => void loadProposals(), 4000);
    return () => clearInterval(id);
  }, [loadProposals]);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    const previous = proposals;
    setProposals((prev) => prev.filter((p) => p.id !== id));
    try {
      await apiPost('/api/governance/approve', { id });
      await loadProposals();
    } catch {
      setProposals(previous);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    const previous = proposals;
    setProposals((prev) => prev.filter((p) => p.id !== id));
    try {
      await apiPost('/api/governance/reject', { id });
      await loadProposals();
    } catch {
      setProposals(previous);
    } finally {
      setBusyId(null);
    }
  };

  const healthColor = (ok: boolean) => (ok ? 'text-emerald-400' : 'text-rose-400');
  const healthBg = (ok: boolean) => (ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5');
  const provider = providers.find((p) => p.id.toLowerCase().includes('groq')) || providers[0];

  return (
    <div className="space-y-4" id="control-tower-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-base font-semibold text-slate-100">Control Tower</h2>
        </div>
        <button
          onClick={() => { refreshTower(); refreshTelem(); loadProposals(); }}
          className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-[10px] font-mono text-slate-400 transition-colors hover:text-slate-200"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatusCard
          title="System"
          status={towerStatus.status}
          loading={towerLoading}
          icon={<Activity className="h-4 w-4" />}
          details={`Uptime ${formatUptime(towerStatus.uptimeSeconds)}`}
          healthBg={healthBg}
          healthColor={healthColor}
        />
        <StatusCard
          title="Postgres"
          status={towerStatus.postgres.status}
          loading={towerLoading}
          icon={<Server className="h-4 w-4" />}
          details={towerStatus.postgres.latencyMs != null ? `${towerStatus.postgres.latencyMs}ms` : '—'}
          healthBg={healthBg}
          healthColor={healthColor}
        />
        <StatusCard
          title="Redis"
          status={towerStatus.redis.status}
          loading={towerLoading}
          icon={<Radio className="h-4 w-4" />}
          details={towerStatus.redis.latencyMs != null ? `${towerStatus.redis.latencyMs}ms` : '—'}
          healthBg={healthBg}
          healthColor={healthColor}
        />
        <StatusCard
          title="Groq"
          status={provider ? (provider.status === 'OK' ? 'OK' : provider.status === 'DEGRADED' ? 'DEGRADED' : 'OFFLINE') : 'UNKNOWN'}
          loading={provLoading}
          icon={<Zap className="h-4 w-4" />}
          details={provider ? `${provider.measuredLatencyMs != null ? `${provider.measuredLatencyMs}ms` : '—'} · ${provider.id}` : 'No providers'}
          healthBg={healthBg}
          healthColor={healthColor}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-amber-400" />
              <h3 className="font-display text-sm font-semibold text-slate-200">Governance Queue</h3>
            </div>
            {govHealth.proposedCount > 0 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-300">
                {govHealth.proposedCount} pending
              </span>
            )}
          </div>
          {proposals.length === 0 ? (
            <p className="text-xs text-slate-500 font-mono py-6 text-center">No proposed logic actions.</p>
          ) : (
            <div className="space-y-2">
              {proposals.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">{p.id}</span>
                    <p className="text-xs text-slate-300 truncate">{p.action}</p>
                    {p.prompt && <p className="text-[10px] text-slate-500 truncate">{p.prompt}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(p.id)}
                      disabled={busyId === p.id}
                      className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(p.id)}
                      disabled={busyId === p.id}
                      className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-rose-400 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-40"
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-violet-400" />
              <h3 className="font-display text-sm font-semibold text-slate-200">Think-Token Budget</h3>
            </div>
            {telemLoading ? (
              <p className="text-xs text-slate-500 font-mono">Loading…</p>
            ) : (
              <div className="space-y-2">
                <Stat label="Total Tokens" value={telemetry.totalThinkTokens.toLocaleString()} />
                <Stat label="Verified" value={telemetry.verifiedTrajectories.toLocaleString()} />
                <Stat label="Cumulative Cost" value={`$${telemetry.cumulativeTokenCost.toFixed(4)}`} />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              {govHealth.hermes.online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-rose-400" />}
              <h3 className="font-display text-sm font-semibold text-slate-200">HERMES Auditor</h3>
            </div>
            <p className={`text-xs font-mono ${govHealth.hermes.online ? 'text-emerald-400' : 'text-rose-400'}`}>
              {govHealth.hermes.online ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, status, loading, icon, details, healthBg, healthColor }: { title: string; status: string; loading: boolean; icon: React.ReactNode; details: string; healthBg: (ok: boolean) => string; healthColor: (ok: boolean) => string }) {
  const ok = status === 'OK' || status === 'HEALTHY' || status === 'ACTIVE';
  return (
    <div className={`rounded-xl border px-3 py-2.5 transition-colors ${healthBg(ok)}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">{title}</span>
        </div>
        {loading ? (
          <div className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
        ) : (
          <span className={`flex h-2 w-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]'}`} />
        )}
      </div>
      <div className={`mt-1 font-mono text-xl font-bold tabular-nums ${healthColor(ok)}`}>{status}</div>
      <div className="font-mono text-[10px] text-slate-500">{details}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{label}</span>
      <span className="text-sm font-mono font-bold text-slate-200">{value}</span>
    </div>
  );
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}
