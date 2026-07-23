import { useState, useEffect, useRef } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { apiGet, apiPost } from '../lib/apiClient';
import { CheckCircle2, XCircle, Loader2, Lock } from 'lucide-react';

interface PendingAction {
  id: string;
  proposed_model: string;
  estimated_cost: number;
  reasoning_tokens: number;
  status: string;
  agent_id?: string;
  task?: string;
  reasoning?: string;
  created_at?: string;
  locked_by?: string;
}

interface GovernanceGatePluginProps {
  plugin: IKudbeePlugin;
}

const STATUS_MAP: Record<string, { label: string; classes: string }> = {
  VERIFIED: { label: 'VERIFIED', classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  PROVEN: { label: 'PROVEN', classes: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
  RECYCLED: { label: 'RECYCLED', classes: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  PENDING_APPROVAL: { label: 'PENDING', classes: 'border-amber-500/30 bg-amber-500/10 text-amber-300' }
};

function GovernanceGatePluginInner({ plugin }: GovernanceGatePluginProps) {
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const fetchPending = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true);
      const data = await apiGet<PendingAction[]>('/api/governance/pending');
      if (controller.signal.aborted) return;
      setPending(Array.isArray(data) ? data : []);
    } catch {
      if (controller.signal.aborted) return;
      setPending([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPending();
    const id = setInterval(() => void fetchPending(), 8000);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, []);

  const decide = async (actionId: string, decision: 'approve' | 'reject') => {
    setActingId(actionId);
    try {
      const endpoint = decision === 'approve'
        ? '/api/governance/approve'
        : '/api/governance/reject';
      await apiPost(endpoint, { id: actionId });
      setPending((prev) => prev.filter((a) => a.id !== actionId));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
      setToast({
        message: `Action ${actionId} ${decision === 'approve' ? 'approved' : 'rejected'}.`,
        type: decision === 'approve' ? 'success' : 'info'
      });
    } catch {
      setToast({ message: `Failed to ${decision} action ${actionId}.`, type: 'error' });
    } finally {
      setActingId(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const approveSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setActingId('__batch__');
    try {
      for (const id of ids) {
        await apiPost('/api/governance/approve', { id });
      }
      setPending((prev) => prev.filter((a) => !selected.has(a.id)));
      setToast({ message: `${ids.length} actions approved.`, type: 'success' });
      setSelected(new Set());
    } catch {
      setToast({ message: `Batch approval failed.`, type: 'error' });
    } finally {
      setActingId(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === pending.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pending.map((a) => a.id)));
    }
  };

  const statusBadge = (status: string) => {
    const entry = STATUS_MAP[status] || STATUS_MAP.PENDING_APPROVAL;
    return (
      <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${entry.classes}`}>
        {entry.label}
      </span>
    );
  };

  return (
    <PluginCard plugin={plugin} accent="border-amber-500/20" glow="via-amber-500/50">
      <p className="text-[11px] text-slate-400">
        Human-in-the-Loop approval gate — proposed agent actions await human sign-off before execution.
      </p>

      {loading && pending.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          probing gate…
        </div>
      ) : pending.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          gate clear · no pending actions
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.size === pending.length && pending.length > 0}
                onChange={toggleSelectAll}
                className="h-3 w-3 accent-violet-500"
              />
              Select All ({selected.size}/{pending.length})
            </label>
            {selected.size > 0 && (
              <button
                type="button"
                disabled={actingId === '__batch__'}
                onClick={() => void approveSelected()}
                className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[9px] font-bold uppercase text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
              >
                {actingId === '__batch__' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Approve Selected ({selected.size})
              </button>
            )}
          </div>

          <div className="mt-2 space-y-2 max-h-[220px] overflow-y-auto">
            {pending.slice(0, 6).map((action) => (
              <div
                key={action.id}
                className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={selected.has(action.id)}
                      onChange={() => toggleSelect(action.id)}
                      className="mt-0.5 h-3 w-3 accent-violet-500 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate font-mono text-[10px] font-semibold text-amber-200">
                          {action.task || action.agent_id || action.proposed_model}
                        </div>
                        {statusBadge(action.status)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[9px] font-mono text-slate-500">
                        <span>{action.proposed_model}</span>
                        <span>est ${Number(action.estimated_cost).toFixed(4)}</span>
                        <span>{action.reasoning_tokens} tok</span>
                      </div>
                      {action.locked_by && (
                        <div className="mt-1 flex items-center gap-1 font-mono text-[9px] text-violet-300">
                          <Lock className="h-2.5 w-2.5" />
                          Claimed by: {action.locked_by}
                        </div>
                      )}
                      {action.reasoning && (
                        <div className="mt-1 truncate font-mono text-[8px] text-slate-600">
                          {action.reasoning}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={actingId === action.id}
                      onClick={() => void decide(action.id, 'approve')}
                      className="rounded border border-emerald-500/30 bg-emerald-500/10 p-1 text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                      title="Approve"
                    >
                      {actingId === action.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={actingId === action.id}
                      onClick={() => void decide(action.id, 'reject')}
                      className="rounded border border-rose-500/30 bg-rose-500/10 p-1 text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
                      title="Deny"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {toast && (
        <div
          className={`mt-2 rounded border px-2.5 py-1.5 font-mono text-[10px] ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : toast.type === 'error'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : 'border-sky-500/30 bg-sky-500/10 text-sky-300'
          }`}
        >
          {toast.message}
        </div>
      )}
    </PluginCard>
  );
}

export function GovernanceGatePlugin(props: GovernanceGatePluginProps) {
  return (
    <PanelErrorBoundary panel={props.plugin.title}>
      <GovernanceGatePluginInner {...props} />
    </PanelErrorBoundary>
  );
}

export default GovernanceGatePlugin;
