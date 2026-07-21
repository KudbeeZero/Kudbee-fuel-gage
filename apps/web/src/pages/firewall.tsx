import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldX,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Activity,
  AlertTriangle,
  Database,
  Server,
  Inbox,
  Clock,
  Gauge
} from 'lucide-react';
import { apiGet } from '../lib/apiClient';
import { IngestRequestSchema, SecurityViolation } from '@kudbee/types';

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

interface TriageItem {
  id: number;
  payload: unknown;
  violation_reason: string;
  timestamp: string;
}

const TRIAGE_POLL_MS = 5000;

function formatPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function describeIssues(payload: unknown): string[] {
  const parsed = IngestRequestSchema.safeParse(payload);
  if (parsed.success) return [];
  return parsed.error.issues.map(
    (i) => `${i.path.join('.') || '(root)'}: ${i.message}`
  );
}

export function FirewallPage() {
  const [violations, setViolations] = useState<SecurityViolation[]>([]);
  const [deepHealth, setDeepHealth] = useState<DeepHealthResponse | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deepHealthError, setDeepHealthError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadTriage = useCallback(async () => {
    try {
      const res = await fetch('/api/interceptor/triage', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Triage fetch failed (${res.status})`);
      const data = (await res.json()) as SecurityViolation[];
      setViolations(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load triage queue');
    }
  }, []);

  const loadDeepHealth = useCallback(async () => {
    try {
      const data = await apiGet<DeepHealthResponse>('/api/system/health-deep');
      setDeepHealth(data);
      setDeepHealthError(null);
    } catch (e) {
      setDeepHealthError(e instanceof Error ? e.message : 'Deep health probe failed');
      setDeepHealth(null);
    }
  }, []);

  useEffect(() => {
    loadTriage();
    const timer = setInterval(loadTriage, TRIAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [loadTriage]);

  useEffect(() => {
    loadDeepHealth();
    const timer = setInterval(loadDeepHealth, TRIAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [loadDeepHealth]);

  useEffect(() => {
    if (violations.length > 0 || deepHealth) {
      setLastSync(new Date());
    }
  }, [violations, deepHealth]);

  const handleDelete = useCallback(
    async (id: number) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/interceptor/triage/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        await loadTriage();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete violation');
      } finally {
        setBusyId(null);
      }
    },
    [loadTriage]
  );

  const handleRevalidate = useCallback(
    async (id: number) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/interceptor/revalidate/${id}`, { method: 'POST' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Re-validation failed (${res.status})`);
        }
        await loadTriage();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to re-validate violation');
      } finally {
        setBusyId(null);
      }
    },
    [loadTriage]
  );

  const getLatencyColor = (latency: number | null) => {
    if (latency === null) return 'text-slate-500';
    if (latency < 50) return 'text-emerald-400';
    if (latency < 200) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="space-y-6" id="firewall-page-container">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="font-display font-semibold text-slate-200 text-lg">Firewall & Intercept Gateway</h2>
              <p className="text-xs text-slate-500 mt-1">
                Quarantined payloads, active intercepts, and Edge Sentinel circuit breakers. Review, release, or purge.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
            <span className="text-[10px] font-mono text-rose-400 uppercase tracking-widest font-bold">
              {violations.length} Pending Triage
            </span>
          </div>
        </div>
        {lastSync && (
          <p className="text-[10px] font-mono text-slate-600 mt-2">
            Auto-syncing every {TRIAGE_POLL_MS / 1000}s · last sync {lastSync.toLocaleTimeString()}
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-mono text-amber-300">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Quarantined Payloads</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Review security violations intercepted by the firewall.</p>
                </div>
              </div>
            </div>

            {violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <Inbox className="w-10 h-10 mb-3 opacity-40" />
                <span className="text-sm font-mono">No quarantined payloads. The firewall is clear.</span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/50">
                <table className="w-full text-left text-sm font-mono">
                  <thead className="bg-slate-900/60 text-slate-400 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Violation</th>
                      <th className="px-4 py-3">Payload</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {violations.map((v) => {
                      const issues = describeIssues(v.payload);
                      return (
                        <tr key={v.id} className="align-top hover:bg-slate-900/40">
                          <td className="px-4 py-3 text-slate-300">{v.id}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(v.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-3 text-rose-300 max-w-xs">
                            <div className="font-semibold">{v.violation_reason}</div>
                            {issues.length > 0 && (
                              <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500 list-disc list-inside">
                                {issues.map((iss, idx) => (
                                  <li key={idx}>{iss}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400 max-w-md">
                            <pre className="whitespace-pre-wrap break-all text-[11px] bg-slate-950/50 rounded p-2 border border-slate-800 max-h-40 overflow-auto">
                              {formatPayload(v.payload)}
                            </pre>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleRevalidate(v.id)}
                                disabled={busyId === v.id}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-all cursor-pointer active:scale-95 duration-75 disabled:opacity-40"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${busyId === v.id ? 'animate-spin' : ''}`} />
                                Release
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(v.id)}
                                disabled={busyId === v.id}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer active:scale-95 duration-75 disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Purge
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="font-display font-semibold text-slate-200 text-sm">Edge Sentinel Circuit Breakers</h3>
                <p className="text-xs text-slate-500 mt-0.5">Real-time dependency latency probes.</p>
              </div>
            </div>

            {deepHealthError && (
              <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 text-[10px] font-mono text-amber-300 mb-3">
                {deepHealthError}
              </div>
            )}

            {!deepHealth ? (
              <div className="text-[11px] font-mono text-slate-600">Probing circuit breakers…</div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-slate-400" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Postgres</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${
                      deepHealth.services.postgres.status === 'OK' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {deepHealth.services.postgres.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Latency</span>
                    <span className={`text-xs font-mono font-bold ${getLatencyColor(deepHealth.services.postgres.latencyMs)}`}>
                      {deepHealth.services.postgres.latencyMs !== null ? `${deepHealth.services.postgres.latencyMs}ms` : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-slate-400" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Redis</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${
                      deepHealth.services.redis.status === 'OK' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {deepHealth.services.redis.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Latency</span>
                    <span className={`text-xs font-mono font-bold ${getLatencyColor(deepHealth.services.redis.latencyMs)}`}>
                      {deepHealth.services.redis.latencyMs !== null ? `${deepHealth.services.redis.latencyMs}ms` : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Agent</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      deepHealth.agent.status === 'ACTIVE_RUNNING' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {deepHealth.agent.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Uptime</span>
                    <span className="text-xs font-mono text-slate-300">
                      {deepHealth.agent.uptimeSeconds !== undefined ? `${deepHealth.agent.uptimeSeconds}s` : '—'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Pending Triage</span>
                    <span className="text-xs font-mono text-amber-400">{deepHealth.agent.pendingTriageCount}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Overall</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      deepHealth.status === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {deepHealth.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Last Ping</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {deepHealth.timestamp ? new Date(deepHealth.timestamp).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
