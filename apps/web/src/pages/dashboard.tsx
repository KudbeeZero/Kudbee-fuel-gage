import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Brain,
  CircleDot,
  Clock,
  Cpu,
  Database,
  Gauge,
  MemoryStick,
  Radio,
  RefreshCw,
  ShieldX,
  Signal,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useInterval } from '../hooks/useInterval';
import { apiGet, apiUrl } from '../lib/apiClient';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service?: string;
  phase?: string;
  uptime_sec?: number;
  timestamp?: string;
  dependencies?: { ingestion_db?: string; vector_memory?: string };
}

interface TriageItem {
  id: number;
  payload: unknown;
  violation_reason: string;
  timestamp: string;
}

interface MemoryRecall {
  trace_id: string;
  thought_summary: string;
  reasoning: string;
  model: string;
  similarity: number;
}

interface MemoryResponse {
  query: string;
  count: number;
  memories: MemoryRecall[];
}

const POLL_MS = 5000;

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

function formatPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function HealthPanel({
  health,
  loading,
  error
}: {
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const live = health?.status === 'ok' || health?.status === 'degraded';
  const degraded = health?.status === 'degraded';

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
          <div className="mt-3 grid grid-cols-2 gap-2">
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
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-mono text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
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

function TelemetryFeed({ items }: { items: TriageItem[] }) {
  return (
    <div
      id="telemetry-feed-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-cyan-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Live Interceptor Triage</h3>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[10px] text-slate-400">
          {items.length} captured
        </span>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-600">
            <ShieldX className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No intercepted payloads. Firewall is clear.</span>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/50">
            {items.map((item) => (
              <li key={item.id} className="px-5 py-3 hover:bg-slate-900/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-rose-400">
                      BLOCKED
                    </span>
                    <span className="truncate font-mono text-xs text-slate-300">#{item.id}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{item.timestamp}</span>
                </div>
                <p className="mt-1.5 truncate text-xs text-rose-300/90">{item.violation_reason}</p>
                <pre className="mt-2 max-h-24 overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
                  {formatPayload(item.payload)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MiniBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const hue = pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full ${hue} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MemoryInsights({ memories }: { memories: MemoryRecall[] }) {
  return (
    <div
      id="memory-insights-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Recent Memory Recalls</h3>
        </div>
        <span className="font-mono text-[10px] text-slate-500">vector · cosine</span>
      </div>

      <div className="space-y-3 p-5">
        {memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <MemoryStick className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">Semantic memory store is empty.</span>
          </div>
        ) : (
          memories.map((m) => (
            <div
              key={m.trace_id}
              className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-violet-300">{m.model}</span>
                <span className="shrink-0 font-mono text-[10px] text-slate-500">
                  {(m.similarity * 100).toFixed(1)}% match
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-300">{m.thought_summary || m.reasoning}</p>
              <div className="mt-2">
                <MiniBar value={m.similarity} />
              </div>
              <p className="mt-1.5 truncate font-mono text-[9px] text-slate-600">trace {m.trace_id}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [triage, setTriage] = useState<TriageItem[]>([]);
  const [triageError, setTriageError] = useState<string | null>(null);

  const [memories, setMemories] = useState<MemoryRecall[]>([]);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(0);

  const probeHealth = useCallback(async () => {
    try {
      const data = await apiGet<HealthResponse>('/health');
      setHealth(data);
      setHealthError(null);
    } catch (e) {
      setHealth(null);
      setHealthError(e instanceof Error ? e.message : 'Health probe failed');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadTriage = useCallback(async () => {
    try {
      const data = await apiGet<TriageItem[]>('/api/interceptor/triage');
      setTriage(Array.isArray(data) ? data.slice(0, 25) : []);
      setTriageError(null);
    } catch (e) {
      setTriageError(e instanceof Error ? e.message : 'Triage fetch failed');
    }
  }, []);

  const loadMemory = useCallback(async () => {
    try {
      const data = await apiGet<MemoryResponse>(
        '/api/memory/recall?query=control%20tower%20telemetry%20health&limit=5'
      );
      setMemories(data?.memories ?? []);
      setMemoryError(null);
    } catch (e) {
      setMemoryError(e instanceof Error ? e.message : 'Memory recall failed');
    }
  }, []);

  const syncAll = useCallback(async () => {
    await Promise.allSettled([probeHealth(), loadTriage(), loadMemory()]);
    setLastSync(new Date());
    setPulse((p) => p + 1);
  }, [probeHealth, loadTriage, loadMemory]);

  // Initial load on mount.
  useEffect(() => {
    void syncAll();
  }, [syncAll]);

  // Interactive "Pulse": poll everything every 5 seconds without a page refresh.
  useInterval(() => {
    void syncAll();
  }, POLL_MS);

  const live = health?.status === 'ok' || health?.status === 'degraded';

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200" id="control-tower-dashboard">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                <Cpu className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">
                  Control Tower
                </h1>
                <p className="text-xs text-slate-500">
                  Phase 5 · Live telemetry &amp; blockchain-identity status
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <Signal
                className={`h-4 w-4 ${live ? 'text-emerald-400' : 'text-rose-400'}`}
              />
              <div className="leading-tight">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  Pulse
                </div>
                <div className="font-mono text-xs text-slate-300">
                  {lastSync ? `synced ${lastSync.toLocaleTimeString()}` : 'initializing…'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void syncAll()}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-mono font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pulse > 0 ? 'animate-spin' : ''}`} />
              Manual Pulse
            </button>
          </div>
        </header>

        {/* Top row: System Health + summary metrics */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HealthPanel health={health} loading={healthLoading} error={healthError} />
          </div>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
            <MetricCard icon={Database} label="Triage Queue" value={triage.length} suffix="pkt" />
            <MetricCard icon={Brain} label="Memory Hits" value={memories.length} suffix="vec" />
          </div>
        </div>

        {/* Bottom row: Telemetry feed + Memory insights */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <TelemetryFeed items={triage} />
          <MemoryInsights memories={memories} />
        </div>

        {(triageError || memoryError) && (
          <div className="mt-5 space-y-2">
            {triageError && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
                <Activity className="h-4 w-4" />
                Triage: {triageError}
              </div>
            )}
            {memoryError && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
                <Brain className="h-4 w-4" />
                Memory: {memoryError}
              </div>
            )}
          </div>
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-slate-800/60 pt-5 text-[10px] font-mono text-slate-600">
          <span>Kudbee Control Tower · auto-polling {POLL_MS / 1000}s</span>
          <span>{apiUrl('/health')}</span>
        </footer>
      </div>
    </div>
  );
}

export default DashboardPage;
