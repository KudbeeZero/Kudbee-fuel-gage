import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Cpu, Clock, Zap, Brain, Activity } from 'lucide-react';
import type { ThinkTrajectory } from '@kudbee/types';

interface GovernanceQueueTrayProps {
  pending: ThinkTrajectory[];
  onPromote: (hash: string, status: 'VERIFIED' | 'RECYCLED', reviewerNotes?: string, tokenId?: string) => Promise<boolean>;
}

export function GovernanceQueueTray({ pending, onPromote }: GovernanceQueueTrayProps) {
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});

  const handlePromote = async (hash: string, tokenId: string, status: 'VERIFIED' | 'RECYCLED') => {
    setBusyHash(hash);
    try {
      await onPromote(hash, status, reviewerNotes[hash] || '', tokenId);
      setReviewerNotes((prev) => {
        const next = { ...prev };
        delete next[hash];
        return next;
      });
    } finally {
      setBusyHash(null);
    }
  };

  return (
    <div
      id="think-governance-queue-tray"
      className="relative overflow-hidden rounded-2xl border border-violet-500/40 bg-violet-500/5 lg:col-span-3"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />
      <div className="flex items-center justify-between border-b border-violet-500/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 animate-pulse text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-violet-200">
            Think Token Governance Queue
          </h3>
        </div>
        <span className="rounded bg-violet-500/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-violet-300">
          {pending.length} pending
        </span>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-4">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <CheckCircle2 className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No pending think tokens. Queue is clear.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {pending.map((token) => {
                const isBusy = busyHash === token.token_hash;
                const coords = token.spatial_coordinates || [];
                const x = coords[0] ?? 0;
                const y = coords[1] ?? 0;
                const z = coords[2] ?? 0;
                const context = token.task_context || {};
                const agentOrigin = context.agent as string || context.source as string || 'unknown';

                return (
                  <motion.div
                    key={token.token_hash}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="group rounded-xl border border-violet-500/15 bg-slate-950/60 p-4 hover:border-violet-500/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-violet-300">{token.token_hash}</span>
                      <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-400">
                        {token.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
                      <span className="text-slate-400">
                        agent <span className="text-violet-200">{agentOrigin}</span>
                      </span>
                      {context.cost !== undefined && (
                        <span className="text-slate-400">
                          cost <span className="text-amber-300">${Number(context.cost).toFixed(4)}</span>
                        </span>
                      )}
                      {context.latencyMs !== undefined && (
                        <span className="text-slate-400">
                          latency <span className="text-cyan-300">{Number(context.latencyMs)}ms</span>
                        </span>
                      )}
                      <span className="text-slate-500">3D ({x.toFixed(2)}, {y.toFixed(2)}, {z.toFixed(2)})</span>
                    </div>

                    {token.correction_delta && (
                      <p className="mt-2 max-h-20 overflow-y-auto truncate rounded-lg border border-slate-800 bg-slate-950/50 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
                        {token.correction_delta}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={reviewerNotes[token.token_hash] || ''}
                        onChange={(e) => setReviewerNotes((prev) => ({ ...prev, [token.token_hash]: e.target.value }))}
                        placeholder="Reviewer notes (optional)"
                        className="flex-1 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 font-mono text-[10px] text-slate-300 placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handlePromote(token.token_hash, token.id, 'VERIFIED')}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50"
                      >
                        <CheckCircle2 className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                        {isBusy ? 'Promoting…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handlePromote(token.token_hash, token.id, 'RECYCLED')}
                        className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-sky-300 transition-all hover:bg-sky-500/20 active:scale-95 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {isBusy ? 'Recycling…' : 'Discard'}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
