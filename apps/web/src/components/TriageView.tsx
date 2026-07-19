import { useState, useEffect, useCallback } from 'react';
import { ShieldX, Trash2, RefreshCw, Inbox, AlertTriangle } from 'lucide-react';
import { IngestRequestSchema, type SecurityViolation } from '@kudbee/types';

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

export function TriageView() {
  const [violations, setViolations] = useState<SecurityViolation[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadTriage = useCallback(async () => {
    try {
      const res = await fetch('/api/interceptor/triage', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Triage fetch failed (${res.status})`);
      const data = (await res.json()) as SecurityViolation[];
      setViolations(data);
      setError(null);
      setLastSync(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load triage queue');
    }
  }, []);

  useEffect(() => {
    loadTriage();
    const timer = setInterval(loadTriage, TRIAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [loadTriage]);

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

  return (
    <div className="space-y-6" id="triage-view-container">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldX className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="font-display font-semibold text-slate-200 text-lg">Firewall Triage &amp; Interceptor</h2>
              <p className="text-xs text-slate-500 mt-1">
                Quarantined payloads that violated the Zod contract. Review, delete, or re-validate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
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
        <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-xs font-mono text-rose-300">{error}</span>
        </div>
      )}

      {violations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-500">
          <Inbox className="w-10 h-10 mb-3 opacity-40" />
          <span className="text-sm font-mono">No quarantined payloads. The firewall is clear.</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
          <table className="w-full text-left text-sm font-mono">
            <thead className="bg-slate-900/60 text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Violation Reason</th>
                <th className="px-4 py-3">Captured Payload</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {violations.map((v) => {
                const issues = describeIssues(v.payload);
                return (
                  <tr key={v.id} className="align-top hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-300">{v.id}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{v.timestamp}</td>
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
                          onClick={() => handleRevalidate(v.id)}
                          disabled={busyId === v.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-all cursor-pointer active:scale-95 duration-75 disabled:opacity-40"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${busyId === v.id ? 'animate-spin' : ''}`} />
                          Re-validate
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          disabled={busyId === v.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer active:scale-95 duration-75 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
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
  );
}
