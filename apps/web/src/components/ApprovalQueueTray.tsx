import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Cpu, Tag, Clock, Zap } from 'lucide-react';
import type { ApprovalRequest, ApprovalDecision } from '@kudbee/types';

interface ApprovalQueueTrayProps {
  pending: ApprovalRequest[];
  onResolve: (id: string, decision: ApprovalDecision) => Promise<boolean>;
}

export function ApprovalQueueTray({ pending, onResolve }: ApprovalQueueTrayProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleResolve = async (id: string, decision: ApprovalDecision) => {
    setBusyId(id);
    try {
      await onResolve(id, decision);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      id="approval-queue-tray"
      className="relative overflow-hidden rounded-2xl border border-rose-500/40 bg-rose-500/5 lg:col-span-3"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/60 to-transparent" />
      <div className="flex items-center justify-between border-b border-rose-500/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 animate-pulse text-rose-400" />
          <h3 className="font-display text-sm font-semibold text-rose-200">
            Approval Queue
          </h3>
        </div>
        <span className="rounded bg-rose-500/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-rose-300">
          {pending.length} pending
        </span>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-4">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <CheckCircle2 className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No pending approvals. Queue is clear.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {pending.map((req) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="group rounded-xl border border-rose-500/15 bg-slate-950/60 p-4 hover:border-rose-500/30 transition-colors"
                >
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
                    {req.agent_id && (
                      <span className="text-slate-500">agent {req.agent_id}</span>
                    )}
                  </div>

                  <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/50 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
                    {req.reasoning || '(no reasoning provided)'}
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void handleResolve(req.id, 'APPROVE')}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50"
                    >
                      <CheckCircle2 className={`h-3.5 w-3.5 ${busyId === req.id ? 'animate-spin' : ''}`} />
                      {busyId === req.id ? 'Executing…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void handleResolve(req.id, 'REJECT')}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-rose-300 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {busyId === req.id ? 'Executing…' : 'Deny'}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
