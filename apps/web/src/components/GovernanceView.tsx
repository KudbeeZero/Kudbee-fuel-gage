import React, { useState, useEffect, useCallback } from 'react';
import { Scale, CheckCircle2, XCircle, RefreshCw, CircleDot, Tag } from 'lucide-react';
import { apiGet, apiPost } from '../lib/apiClient';

interface ProposedAction {
  id: string;
  action: string;
  tags: string[];
  prompt?: string;
  status: 'PROPOSED' | 'PROVEN';
  created_at: string;
  proven_at?: string;
}

export function GovernanceView() {
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadProposed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ProposedAction[]>('/api/governance/proposed');
      setActions(Array.isArray(data) ? data : []);
      setLastSync(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load proposed actions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProposed();
  }, [loadProposed]);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    // Optimistic UI: drop the row immediately, reconcile with the server after.
    const previous = actions;
    setActions((prev) => prev.filter((a) => a.id !== id));
    try {
      await apiPost('/api/governance/approve', { id });
      await loadProposed();
    } catch (e) {
      setActions(previous); // roll back on failure
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    // Optimistic UI: drop the row immediately, reconcile with the server after.
    const previous = actions;
    setActions((prev) => prev.filter((a) => a.id !== id));
    try {
      await apiPost('/api/governance/reject', { id });
      await loadProposed();
    } catch (e) {
      setActions(previous); // roll back on failure
      setError(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-dvh space-y-6" id="governance-view-container">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <Scale className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">Governance &amp; Intelligence Router</h1>
            <p className="text-xs text-slate-500">
              Review logic actions the agent has proposed. Approve to promote them into the PROVEN index.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
            <CircleDot className={`h-3.5 w-3.5 ${loading ? 'animate-pulse text-emerald-400' : 'text-slate-500'}`} />
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
              {lastSync ? `synced ${lastSync.toLocaleTimeString()}` : 'initializing…'}
            </span>
          </div>
          <button
            onClick={() => void loadProposed()}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-mono font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${lastSync && loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Proposed Logic Actions table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
        <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-sm font-semibold text-slate-200">Proposed Logic Actions</h3>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[10px] text-slate-400">
            {actions.length} pending
          </span>
        </div>

        {error && (
          <div className="m-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-mono text-rose-300">
            {error}
          </div>
        )}

        {loading && actions.length === 0 ? (
          <div className="px-5 py-12 text-center font-mono text-xs text-slate-500">Loading proposed actions…</div>
        ) : actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-slate-600">
            <Scale className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No proposed logic actions. The PROVEN index is the only source of truth.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="hidden md:table-header-group">
                <tr className="font-mono text-slate-500 text-[10px] uppercase tracking-widest bg-slate-950/50">
                  <th className="px-5 py-3 font-semibold border-b border-slate-800">Action</th>
                  <th className="px-5 py-3 font-semibold border-b border-slate-800">Tags</th>
                  <th className="px-5 py-3 font-semibold border-b border-slate-800">Proposed</th>
                  <th className="px-5 py-3 font-semibold border-b border-slate-800 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-800/50 block md:table-row-group p-3 md:p-0 space-y-3 md:space-y-0 bg-slate-950 md:bg-transparent">
                {actions.map((a) => (
                  <tr key={a.id} className="block md:table-row bg-slate-900/60 border border-slate-800 md:border-none rounded-xl p-4 md:p-0 mb-3 md:mb-0 space-y-3 md:space-y-0 shadow-[0_0_12px_rgba(52,211,153,0.04)] md:shadow-none">
                    <td className="px-5 py-3 md:py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">{a.id}</span>
                      </div>
                      <p className="mt-1 font-mono text-slate-200">{a.action}</p>
                      {a.prompt && (
                        <p className="mt-1 truncate text-[10px] text-slate-500" title={a.prompt}>{a.prompt}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 md:py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {a.tags.length === 0 ? (
                          <span className="text-[10px] text-slate-600">—</span>
                        ) : (
                          a.tags.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-400">
                              <Tag className="h-3 w-3" />
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 md:py-4 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                      {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3 md:py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleApprove(a.id)}
                          disabled={busyId === a.id}
                          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-40"
                        >
                          <CheckCircle2 className={`h-3.5 w-3.5 ${busyId === a.id ? 'animate-spin' : ''}`} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(a.id)}
                          disabled={busyId === a.id}
                          className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-rose-400 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-40"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default GovernanceView;
