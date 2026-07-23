import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  RefreshCw,
  Server,
  ShieldX,
  XCircle,
  Zap,
} from 'lucide-react';
import { useGovernanceStream } from '../../hooks/useGovernanceStream';
import { apiGet, apiPost } from '../../lib/apiClient';
import { useCommandDispatcher, commandRunners } from '../../store/commandDispatcher';
import type { ThinkTrajectory, ApprovalRequest, ApprovalDecision, CrucibleDispatchResponse } from '@kudbee/types';
import type { VectorSyncStatus } from '../../hooks/useVectorSync';

interface ThinkMetrics {
  total_think_tokens: number;
  verified_trajectories: number;
  cumulative_token_cost: number;
}

interface DeepHealthResponse {
  status: 'HEALTHY' | 'DEGRADED';
  timestamp: string;
  services: {
    postgres: { status: 'OK' | 'OFFLINE'; latencyMs: number | null; lastPing: string | null };
    redis: { status: 'OK' | 'OFFLINE'; latencyMs: number | null; lastPing: string | null };
  };
  agent: { status: 'ACTIVE_RUNNING' | 'OFFLINE'; uptimeSeconds: number; pendingTriageCount: number };
  error?: string;
}

type ConfidenceTier = 'green' | 'yellow' | 'red' | 'none';

interface ConfidenceRead {
  label: string;
  tier: ConfidenceTier;
  pct: number;
}

function readConfidence(score: number | undefined | null): ConfidenceRead {
  if (score === undefined || score === null || typeof score !== 'number' || Number.isNaN(score)) {
    return { label: 'N/A', tier: 'none', pct: 0 };
  }
  const clamped = Math.max(0, Math.min(1, score));
  const pct = Math.round(clamped * 100);
  const tier: ConfidenceTier = pct >= 90 ? 'green' : pct >= 80 ? 'yellow' : 'red';
  return { label: `${pct}%`, tier, pct };
}

const CONFIDENCE_TIER_STYLES: Record<ConfidenceTier, string> = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  yellow: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  red: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  none: 'border-slate-700 bg-slate-900/40 text-slate-400'
};

function ConfidenceBadge({ score }: { score: number | undefined | null }) {
  const read = readConfidence(score);
  return (
    <span
      title={read.tier === 'none' ? 'Legacy row — confidence not recorded' : `Agent confidence ${read.label}`}
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${CONFIDENCE_TIER_STYLES[read.tier]}`}
    >
      {read.label}
    </span>
  );
}

function VectorStoreCard() {
  const _mountedRef = useRef(true);
  const [status, setStatus] = useState<VectorSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiGet<VectorSyncStatus>('/api/vector/sync');
      if (!_mountedRef.current) return;
      setStatus(data);
    } catch (e) {
      if (!_mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Vector status unavailable');
      setStatus(null);
    } finally {
      if (_mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    _mountedRef.current = true;
    void load();
    const id = setInterval(() => { void load(); }, 5000);
    return () => {
      _mountedRef.current = false;
      clearInterval(id);
    };
  }, [load]);

  const handleResync = useCallback(async () => {
    setResyncing(true);
    setError(null);
    try {
      await apiPost('/api/vector/sync', {});
      setTimeout(() => { void load(); }, 800);
    } catch (e) {
      if (!_mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Vector sync failed');
    } finally {
      setTimeout(() => { if (_mountedRef.current) setResyncing(false); }, 400);
    }
  }, [load]);

  return (
    <section
      id="vector-store-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-cyan-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Vector Store & RAG Pipeline</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            id="vector-card-state"
            className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${
              status?.state === 'SYNCED'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : status?.state === 'INDEXING'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : status?.state === 'FAILED'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
            }`}
          >
            [{status?.state ?? 'IDLE'}]
          </span>
          <button
            id="vector-card-resync"
            type="button"
            onClick={() => { void handleResync(); }}
            disabled={resyncing}
            className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            <Server className={`h-3 w-3 ${resyncing ? 'animate-spin' : ''}`} />
            {resyncing ? 'Resyncing…' : 'Re-sync'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Total Chunks</div>
          <div className="mt-1 font-mono text-lg font-bold text-cyan-300">
            {loading ? '…' : status?.totalChunks ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Vectors</div>
          <div className="mt-1 font-mono text-lg font-bold text-cyan-300">
            {loading ? '…' : status?.totalVectors ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Recent Documents</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-300">
            {loading ? '…' : status?.recentDocs.length ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Last Sync</div>
          <div className="mt-1 font-mono text-sm font-bold text-slate-300">
            {loading
              ? '…'
              : status?.lastSyncAt
                ? new Date(status.lastSyncAt).toLocaleTimeString()
                : '—'}
          </div>
        </div>
      </div>
      {error && (
        <div className="border-t border-slate-800/60 bg-amber-500/5 px-5 py-2 font-mono text-[10px] text-amber-300">
          {error}
        </div>
      )}
    </section>
  );
}

function ThinkTrajectoriesCard({ trajectories, loading, error }: { trajectories: ThinkTrajectory[]; loading: boolean; error: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="think-trajectories-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Think Trajectories</h3>
        </div>
        <span className="font-mono text-[10px] text-slate-500">vector · 1536-dim</span>
      </div>

      <div className="max-h-[360px] space-y-2 overflow-y-auto overflow-x-hidden p-4">
        {trajectories.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <Brain className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No think token trajectories minted yet.</span>
          </div>
        ) : (
          trajectories.slice(0, 8).map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-violet-300">{t.token_hash}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <ConfidenceBadge score={t.confidence_score} />
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                    t.status === 'VERIFIED'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : t.status === 'RECYCLED'
                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  }`}>
                    {t.status}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>sim {t.similarity_score?.toFixed(4) ?? '—'}</span>
                <span>dims {t.spatial_coordinates?.length ?? 0}</span>
              </div>
              {t.correction_delta && (
                <p className="mt-1.5 truncate text-[10px] text-slate-400">{t.correction_delta}</p>
              )}
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="mx-5 mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-mono text-amber-300">
          <span className="line-clamp-2">{error}</span>
        </div>
      )}
    </div>
  );
}

function TokenMetrics({ metrics, error }: { metrics: ThinkMetrics | null; error: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="token-metrics-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Think Token Metrics</h3>
        </div>
        {!metrics && !error && <span className="text-[10px] font-mono text-slate-500">Probing…</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Brain className="h-4 w-4 text-violet-500/70" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Total Think Tokens</span>
          </div>
          <div className="mt-2 font-mono text-2xl text-slate-100">
            {metrics ? metrics.total_think_tokens.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-[10px] font-mono text-slate-500">Processed</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-500/70" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Verified Trajectories</span>
          </div>
          <div className="mt-2 font-mono text-2xl text-slate-100">
            {metrics ? metrics.verified_trajectories.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-[10px] font-mono text-slate-500">Active</p>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Activity className="h-4 w-4 text-amber-500/70" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Cumulative Pipeline Cost</span>
          </div>
          <div className="mt-2 font-mono text-2xl text-slate-100">
            {metrics ? `$${metrics.cumulative_token_cost.toFixed(4)}` : '—'}
          </div>
          <p className="mt-1 text-[10px] font-mono text-slate-500">Dynamic elastic budget</p>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-mono text-amber-300">
          {error}
        </div>
      )}
    </div>
  );
}

function DispatchPanel({ onDispatched }: { onDispatched: () => void }) {
  const _mountedRef = useRef(true);
  const [dispatching, setDispatching] = useState(false);
  const [lastResult, setLastResult] = useState<CrucibleDispatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDispatch = useCallback(async () => {
    setDispatching(true);
    setError(null);
    setLastResult(null);
    try {
      const { id } = await commandRunners.crucibleDispatch();
      const unsub = useCommandDispatcher.subscribe((state) => {
        if (!_mountedRef.current) { unsub(); return; }
        const cmd = state.commands.find((c) => c.id === id);
        if (!cmd) return;
        if (cmd.state === 'SUCCESS' || cmd.state === 'FAILED') {
          setLastResult({
            success: cmd.state === 'SUCCESS',
            cycle: 0,
            maxCycles: 5,
            traceId: cmd.traceId || '',
            taskId: cmd.kind,
            message: cmd.detail || cmd.description
          });
          unsub();
        }
      });
      onDispatched();
    } catch (e) {
      if (!_mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Dispatch failed');
    } finally {
      if (_mountedRef.current) setDispatching(false);
    }
  }, [onDispatched]);

  useEffect(() => {
    _mountedRef.current = true;
    return () => { _mountedRef.current = false; };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="dispatch-panel-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Manual Dispatch</h3>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[10px] text-slate-400">
          Instant Execution
        </span>
      </div>

      <div className="p-5">
        <p className="text-xs text-slate-400 mb-4">
          Trigger a Crucible reasoning cycle on demand. Failed states are recorded to the Reasoning Ledger and proposed for Think Token minting.
        </p>
        <button
          type="button"
          onClick={() => { void handleDispatch(); }}
          disabled={dispatching}
          className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-xs font-mono font-semibold text-violet-300 transition-all hover:bg-violet-500/20 active:scale-95 disabled:opacity-50"
        >
          <Zap className="h-4 w-4" />
          {dispatching ? 'Dispatching…' : 'Run Crucible Cycle'}
        </button>

        {lastResult && (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-[10px] font-mono ${
            lastResult.success
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold uppercase">{lastResult.success ? 'Dispatched' : 'Failed'}</span>
              <span className="opacity-70">{lastResult.message}</span>
            </div>
            {lastResult.success && (
              <div className="mt-1 text-slate-400">
                Cycle {lastResult.cycle}/{lastResult.maxCycles} · trace {lastResult.traceId}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono text-rose-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function ReasoningLedgerTriage({ proposed, onSubmit, deepHealth }: {
  proposed: ApprovalRequest[];
  onSubmit: (id: string, decision: ApprovalDecision) => Promise<boolean>;
  deepHealth: DeepHealthResponse | null;
}) {
  const _mountedRef = useRef(true);
  const [localBusy, setLocalBusy] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<{ service: string; status: string; latencyMs: number | null; timestamp: string } | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [mintedIds, setMintedIds] = useState<Set<string>>(new Set());

  const runDiagnostic = useCallback(async () => {
    setDiagnosticLoading(true);
    setDiagnostic(null);
    try {
      const data = await apiGet<DeepHealthResponse>('/api/system/health-deep');
      if (!_mountedRef.current) return;
      const offlineServices = [];
      if (data.services.postgres.status === 'OFFLINE') offlineServices.push({ name: 'Neon Postgres', ...data.services.postgres });
      if (data.services.redis.status === 'OFFLINE') offlineServices.push({ name: 'Upstash Redis', ...data.services.redis });

      if (offlineServices.length > 0) {
        const svc = offlineServices[0]!;
        setDiagnostic({
          service: svc.name,
          status: svc.status,
          latencyMs: svc.latencyMs,
          timestamp: data.timestamp
        });
      }
    } catch {
      if (_mountedRef.current) {
        setDiagnostic({ service: 'System', status: 'UNKNOWN', latencyMs: null, timestamp: new Date().toISOString() });
      }
    } finally {
      if (_mountedRef.current) setDiagnosticLoading(false);
    }
  }, []);

  useEffect(() => {
    _mountedRef.current = true;
    return () => { _mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const hasOffline = deepHealth && (deepHealth.services.postgres.status === 'OFFLINE' || deepHealth.services.redis.status === 'OFFLINE');
    if (hasOffline && !diagnostic && !diagnosticLoading) {
      void runDiagnostic();
    }
  }, [deepHealth, diagnostic, diagnosticLoading, runDiagnostic]);

  const handleResolve = async (id: string, decision: ApprovalDecision) => {
    setLocalBusy(id);
    try {
      await onSubmit(id, decision);
    } finally {
      if (_mountedRef.current) setLocalBusy(null);
    }
  };

  const handleMintThinkToken = async (req: ApprovalRequest) => {
    const delta = corrections[req.id]?.trim();
    if (!delta) return;
    setLocalBusy(req.id);
    try {
      await apiPost<{ success: boolean }>('/api/governance/mint-think-token', {
        traceId: req.id,
        taskContext: { task: req.task, reasoning: req.reasoning },
        failedState: { status: req.status, reasoning: req.reasoning },
        correctionDelta: delta
      });
      if (!_mountedRef.current) return;
      setMintedIds((prev) => new Set(prev).add(req.id));
      setCorrections((prev) => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });
    } catch (err) {
      console.error('[MintThinkToken] Failed:', err instanceof Error ? err.message : String(err));
    } finally {
      if (_mountedRef.current) setLocalBusy(null);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="reasoning-ledger-triage">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Reasoning Ledger Triage</h3>
        </div>
        <div className="flex items-center gap-2">
          {diagnostic && (
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
              diagnostic.status === 'OK'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            }`}>
              Probe: {diagnostic.service} {diagnostic.status}
            </span>
          )}
          <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[10px] text-slate-400">
            {proposed.length} pending
          </span>
        </div>
      </div>

      <div className="max-h-[360px] space-y-2 overflow-y-auto overflow-x-hidden p-4">
        {diagnostic && (
          <div className={`rounded-xl border p-3 ${
            diagnostic.status === 'OK'
              ? 'border-emerald-500/15 bg-emerald-500/5'
              : 'border-rose-500/15 bg-rose-500/5'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className={`h-3.5 w-3.5 ${diagnostic.status === 'OK' ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-300">
                  Auto-Diagnostic: {diagnostic.service}
                </span>
              </div>
              <span className={`font-mono text-[9px] uppercase ${
                diagnostic.status === 'OK' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {diagnostic.status}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-slate-400">
              Probe completed at {new Date(diagnostic.timestamp).toLocaleTimeString()}
              {diagnostic.latencyMs !== null && ` · ${diagnostic.latencyMs}ms`}
            </p>
            {diagnostic.status === 'OFFLINE' && (
              <p className="mt-1 font-mono text-[9px] text-rose-300">
                Service is currently unreachable. Check network/auth configuration.
              </p>
            )}
          </div>
        )}

        {diagnosticLoading && (
          <div className="flex items-center justify-center gap-2 py-3 text-slate-500">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span className="font-mono text-[10px]">Running auto-diagnostic probe…</span>
          </div>
        )}

        {proposed.length === 0 && !diagnostic && !diagnosticLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <CheckCircle2 className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No pending reasoning issues.</span>
          </div>
        )}
        {proposed.filter((req) => !mintedIds.has(req.id)).map((req) => (
          <div key={req.id} className="space-y-2 rounded-xl border border-violet-500/15 bg-slate-950/40 p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
              <span className="text-slate-400">
                model <span className="text-violet-200">{req.proposed_model}</span>
              </span>
              {req.agent_id && <span className="text-slate-500">agent {req.agent_id}</span>}
            </div>
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/50 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
              {req.reasoning || '(no reasoning provided)'}
            </p>
            <textarea
              value={corrections[req.id] || ''}
              onChange={(e) => setCorrections((prev) => ({ ...prev, [req.id]: e.target.value }))}
              placeholder="Human Correction (Delta)"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/50 p-2 font-mono text-[10px] text-slate-300 placeholder-slate-600 focus:border-violet-500/50 focus:outline-none"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={localBusy === req.id || !corrections[req.id]?.trim()}
                onClick={() => { void handleMintThinkToken(req); }}
                className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[10px] font-mono font-semibold text-violet-300 transition-all hover:bg-violet-500/20 active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mint Think Token
              </button>
              <button
                type="button"
                disabled={localBusy === req.id}
                onClick={() => { void handleResolve(req.id, 'REJECT'); }}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono font-semibold text-rose-300 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThinkTokensPanel() {
  const _mountedRef = useRef(true);
  const { pending: pendingApprovals, submitApproval } = useGovernanceStream();

  const [trajectories, setTrajectories] = useState<ThinkTrajectory[]>([]);
  const [trajectoriesError, setTrajectoriesError] = useState<string | null>(null);
  const [trajectoriesLoading, setTrajectoriesLoading] = useState(true);

  const [thinkMetrics, setThinkMetrics] = useState<ThinkMetrics | null>(null);
  const [thinkMetricsError, setThinkMetricsError] = useState<string | null>(null);

  const loadTrajectories = useCallback(async () => {
    try {
      const data = await apiGet<{ count: number; trajectories: ThinkTrajectory[] }>('/api/think/trajectories?limit=25');
      if (!_mountedRef.current) return;
      setTrajectories(Array.isArray(data?.trajectories) ? data.trajectories : []);
      setTrajectoriesError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setTrajectoriesError(e instanceof Error ? e.message : 'Trajectories fetch failed');
    } finally {
      if (_mountedRef.current) setTrajectoriesLoading(false);
    }
  }, []);

  const loadThinkMetrics = useCallback(async () => {
    try {
      const data = await apiGet<ThinkMetrics>('/api/think/metrics');
      if (!_mountedRef.current) return;
      setThinkMetrics(data);
      setThinkMetricsError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setThinkMetricsError(e instanceof Error ? e.message : 'Think metrics fetch failed');
      setThinkMetrics(null);
    }
  }, []);

  useEffect(() => {
    _mountedRef.current = true;
    void loadTrajectories();
    void loadThinkMetrics();

    const pollTraj = setInterval(() => { void loadTrajectories(); }, 10_000);
    const pollMetrics = setInterval(() => { void loadThinkMetrics(); }, 5000);

    return () => {
      _mountedRef.current = false;
      clearInterval(pollTraj);
      clearInterval(pollMetrics);
    };
  }, [loadTrajectories, loadThinkMetrics]);

  const handleDispatched = useCallback(() => {
    void loadTrajectories();
    void loadThinkMetrics();
  }, [loadTrajectories, loadThinkMetrics]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <VectorStoreCard />
      </div>
      <DispatchPanel onDispatched={handleDispatched} />

      <div className="lg:col-span-2">
        <ThinkTrajectoriesCard trajectories={trajectories} loading={trajectoriesLoading} error={trajectoriesError} />
      </div>
      <TokenMetrics metrics={thinkMetrics} error={thinkMetricsError} />

      <div className="lg:col-span-3">
        <ReasoningLedgerTriage
          proposed={pendingApprovals}
          onSubmit={(id, decision) => submitApproval(id, decision)}
          deepHealth={null}
        />
      </div>
    </div>
  );
}

export default ThinkTokensPanel;
