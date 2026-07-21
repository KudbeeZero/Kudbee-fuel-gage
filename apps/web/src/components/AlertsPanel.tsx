import { useState, useEffect, useCallback } from 'react';
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
  RefreshCw,
  Bell,
  BellOff,
  ShieldCheck,
  Loader2,
  Stethoscope
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/apiClient';
import { useCommandDispatcher } from '../store/commandDispatcher';
import { useSystemDiagnostics } from '../hooks/useSystemDiagnostics';

export interface SystemAlert {
  id: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  source?: string;
  title: string;
  detail?: string;
  status: 'OPEN' | 'ACK' | 'MITIGATED';
  triageId?: number | string;
  createdAt?: string;
  acknowledgedAt?: string;
  mitigatedAt?: string;
}

interface AlertsResponse {
  alerts: SystemAlert[];
}

function severityClasses(severity: SystemAlert['severity'] | undefined): string {
  if (severity === 'CRITICAL') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  if (severity === 'WARN') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
}

function statusClasses(status: SystemAlert['status']): string {
  if (status === 'MITIGATED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'ACK') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
}

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

  // Live alerts feed (Phase 20)
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const { enqueue, setState: dispatchSetState } = useCommandDispatcher();
  const diagnostics = useSystemDiagnostics();

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const data = await apiGet<AlertsResponse>('/api/system/alerts');
      setAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
    } catch (e) {
      setAlertsError(e instanceof Error ? e.message : 'Alerts feed unavailable');
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const handleAck = useCallback(
    async (alert: SystemAlert) => {
      setBusyAlertId(alert.id);
      const cmdId = enqueue({
        kind: 'VERIFY_TRACE',
        label: 'Acknowledge Alert',
        description: `${alert.title}`
      });
      dispatchSetState(cmdId, 'PROCESSING', 'Acknowledging…');
      // Optimistic update
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, status: 'ACK' as const, acknowledgedAt: new Date().toISOString() } : a))
      );
      try {
        const res = await apiPost<{ alert: SystemAlert }>(`/api/system/alerts/${alert.id}/ack`, {});
        if (res?.alert) {
          setAlerts((prev) => prev.map((a) => (a.id === alert.id ? res.alert : a)));
        }
        dispatchSetState(cmdId, 'SUCCESS', 'alert acknowledged');
      } catch (e) {
        // Roll back optimistic update
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? alert : a)));
        dispatchSetState(cmdId, 'FAILED', e instanceof Error ? e.message : 'ack failed');
        setAlertsError(e instanceof Error ? e.message : 'Ack failed');
      } finally {
        setBusyAlertId(null);
      }
    },
    [dispatchSetState, enqueue]
  );

  const handleMitigate = useCallback(
    async (alert: SystemAlert) => {
      setBusyAlertId(alert.id);
      const cmdId = enqueue({
        kind: 'CLEAR_TRIAGE',
        label: 'Mitigate Alert',
        description: alert.title
      });
      dispatchSetState(cmdId, 'PROCESSING', 'Mitigating…');
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, status: 'MITIGATED' as const, mitigatedAt: new Date().toISOString() } : a))
      );
      try {
        const res = await apiPost<{ alert: SystemAlert; linkedTriageId: number | null }>(
          `/api/system/alerts/${alert.id}/mitigate`,
          {}
        );
        if (res?.alert) {
          setAlerts((prev) => prev.map((a) => (a.id === alert.id ? res.alert : a)));
        }
        // If the alert is linked to a triage id, dispatch the actual mitigation
        // through the interceptor so the linked payload is purged.
        const linked = res?.linkedTriageId;
        if (linked !== null && linked !== undefined) {
          try {
            await apiPost(`/api/interceptor/revalidate/${linked}`, {});
          } catch {
            /* best effort */
          }
        }
        dispatchSetState(cmdId, 'SUCCESS', 'alert mitigated');
      } catch (e) {
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? alert : a)));
        dispatchSetState(cmdId, 'FAILED', e instanceof Error ? e.message : 'mitigate failed');
        setAlertsError(e instanceof Error ? e.message : 'Mitigate failed');
      } finally {
        setBusyAlertId(null);
      }
    },
    [dispatchSetState, enqueue]
  );

  const load = async () => {
    setError(null);
    try {
      const [healthRes, deepRes] = await Promise.allSettled([
        apiGet<HealthResponse>('/health'),
        apiGet<DeepHealthResponse>('/api/system/health-deep')
      ]);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (deepRes.status === 'fulfilled') setDeepHealth(deepRes.value);
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

  useEffect(() => {
    void loadAlerts();
    const id = setInterval(() => void loadAlerts(), 5000);
    return () => clearInterval(id);
  }, [loadAlerts]);

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
            <button
              id="run-system-diagnostic"
              type="button"
              onClick={() => {
                const cmdId = enqueue({
                  kind: 'PLAYGROUND_RUN',
                  label: 'Run System Diagnostic',
                  description: 'Comprehensive self-diagnostic probe'
                });
                dispatchSetState(cmdId, 'PROCESSING', 'Probing system health…');
                void diagnostics.refresh().then(() => {
                  const report = diagnostics.diagnostics;
                  if (report) {
                    dispatchSetState(cmdId, 'SUCCESS', `status: ${report.status}`);
                  } else {
                    dispatchSetState(cmdId, 'FAILED', 'diagnostic failed');
                  }
                }).catch(() => {
                  dispatchSetState(cmdId, 'FAILED', 'diagnostic error');
                });
              }}
              disabled={diagnostics.running}
              className="flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:opacity-40"
            >
              {diagnostics.running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Stethoscope className="h-3 w-3" />}
              Run Diagnostic
            </button>
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

      {/* Live Alert Stream & Threat Triage (Phase 20) */}
      <div
        id="live-alerts-feed"
        className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-rose-400" />
            <div>
              <h3 className="font-display font-semibold text-slate-200 text-sm">Live Alert Stream</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Adaptive feed from <span className="text-rose-300">/api/system/alerts</span>. Acknowledge or mitigate to dispatch into the Console Dock.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {alerts.filter((a) => a.status === 'OPEN').length} open
            </span>
            <button
              id="alerts-refresh"
              type="button"
              onClick={() => void loadAlerts()}
              disabled={alertsLoading}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-300 hover:text-rose-300"
              title="Refresh alerts"
            >
              <RefreshCw className={`h-3 w-3 ${alertsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {alertsError && (
          <div className="mb-3 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[10px] text-amber-300">
            <AlertTriangle className="w-3 h-3" />
            {alertsError}
          </div>
        )}

        {alertsLoading && alerts.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse"
              />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <BellOff className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No active alerts. System is quiet.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => {
              const isBusy = busyAlertId === alert.id;
              const StatusIcon =
                alert.status === 'MITIGATED'
                  ? CheckCircle2
                  : alert.status === 'ACK'
                    ? ShieldCheck
                    : AlertTriangle;
              return (
                <li
                  key={alert.id}
                  id={`alert-card-${alert.id}`}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <StatusIcon
                      className={`mt-0.5 h-4 w-4 ${
                        alert.status === 'MITIGATED'
                          ? 'text-emerald-400'
                          : alert.status === 'ACK'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-display text-xs font-semibold text-slate-200">
                          {alert.title}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${severityClasses(alert.severity)}`}
                        >
                          {alert.severity}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${statusClasses(alert.status)}`}
                        >
                          {alert.status}
                        </span>
                        {alert.source && (
                          <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                            {alert.source}
                          </span>
                        )}
                      </div>
                      {alert.detail && (
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{alert.detail}</p>
                      )}
                      <div className="mt-1 font-mono text-[9px] text-slate-600">
                        {alert.createdAt ? `opened ${new Date(alert.createdAt).toLocaleTimeString()}` : ''}
                        {alert.acknowledgedAt
                          ? ` · acked ${new Date(alert.acknowledgedAt).toLocaleTimeString()}`
                          : ''}
                        {alert.mitigatedAt
                          ? ` · mitigated ${new Date(alert.mitigatedAt).toLocaleTimeString()}`
                          : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        id={`alert-ack-${alert.id}`}
                        type="button"
                        onClick={() => void handleAck(alert)}
                        disabled={isBusy || alert.status !== 'OPEN'}
                        className="flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                        Ack
                      </button>
                      <button
                        id={`alert-mitigate-${alert.id}`}
                        type="button"
                        onClick={() => void handleMitigate(alert)}
                        disabled={isBusy || alert.status === 'MITIGATED'}
                        className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Mitigate
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* System Diagnostic Report (Phase 22) */}
      {diagnostics.diagnostics && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="w-5 h-5 text-violet-400" />
            <h3 className="font-display font-semibold text-slate-200 text-sm">System Diagnostic Report</h3>
            <span className={`rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
              diagnostics.diagnostics.status === 'HEALTHY' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}>
              {diagnostics.diagnostics.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(diagnostics.diagnostics.summary).map(([key, value]) => (
              <div key={key} className="p-2 bg-slate-950/40 border border-slate-800 rounded text-center">
                <div className="text-[10px] font-mono text-slate-500 uppercase">{key}</div>
                <div className={`text-xs font-mono font-bold mt-1 ${
                  value === 'PASS' ? 'text-emerald-400' : value === 'SKIP' ? 'text-slate-400' : 'text-rose-400'
                }`}>{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
              <div className="text-[10px] font-mono text-slate-500 uppercase">Router Providers</div>
              <div className="mt-1 space-y-1">
                {diagnostics.diagnostics.routerProviders.map((rp) => (
                  <div key={rp.id} className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-300 uppercase">{rp.id}</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      rp.status === 'OK' ? 'text-emerald-400' : rp.status === 'DEGRADED' ? 'text-amber-400' : 'text-rose-400'
                    }`}>{rp.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
              <div className="text-[10px] font-mono text-slate-500 uppercase">Buffers & Index</div>
              <div className="mt-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-300">Log Buffer</span>
                  <span className="text-[10px] font-mono font-bold text-slate-300">{diagnostics.diagnostics.logBuffer.detail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-300">Vector Index</span>
                  <span className="text-[10px] font-mono font-bold text-slate-300">{diagnostics.diagnostics.vectorIndex.detail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-300">Governance</span>
                  <span className={`text-[10px] font-mono font-bold ${diagnostics.diagnostics.governanceLedger ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {diagnostics.diagnostics.governanceLedger ? 'HEALTHY' : 'OFFLINE'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 font-mono text-[9px] text-slate-600">
            Probed at {new Date(diagnostics.diagnostics.timestamp).toLocaleString()} · uptime {diagnostics.diagnostics.uptimeSeconds}s
          </div>
        </div>
      )}
    </div>
  );
}
