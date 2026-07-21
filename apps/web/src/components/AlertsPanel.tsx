import { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Server,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import { apiGet } from '../lib/apiClient';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service?: string;
  phase?: string;
  uptime_sec?: number;
  timestamp?: string;
  dependencies?: {
    ingestion_db?: string;
    vector_memory?: string;
    redis?: string;
  };
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

function CircuitBreakerBlock({
  label,
  status,
  latencyMs,
  lastPing,
  icon: Icon
}: {
  label: string;
  status: 'OK' | 'OFFLINE';
  latencyMs: number | null;
  lastPing: string | null;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const isOk = status === 'OK';
  const latencyColor = latencyMs === null ? 'text-slate-500' : latencyMs < 50 ? 'text-emerald-400' : latencyMs < 200 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className={`p-3 rounded-lg border ${isOk ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${isOk ? 'text-emerald-400' : 'text-rose-400'}`} />
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
        </div>
        <span className={`text-[10px] font-mono font-bold ${isOk ? 'text-emerald-400' : 'text-rose-400'}`}>
          {status}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">Latency</span>
        <span className={`text-xs font-mono font-bold ${latencyColor}`}>
          {latencyMs !== null ? `${latencyMs}ms` : '—'}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">Last Ping</span>
        <span className="text-[10px] font-mono text-slate-500">
          {lastPing ? new Date(lastPing).toLocaleTimeString() : '—'}
        </span>
      </div>
    </div>
  );
}

export function AlertsPanel() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [deepHealth, setDeepHealth] = useState<DeepHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [healthData, deepData] = await Promise.all([
        apiGet<HealthResponse>('/health'),
        apiGet<DeepHealthResponse>('/api/system/health-deep')
      ]);
      setHealth(healthData);
      setDeepHealth(deepData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Health probe failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => clearInterval(id);
  }, []);

  const overallStatus = health?.status || deepHealth?.status || 'unknown';
  const isOk = overallStatus === 'ok' || overallStatus === 'HEALTHY';
  const isDegraded = overallStatus === 'degraded' || overallStatus === 'DEGRADED';

  return (
    <div className="space-y-4" id="alerts-panel-container">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-display font-semibold text-slate-200 text-sm">Health Probes & Circuit Breakers</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time Redis resilience states and backend health checks.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOk ? 'bg-emerald-400' : isDegraded ? 'bg-amber-400' : 'bg-rose-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isOk ? 'bg-emerald-500' : isDegraded ? 'bg-amber-500' : 'bg-rose-500'}`} />
            </span>
            <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${isOk ? 'text-emerald-400' : isDegraded ? 'text-amber-400' : 'text-rose-400'}`}>
              {loading ? 'Probing…' : isOk ? 'Live' : isDegraded ? 'Degraded' : 'Offline'}
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2 rounded border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-mono text-amber-300">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Uptime</span>
              <span className="text-xs font-mono font-bold text-slate-300">
                {health?.uptime_sec !== undefined ? `${Math.floor(health.uptime_sec / 60)}m ${health.uptime_sec % 60}s` : '—'}
              </span>
            </div>
          </div>
          <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Phase</span>
              <span className="text-xs font-mono font-bold text-slate-300">{health?.phase || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-cyan-400" />
          <h3 className="font-display font-semibold text-slate-200 text-sm">Database Connection Metrics</h3>
        </div>

        {!deepHealth && !error ? (
          <div className="text-[11px] font-mono text-slate-600">Probing database vitals…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CircuitBreakerBlock
              label="Postgres"
              status={deepHealth?.services.postgres.status || 'OFFLINE'}
              latencyMs={deepHealth?.services.postgres.latencyMs || null}
              lastPing={deepHealth?.services.postgres.lastPing || null}
              icon={Database}
            />
            <CircuitBreakerBlock
              label="Redis"
              status={deepHealth?.services.redis.status || 'OFFLINE'}
              latencyMs={deepHealth?.services.redis.latencyMs || null}
              lastPing={deepHealth?.services.redis.lastPing || null}
              icon={Wifi}
            />
          </div>
        )}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h3 className="font-display font-semibold text-slate-200 text-sm">Redis Resilience</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-2 bg-slate-950/40 border border-slate-800 rounded text-center">
            <div className="text-[10px] font-mono text-slate-500 uppercase">State</div>
            <div className={`text-xs font-mono font-bold mt-1 ${isOk ? 'text-emerald-400' : isDegraded ? 'text-amber-400' : 'text-rose-400'}`}>
              {health?.status?.toUpperCase() || 'UNKNOWN'}
            </div>
          </div>
          <div className="p-2 bg-slate-950/40 border border-slate-800 rounded text-center">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Ingestion DB</div>
            <div className={`text-xs font-mono font-bold mt-1 ${health?.dependencies?.ingestion_db === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health?.dependencies?.ingestion_db?.toUpperCase() || 'UNKNOWN'}
            </div>
          </div>
          <div className="p-2 bg-slate-950/40 border border-slate-800 rounded text-center">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Vector Memory</div>
            <div className={`text-xs font-mono font-bold mt-1 ${health?.dependencies?.vector_memory === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health?.dependencies?.vector_memory?.toUpperCase() || 'UNKNOWN'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
