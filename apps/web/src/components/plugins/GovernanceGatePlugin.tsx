/**
 * apps/web/src/components/plugins/GovernanceGatePlugin.tsx
 * ---------------------------------------------------------------------------
 * DAW-style "Governance Gate" plugin (8-col). Encapsulates the verified HITL
 * Governance Intervention gate: binds useGovernanceStream and exposes
 * submitApproval so the operator can APPROVE (release) or REJECT (kill) a
 * pending proposed action. Self-contained (owns its hook) so it drops into the
 * rack independently.
 *
 * Strictly typed — no `any`.
 */
import { useState } from 'react';
import { AlertTriangle, BadgeCheck, ShieldX } from 'lucide-react';
import { useGovernanceStream } from '../../hooks/useGovernanceStream';
import type { ApprovalRequest, ApprovalDecision } from '@kudbee/types';

function GovernanceInterventionCard({
  pending,
  onResolve
}: {
  pending: ApprovalRequest[];
  onResolve: (id: string, decision: ApprovalDecision) => Promise<boolean>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handle = async (id: string, decision: ApprovalDecision) => {
    setBusyId(id);
    try {
      await onResolve(id, decision);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      id="governance-intervention-card"
      className="relative overflow-hidden rounded-2xl border border-rose-500/40 bg-rose-500/5"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/60 to-transparent" />
      <div className="flex items-center justify-between border-b border-rose-500/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 animate-pulse text-rose-400" />
          <h3 className="font-display text-sm font-semibold text-rose-200">
            Governance Intervention Required
          </h3>
        </div>
        <span className="rounded bg-rose-500/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-rose-300">
          {pending.length} pending
        </span>
      </div>

      <div className="divide-y divide-rose-500/10">
        {pending.map((req) => (
          <div key={req.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
              <span className="text-slate-400">
                model <span className="text-rose-200">{req.proposed_model}</span>
              </span>
              <span className="text-slate-400">
                est. cost <span className="text-amber-300">${Number(req.estimated_cost).toFixed(4)}</span>
              </span>
              <span className="text-slate-400">
                reasoning <span className="text-emerald-300">{req.reasoning_tokens} tok</span>
              </span>
              {req.agent_id && <span className="text-slate-500">agent {req.agent_id}</span>}
            </div>
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/50 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
              {req.reasoning || '(no reasoning provided)'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busyId === req.id}
                onClick={() => void handle(req.id, 'APPROVE')}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-mono font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                Approve &amp; Release
              </button>
              <button
                type="button"
                disabled={busyId === req.id}
                onClick={() => void handle(req.id, 'REJECT')}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-mono font-semibold text-rose-300 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
              >
                <ShieldX className="h-3.5 w-3.5" />
                Reject &amp; Kill
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GovernanceGatePlugin() {
  const { pending, submitApproval } = useGovernanceStream();

  return (
    <div className="flex h-full flex-col rounded-2xl border border-rose-500/20 bg-slate-900/60 p-4">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <ShieldX className="h-4 w-4 text-rose-400" />
          <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-rose-200">
            Governance Gate
          </h3>
        </div>
        <span
          className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
            pending.length > 0
              ? 'bg-rose-500/15 text-rose-300'
              : 'bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {pending.length > 0 ? `${pending.length} pending` : 'clear'}
        </span>
      </div>

      <div className="mt-3">
        {pending.length > 0 ? (
          <GovernanceInterventionCard pending={pending} onResolve={submitApproval} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 py-10 text-slate-600">
            <BadgeCheck className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No pending interventions. Gate is clear.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default GovernanceGatePlugin;
