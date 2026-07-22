import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiGet, apiPost } from '../lib/apiClient';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

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
}

interface GovernanceGatePluginProps {
  plugin: IKudbeePlugin;
}

export function GovernanceGatePlugin({ plugin }: GovernanceGatePluginProps) {
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  const fetchPending = async () => {
    try {
      setLoading(true);
      const data = await apiGet<PendingAction[]>('/api/governance/pending');
      setPending(Array.isArray(data) ? data : []);
    } catch {
      setPending([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPending();
    const id = setInterval(() => void fetchPending(), 8000);
    return () => clearInterval(id);
  }, []);

  const decide = async (actionId: string, decision: 'approve' | 'reject') => {
    setActingId(actionId);
    try {
      const endpoint = decision === 'approve'
        ? '/api/governance/approve'
        : '/api/governance/reject';
      await apiPost(endpoint, { id: actionId });
      setPending((prev) => prev.filter((a) => a.id !== actionId));
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
        <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto">
          {pending.slice(0, 6).map((action) => (
            <div
              key={action.id}
              className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[10px] font-semibold text-amber-200">
                    {action.task || action.agent_id || action.proposed_model}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[9px] font-mono text-slate-500">
                    <span>{action.proposed_model}</span>
                    <span>est ${Number(action.estimated_cost).toFixed(4)}</span>
                    <span>{action.reasoning_tokens} tok</span>
                  </div>
                  {action.reasoning && (
                    <div className="mt-1 truncate font-mono text-[8px] text-slate-600">
                      {action.reasoning}
                    </div>
                  )}
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

export default GovernanceGatePlugin;
