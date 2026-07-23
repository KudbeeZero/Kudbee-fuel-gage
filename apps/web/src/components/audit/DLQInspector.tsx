import { useState, useEffect, useCallback } from 'react';
import { Skull, RotateCcw, Trash2, RefreshCw, Loader2, Inbox, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTenantStore } from '../../store/tenantStore';
import { apiGet, apiPost } from '../../lib/apiClient';

interface FailedTask {
  id: string;
  kind: string;
  attempts: number;
  failedAt?: string;
  lastError?: string;
  payload?: Record<string, unknown>;
}

interface DLQState {
  dlq: string;
  workerRunning: boolean;
  count: number;
  items: FailedTask[];
}

export function DLQInspector() {
  const { tenants, currentTenantId } = useTenantStore();
  const current = tenants.find((t) => t.id === currentTenantId);
  const canRetry = current?.role === 'ADMIN' || current?.role === 'OPERATOR';
  const canDiscard = current?.role === 'ADMIN';

  const [state, setState] = useState<DLQState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const headers = useCallback((): HeadersInit => ({ 'Content-Type': 'application/json', 'X-Tenant-Id': currentTenantId }), [currentTenantId]);

  const fetchDLQ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<DLQState>('/api/governance/failed');
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load DLQ');
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDLQ();
    const timer = setInterval(fetchDLQ, 5000);
    return () => clearInterval(timer);
  }, [fetchDLQ]);

  const retry = useCallback(async (id: string) => {
    if (!canRetry) return;
    setBusyId(id);
    setError(null);
    try {
      await apiPost('/api/governance/failed/retry', { id }, { headers: headers() });
      await fetchDLQ();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setBusyId(null);
    }
  }, [canRetry, fetchDLQ, headers]);

  const discard = useCallback(async (id: string) => {
    if (!canDiscard) return;
    setBusyId(id);
    setError(null);
    try {
      await apiPost('/api/governance/failed/discard', { id }, { headers: headers() });
      await fetchDLQ();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusyId(null);
    }
  }, [canDiscard, fetchDLQ, headers]);

  return (
    <div id="dlq-inspector" className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skull className="w-4 h-4 text-rose-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Dead Letter Queue</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
            state?.workerRunning
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-slate-700 bg-slate-900 text-slate-500'
          }`}>
            {state?.workerRunning ? 'WORKER · ACTIVE' : 'WORKER · IDLE'}
          </span>
          <button
            type="button"
            onClick={() => void fetchDLQ()}
            disabled={loading}
            className="p-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-slate-400"
            title="Refresh DLQ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <p className="text-[10px] font-mono text-slate-500 mb-3">
        Tasks that exhausted their 3-strike retry budget. Inspect, retry, or discard.
      </p>

      {error && (
        <div className="mb-3 p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span className="font-mono text-[10px] text-amber-300">{error}</span>
        </div>
      )}

      {loading && !state ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse" />
          ))}
        </div>
      ) : !state || state.count === 0 ? (
        <div
          id="dlq-empty"
          className="p-4 rounded-lg border border-slate-800 bg-slate-950/40 text-center"
        >
          <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
          <span className="font-mono text-[10px] text-emerald-300">[QUEUE EMPTY - ALL SYSTEMS NOMINAL]</span>
          <div className="mt-1 font-mono text-[9px] text-slate-600">Worker idle · no dead-lettered tasks</div>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {state.items.map((item) => (
              <div
                key={item.id}
                className={`p-2 rounded border border-slate-800 bg-slate-950/50 transition-opacity ${busyId === item.id ? 'opacity-60' : ''}`}
              >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-slate-200 truncate">{item.id}</span>
                <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-rose-300">
                  {item.attempts} ATTEMPTS
                </span>
              </div>
              <div className="font-mono text-[9px] text-slate-500 truncate">{item.kind} · {item.failedAt || 'unknown time'}</div>
              {item.lastError && (
                <div className="mt-1 font-mono text-[9px] text-rose-300 break-all">⚠ {item.lastError}</div>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void retry(item.id)}
                  disabled={!canRetry || busyId === item.id}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 font-mono text-[9px] font-bold uppercase tracking-widest"
                  title={canRetry ? 'Re-queue this task' : 'OPERATOR role required'}
                >
                  {busyId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => void discard(item.id)}
                  disabled={!canDiscard || busyId === item.id}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 font-mono text-[9px] font-bold uppercase tracking-widest"
                  title={canDiscard ? 'Permanently discard' : 'ADMIN role required'}
                >
                  <Trash2 className="w-3 h-3" />
                  {busyId === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between font-mono text-[9px] text-slate-600">
        <span>{state ? `${state.count} dead-lettered · ${state.dlq}` : '[NO DLQ DATA]'}</span>
        <Inbox className="w-3 h-3 text-slate-700" />
      </div>
    </div>
  );
}
