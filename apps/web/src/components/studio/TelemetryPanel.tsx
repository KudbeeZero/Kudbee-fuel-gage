import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Brain,
  CircleDot,
  Clock,
  Cpu,
  Database,
  Gauge,
  HeartPulse,
  MemoryStick,
  Pause,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useEventStream } from '../../hooks/useEventStream';
import { useDegradationStatus, type DegradationStatus } from '../../hooks/useDegradationStatus';
import { apiGet, apiPost, apiUrl } from '../../lib/apiClient';
import type { TelemetryStats } from '@kudbee/types';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service?: string;
  phase?: string;
  uptime_sec?: number;
  timestamp?: string;
  dependencies?: { ingestion_db?: string; vector_memory?: string };
}

interface HealthCheckResponse {
  uptime_sec: number;
  community_value_score: string;
  alerts: Array<{ timestamp?: number; severity?: string; message?: string }>;
}

interface DeepServiceStatus {
  status: 'OK' | 'OFFLINE';
  latencyMs: number | null;
  lastPing: string | null;
}

interface AgentVitals {
  status: 'ACTIVE_RUNNING' | 'OFFLINE';
  uptimeSeconds: number;
  pendingTriageCount: number;
}

interface DeepHealthResponse {
  status: 'HEALTHY' | 'DEGRADED';
  timestamp: string;
  services: {
    postgres: DeepServiceStatus;
    redis: DeepServiceStatus;
  };
  agent: AgentVitals;
  error?: string;
}

interface ModelComparatorResult {
  status: string;
  provider: string;
  model: string;
  output: string;
  latencyMs: number;
  usage?: { promptTokens: number; completionTokens: number };
  traceId: string;
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

const CONFIDENCE_BAR_STYLES: Record<ConfidenceTier, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
  none: 'bg-slate-700'
};

function StatusDot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {live && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex rounded-full h-3 w-3 ${
          live ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]' : 'bg-rose-500'
        }`}
      />
    </span>
  );
}

function formatUptime(sec?: number): string {
  if (!sec) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function DependencyBadge({ label, state }: { label: string; state: string }) {
  const ok = state === 'healthy';
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide ${
        ok
          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
          : 'border-rose-500/20 bg-rose-500/5 text-rose-400'
      }`}
    >
      <CircleDot className="h-3 w-3" />
      {label}
      <span className="ml-auto opacity-70">{ok ? 'OK' : state}</span>
    </div>
  );
}

function HealthPanel({
  health,
  loading,
  error,
  lastEvent
}: {
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
  lastEvent?: { time: string; reason: string; service: string } | null;
}) {
  const live = health?.status === 'ok' || health?.status === 'degraded';
  const degraded = health?.status === 'degraded';
  const wasOffline = !live && lastEvent;

  return (
    <div
      id="system-health-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
            System Health
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot live={live} />
          <span
            className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
              live ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {loading ? 'Probing…' : live ? (degraded ? 'Degraded' : 'Live') : 'Offline'}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border ${
            live
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {live ? <Wifi className="h-9 w-9" /> : <WifiOff className="h-9 w-9" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-3xl font-bold ${
                live ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {live ? '100' : '000'}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 100 service score</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">
            {live
              ? `Control Tower online · ${health?.service ?? 'kudbee'}`
              : 'No heartbeat received from backend. Check CORS / REACT_APP_API_URL.'}
          </p>
          {wasOffline && lastEvent && (
            <p className="mt-1 truncate text-[10px] font-mono text-amber-400">
              Status: ONLINE (Last event: {new Date(lastEvent.time).toLocaleTimeString()} - {lastEvent.reason})
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <DependencyBadge
              label="Ingestion DB"
              state={health?.dependencies?.ingestion_db ?? (live ? 'healthy' : 'unknown')}
            />
            <DependencyBadge
              label="Vector Memory"
              state={health?.dependencies?.vector_memory ?? (live ? 'healthy' : 'unknown')}
            />
          </div>
        </div>
      </div>

      {health?.uptime_sec !== undefined && (
        <div className="mt-4 flex items-center gap-2 border-t border-slate-800/60 pt-3 text-[11px] font-mono text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Uptime {formatUptime(health.uptime_sec)}
          <span className="ml-auto">{health.timestamp}</span>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono text-rose-300">
          <span className="line-clamp-2">{error}</span>
        </div>
      )}
    </div>
  );
}

function DegradationBanner({ status, loading, error }: { status: DegradationStatus | null; loading: boolean; error: string | null }) {
  if (loading && !status) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-[10px] font-mono text-slate-500">
        Probing subsystem health…
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[10px] font-mono text-amber-300">
        {error}
      </div>
    );
  }

  if (!status) return null;

  const overall = status.overall;
  const isCritical = overall === 'CRITICAL';
  const isDegraded = overall === 'DEGRADED';

  const borderClass = isCritical
    ? 'border-rose-500/40 bg-rose-500/10'
    : isDegraded
      ? 'border-amber-500/30 bg-amber-500/10'
      : 'border-emerald-500/20 bg-emerald-500/5';

  const textClass = isCritical
    ? 'text-rose-300'
    : isDegraded
      ? 'text-amber-300'
      : 'text-emerald-300';

  const iconClass = isCritical
    ? 'text-rose-400'
    : isDegraded
      ? 'text-amber-400'
      : 'text-emerald-400';

  const subsystems = status.subsystems;
  const degradedItems = [
    { key: 'neon', label: 'Neon', ...subsystems.neon },
    { key: 'redis', label: 'Redis', ...subsystems.redis },
    { key: 'pgvector', label: 'pgvector', ...subsystems.pgvector }
  ].filter((s) => !s.primary);

  return (
    <div className={`rounded-xl border px-4 py-2.5 ${borderClass}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest ${textClass}`}>
          <Activity className={`h-3.5 w-3.5 ${iconClass}`} />
          {overall}
        </span>
        <span className="text-[10px] font-mono text-slate-500">
          Last check: {new Date(status.timestamp).toLocaleTimeString()}
        </span>
        {degradedItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {degradedItems.map((item) => (
              <span
                key={item.key}
                className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                  item.path === 'FALLBACK'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                {item.label}: {item.path}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4 text-emerald-500/70" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-2 font-mono text-2xl text-slate-100">
        {value}
        {suffix && <span className="ml-1 text-base text-emerald-500/50">{suffix}</span>}
      </div>
    </div>
  );
}

function SinkTokenCard({ balance, loaded }: { balance: number; loaded: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round((balance / 1000) * 100)));
  const hue = pct > 60 ? 'text-emerald-400' : pct > 30 ? 'text-amber-400' : 'text-rose-400';
  const bar = pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500';
  const status = loaded ? (pct > 60 ? 'HEALTHY' : pct > 30 ? 'DEGRADED' : 'CRITICAL') : 'UNKNOWN';
  const statusColor = loaded ? (pct > 60 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : pct > 30 ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-rose-500/30 bg-rose-500/10 text-rose-400') : 'border-slate-600/30 bg-slate-800/10 text-slate-500';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500">
          <Gauge className="h-4 w-4 text-violet-500/70" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">Sink Token Balance</span>
        </div>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${statusColor}`}>
          {status}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-slate-100">{balance.toLocaleString()}</span>
        <span className="text-xs font-mono text-slate-500">/ 1,000 tok</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[10px] font-mono text-slate-500">Rate-limit / budget circuit breaker for agent execution</p>
    </div>
  );
}

function StorageGaugeCard({ bytes, label, icon: Icon, thresholdBytes }: { bytes: number | null; label: string; icon: typeof Database; thresholdBytes: number }) {
  const loading = bytes === null;
  const displayBytes = bytes ?? 0;
  const pct = Math.max(0, Math.min(100, Math.round((displayBytes / thresholdBytes) * 100)));
  const bar = pct > 80 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500';
  const status = loading ? 'PENDING' : pct > 80 ? 'CRITICAL' : pct > 50 ? 'DEGRADED' : 'HEALTHY';
  const statusColor = loading ? 'border-slate-600/30 bg-slate-600/10 text-slate-500' : pct > 80 ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : pct > 50 ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500">
          <Icon className="h-4 w-4 text-cyan-500/70" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
        </div>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${statusColor}`}>
          {status}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-slate-100">{loading ? '\u2014' : formatBytes(displayBytes)}</span>
        {loading && <span className="text-[11px] font-mono text-slate-500 animate-pulse">loading...</span>}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${loading ? 'bg-slate-700 animate-pulse' : bar} transition-all duration-500`} style={{ width: `${loading ? 100 : pct}%` }} />
      </div>
      <p className="mt-2 text-[10px] font-mono text-slate-500">Threshold: {formatBytes(thresholdBytes)}</p>
    </div>
  );
}

function TelemetryGauges({ stats, loading, error }: { stats: TelemetryStats | null; loading: boolean; error: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="telemetry-gauges-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Live OS Telemetry</h3>
        </div>
        {loading && <span className="text-[10px] font-mono text-slate-500">Probing…</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Server className="h-4 w-4 text-cyan-500/70" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Vector Memories</span>
          </div>
          <div className="mt-2 font-mono text-2xl text-slate-100">
            {stats ? stats.vector_memory_count.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-[10px] font-mono text-slate-500">HNSW embeddings stored</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Brain className="h-4 w-4 text-violet-500/70" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Think Tokens Minted</span>
          </div>
          <div className="mt-2 font-mono text-2xl text-slate-100">
            {stats ? stats.think_tokens_minted.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-[10px] font-mono text-slate-500">Correction deltas forged</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Activity className="h-4 w-4 text-amber-500/70" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Crucible Health</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl text-slate-100">
              {stats ? `${stats.crucible.cycleCount}/${stats.crucible.maxCycles}` : '—'}
            </span>
            {stats && (
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                stats.crucible.status === 'ACTIVE'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : stats.crucible.status === 'EXHAUSTED'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                    : 'border-slate-700 bg-slate-900/40 text-slate-400'
              }`}>
                {stats.crucible.status}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] font-mono text-slate-500">Circuit breaker cycles</p>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-mono text-amber-300">
          <span className="line-clamp-2">{error}</span>
        </div>
      )}
    </div>
  );
}

function ConfidenceGaugeCard({ score }: { score: number | undefined | null }) {
  const read = readConfidence(score);
  const stateLabel =
    read.tier === 'red'
      ? 'PAUSED · UNCERTAIN'
      : read.tier === 'none'
        ? 'NO DATA'
        : read.tier === 'yellow'
          ? 'REVIEW'
          : 'CONFIDENT';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="confidence-gauge-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-emerald-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Uncertainty Gate</h3>
        </div>
        {read.tier === 'red' ? (
          <span className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase text-rose-400">
            <Pause className="h-3 w-3" /> Held
          </span>
        ) : (
          <span className="font-mono text-[10px] text-slate-500">≥80% clears gate</span>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-3xl text-slate-100">{read.label}</div>
            <p className="mt-1 text-[10px] font-mono text-slate-500">Latest agent confidence_score</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${CONFIDENCE_TIER_STYLES[read.tier]}`}>
            {stateLabel}
          </span>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-500 ${CONFIDENCE_BAR_STYLES[read.tier]}`}
            style={{ width: `${read.tier === 'none' ? 100 : read.pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-slate-600">
          <span>0%</span>
          <span className="text-amber-500/70">80% gate</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

function ServiceBadge({ label, status, latencyMs, lastPing }: { label: string; status: 'OK' | 'OFFLINE'; latencyMs: number | null; lastPing: string | null }) {
  const ok = status === 'OK';
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
      ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'
    }`}>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {ok && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </span>
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="ml-auto flex items-center gap-3 text-[10px] font-mono text-slate-500">
        <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>{status}</span>
        {ok && latencyMs !== null && <span className="text-slate-500">{latencyMs}ms</span>}
        {lastPing && <span className="text-slate-600">{new Date(lastPing).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

function DeepHealthPanel({ data, loading, error }: { data: DeepHealthResponse | null; loading: boolean; error: string | null }) {
  const overallOk = data?.status === 'HEALTHY';
  const degraded = data?.status === 'DEGRADED';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5" id="deep-health-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan-400" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
            Database Vitals
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="text-[10px] font-mono text-slate-500">Probing…</span>}
          {!loading && data && (
            <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
              overallOk ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {degraded ? 'Degraded' : overallOk ? 'Healthy' : 'Offline'}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <ServiceBadge
          label="Neon Postgres"
          status={data?.services.postgres.status ?? 'OFFLINE'}
          latencyMs={data?.services.postgres.latencyMs ?? null}
          lastPing={data?.services.postgres.lastPing ?? null}
        />
        <ServiceBadge
          label="Upstash Redis"
          status={data?.services.redis.status ?? 'OFFLINE'}
          latencyMs={data?.services.redis.latencyMs ?? null}
          lastPing={data?.services.redis.lastPing ?? null}
        />
      </div>

      {data?.agent && (
        <div className="mt-4 flex items-center gap-4 border-t border-slate-800/60 pt-3">
          <div className="flex items-center gap-2">
            <HeartPulse className={`h-4 w-4 ${data.agent.status === 'ACTIVE_RUNNING' ? 'text-emerald-400' : 'text-rose-400'}`} />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">
              Agent Loop
            </span>
          </div>
          <span className={`text-[10px] font-mono font-bold uppercase ${
            data.agent.status === 'ACTIVE_RUNNING' ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {data.agent.status === 'ACTIVE_RUNNING' ? 'Online' : 'Offline'}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Uptime {formatUptime(data.agent.uptimeSeconds)}
          </span>
          <span className="ml-auto text-[10px] font-mono text-slate-500">
            {data.agent.pendingTriageCount} pending
          </span>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono text-rose-300">
          <span className="line-clamp-2">{error}</span>
        </div>
      )}

      {data?.error && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-mono text-amber-300">
          <span className="line-clamp-2">{data.error}</span>
        </div>
      )}
    </div>
  );
}

function SystemStatusCard({ data, loading, error }: { data: HealthCheckResponse | null; loading: boolean; error: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500">
          <Activity className="h-4 w-4 text-amber-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">System Status</span>
        </div>
        {loading && <span className="text-[10px] font-mono text-slate-500">Loading…</span>}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Uptime</div>
          <div className="mt-1 font-mono text-xl text-slate-100">
            {data ? formatUptime(data.uptime_sec) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Community Value</div>
          <div className="mt-1 font-mono text-xl text-slate-100">
            {data ? Number(data.community_value_score).toFixed(2) : '—'}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">Recent Alerts</span>
        </div>
        <div className="mt-2 max-h-[140px] space-y-1.5 overflow-y-auto overflow-x-hidden">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-mono text-rose-300">
              {error}
            </div>
          )}
          {!error && !data && (
            <div className="text-[11px] font-mono text-slate-600">No alert data available.</div>
          )}
          {data && data.alerts.length === 0 && (
            <div className="text-[11px] font-mono text-slate-600">No alerts in the last 5 entries.</div>
          )}
          {data && data.alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`rounded-lg border px-3 py-2 text-[11px] font-mono ${
                alert.severity === 'CRITICAL'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold uppercase">{alert.severity ?? 'INFO'}</span>
                <span className="text-[9px] opacity-70">
                  {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
              <p className="mt-1 line-clamp-2">{alert.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModelComparator({ result, loading, error, provider, onProviderChange, onRun }: {
  result: ModelComparatorResult | null;
  loading: boolean;
  error: string | null;
  provider: 'gemini' | 'vllm';
  onProviderChange: (provider: 'gemini' | 'vllm') => void;
  onRun: () => void;
}) {
  const isUnreachable = result?.status === 'PROVIDER_UNREACHABLE';
  const isOk = result?.status === 'OK';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5" id="model-comparator-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-amber-400" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
            Live Reasoning Comparator
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as 'gemini' | 'vllm')}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[10px] font-mono text-slate-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="gemini">Gemini-1.5-Pro</option>
            <option value="vllm">Local-VLLM</option>
          </select>
          <button
            type="button"
            onClick={() => { void onRun(); }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-mono font-semibold text-amber-300 transition-all hover:bg-amber-500/20 active:scale-95 disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            {loading ? 'Running…' : 'Test Reasoning'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {!result && !error && !loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-600">
            <Cpu className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">Select a provider and run a reasoning test.</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="font-mono text-xs">Running inference…</span>
          </div>
        )}

        {error && !result && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono text-rose-300">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                isUnreachable
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}>
                {isUnreachable ? 'Provider Unreachable' : isOk ? 'Success' : result.status}
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {result.provider} · {result.model}
              </span>
              <span className="ml-auto font-mono text-[10px] text-slate-500">
                {result.latencyMs}ms
              </span>
            </div>

            {result.error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono text-rose-300">
                {result.error}
              </div>
            )}

            {result.output && (
              <pre className="max-h-[200px] overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-[10px] leading-relaxed text-slate-400">
                {result.output}
              </pre>
            )}

            {result.traceId && (
              <div className="font-mono text-[9px] text-slate-600">
                trace {result.traceId}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TelemetryPanel() {
  const _mountedRef = useRef(true);
  const stream = useEventStream();
  const { status: degradation, loading: degradationLoading, error: degradationError } = useDegradationStatus();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [systemStatus, setSystemStatus] = useState<HealthCheckResponse | null>(null);
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(true);

  const [deepHealth, setDeepHealth] = useState<DeepHealthResponse | null>(null);
  const [deepHealthError, setDeepHealthError] = useState<string | null>(null);
  const [deepHealthLoading, setDeepHealthLoading] = useState(true);

  const [lastEvent, setLastEvent] = useState<{ time: string; reason: string; service: string } | null>(null);

  const [comparisonResult, setComparisonResult] = useState<ModelComparatorResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'vllm'>('gemini');

  const [telemetryStats, setTelemetryStats] = useState<TelemetryStats | null>(null);
  const [telemetryStatsError, setTelemetryStatsError] = useState<string | null>(null);
  const [telemetryStatsLoading, setTelemetryStatsLoading] = useState(true);

  const [sinkTokenBalance, setSinkTokenBalance] = useState<number>(0);
  const [sinkLoaded, setSinkLoaded] = useState(false);
  const [postgresSize, setPostgresSize] = useState<number | null>(null);
  const [redisSize, setRedisSize] = useState<number | null>(null);

  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(0);

  const probeHealth = useCallback(async () => {
    try {
      const data = await apiGet<HealthResponse>('/health');
      if (!_mountedRef.current) return;
      setHealth(data);
      setHealthError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setHealth(null);
      setHealthError(e instanceof Error ? e.message : 'Health probe failed');
    } finally {
      if (_mountedRef.current) setHealthLoading(false);
    }
  }, []);

  const loadSystemStatus = useCallback(async () => {
    try {
      const data = await apiGet<HealthCheckResponse>('/api/health-check');
      if (!_mountedRef.current) return;
      setSystemStatus(data);
      setSystemStatusError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setSystemStatus(null);
      setSystemStatusError(e instanceof Error ? e.message : 'Health check failed');
    } finally {
      if (_mountedRef.current) setSystemStatusLoading(false);
    }
  }, []);

  const loadDeepHealth = useCallback(async () => {
    try {
      const data = await apiGet<DeepHealthResponse>('/api/system/health-deep');
      if (!_mountedRef.current) return;
      setDeepHealth(data);
      setDeepHealthError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setDeepHealth(null);
      setDeepHealthError(e instanceof Error ? e.message : 'Deep health probe failed');
    } finally {
      if (_mountedRef.current) setDeepHealthLoading(false);
    }
  }, []);

  const loadLastEvent = useCallback(async () => {
    try {
      const data = await apiGet<{ event: { time: string; reason: string; service: string } | null }>('/api/system/last-event');
      if (!_mountedRef.current) return;
      setLastEvent(data.event);
    } catch {
      if (_mountedRef.current) setLastEvent(null);
    }
  }, []);

  const loadTelemetryStats = useCallback(async () => {
    try {
      const data = await apiGet<TelemetryStats>('/api/telemetry/stats');
      if (!_mountedRef.current) return;
      setTelemetryStats(data);
      setTelemetryStatsError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setTelemetryStatsError(e instanceof Error ? e.message : 'Telemetry stats fetch failed');
    } finally {
      if (_mountedRef.current) setTelemetryStatsLoading(false);
    }
  }, []);

  const loadSinkTokenBalance = useCallback(async () => {
    try {
      const data = await apiGet<{ sink_token_balance: number; postgres_size_bytes: number; redis_size_bytes: number }>('/api/dashboard/summary');
      if (!_mountedRef.current) return;
      setSinkTokenBalance(data.sink_token_balance ?? 0);
      setSinkLoaded(true);
      setPostgresSize(data.postgres_size_bytes ?? null);
      setRedisSize(data.redis_size_bytes ?? null);
    } catch {
      if (_mountedRef.current) setSinkTokenBalance(0);
    }
  }, []);

  const runComparison = useCallback(async () => {
    setComparisonLoading(true);
    setComparisonError(null);
    setComparisonResult(null);
    try {
      const data = await apiPost<ModelComparatorResult>('/api/system/compare-providers', { provider: selectedProvider });
      if (!_mountedRef.current) return;
      setComparisonResult(data);
    } catch (e) {
      if (!_mountedRef.current) return;
      setComparisonError(e instanceof Error ? e.message : 'Model comparison failed');
    } finally {
      if (_mountedRef.current) setComparisonLoading(false);
    }
  }, [selectedProvider]);

  const syncAll = useCallback(async () => {
    await Promise.allSettled([
      probeHealth(),
      loadSystemStatus(),
      loadDeepHealth(),
      loadLastEvent(),
      loadSinkTokenBalance(),
      loadTelemetryStats()
    ]);
    if (_mountedRef.current) {
      setLastSync(new Date());
      setPulse((p) => p + 1);
    }
  }, [probeHealth, loadSystemStatus, loadDeepHealth, loadLastEvent, loadSinkTokenBalance, loadTelemetryStats]);

  useEffect(() => {
    _mountedRef.current = true;
    void syncAll();

    const offOsTelemetry = stream.on('os_telemetry', (data: any) => {
      if (!_mountedRef.current) return;
      setTelemetryStats({
        vector_memory_count: typeof data?.vector_memory_count === 'number' ? data.vector_memory_count : 0,
        think_tokens_minted: typeof data?.think_tokens_minted === 'number' ? data.think_tokens_minted : 0,
        crucible: data?.crucible ?? { cycleCount: 0, maxCycles: 5, status: 'READY' },
        timestamp: data?.timestamp ?? new Date().toISOString()
      });
      setTelemetryStatsError(null);
      setTelemetryStatsLoading(false);
    });

    const offStorage = stream.on('storage_metrics', (data: any) => {
      if (!_mountedRef.current) return;
      if (data?.postgres_size_bytes !== undefined) setPostgresSize(data.postgres_size_bytes ?? null);
      if (data?.redis_size_bytes !== undefined) setRedisSize(data.redis_size_bytes ?? null);
    });

    const pollId = setInterval(() => {
      if (_mountedRef.current) void syncAll();
    }, 10_000);

    return () => {
      _mountedRef.current = false;
      offOsTelemetry();
      offStorage();
      clearInterval(pollId);
    };
  }, [stream.on, syncAll]);

  const live = health?.status === 'ok' || health?.status === 'degraded';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-3">
        <DegradationBanner status={degradation} loading={degradationLoading} error={degradationError} />
      </div>

      <div className="lg:col-span-2">
        <HealthPanel health={health} loading={healthLoading} error={healthError} lastEvent={lastEvent} />
      </div>

      <DeepHealthPanel data={deepHealth} loading={deepHealthLoading} error={deepHealthError} />
      <SystemStatusCard data={systemStatus} loading={systemStatusLoading} error={systemStatusError} />

      <ModelComparator
        result={comparisonResult}
        loading={comparisonLoading}
        error={comparisonError}
        provider={selectedProvider}
        onProviderChange={setSelectedProvider}
        onRun={runComparison}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={BadgeCheck} label="Verified Traces" value={0} suffix="ok" />
        <SinkTokenCard balance={sinkTokenBalance} loaded={sinkLoaded} />
        <StorageGaugeCard bytes={postgresSize} label="Postgres Storage" icon={Database} thresholdBytes={1073741824} />
        <StorageGaugeCard bytes={redisSize} label="Redis Storage" icon={MemoryStick} thresholdBytes={524288000} />
      </div>
      <TelemetryGauges stats={telemetryStats} loading={telemetryStatsLoading} error={telemetryStatsError} />

      {telemetryStatsError && (
        <div className="lg:col-span-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[10px] font-mono text-amber-300">
          <Activity className="h-4 w-4 shrink-0" />
          <span className="truncate">Telemetry Stats: {telemetryStatsError}</span>
        </div>
      )}

      {systemStatusError && (
        <div className="lg:col-span-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[10px] font-mono text-amber-300">
          <Activity className="h-4 w-4 shrink-0" />
          <span className="truncate">System Status: {systemStatusError}</span>
        </div>
      )}

      {deepHealthError && (
        <div className="lg:col-span-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[10px] font-mono text-amber-300">
          <Server className="h-4 w-4 shrink-0" />
          <span className="truncate">Database Vitals: {deepHealthError}</span>
        </div>
      )}
    </div>
  );
}

export default TelemetryPanel;
