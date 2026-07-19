import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, CheckCircle2, XCircle, Cpu } from 'lucide-react';
import { apiPost } from '../lib/apiClient';

export interface HermesSuggestion {
  id: string;
  action?: string;
  tags?: string[];
  prompt?: string;
  detail?: string;
  proposed_at?: string;
}

interface GovernanceToastProps {
  suggestion: HermesSuggestion;
  onDismiss: (id: string) => void;
  onApproved?: (id: string) => void;
}

/**
 * A single HERMES suggestion toast (top-right corner). Shows the action
 * description with Approve / Dismiss. Approve calls /api/governance/approve.
 */
function Toast({ suggestion, onDismiss, onApproved }: GovernanceToastProps) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'approved' | 'dismissed' | null>(null);

  const handleApprove = async () => {
    setBusy(true);
    try {
      await apiPost('/api/governance/approve', { id: suggestion.id });
      setDone('approved');
      onApproved?.(suggestion.id);
    } catch {
      // Keep the toast visible on failure so the operator can retry.
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    setDone('dismissed');
    onDismiss(suggestion.id);
  };

  const title = suggestion.action === 'OPTIMIZE_MEMORY' ? 'HERMES · Memory Optimization' : 'HERMES · Logic Promotion';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="pointer-events-auto w-80 rounded-2xl border border-emerald-500/30 bg-slate-900/95 p-4 shadow-[0_0_24px_rgba(16,185,129,0.18)] backdrop-blur"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <Sparkles className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-emerald-400/70" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
              {title}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
            {suggestion.detail ||
              suggestion.prompt ||
              'HERMES proposed an optimization for your review.'}
          </p>
          {suggestion.tags && suggestion.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestion.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-400"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {done === 'approved' ? (
          <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approved · moved to PROVEN
          </span>
        ) : done === 'dismissed' ? (
          <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">
            <XCircle className="h-3.5 w-3.5" /> Dismissed
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-40"
            >
              <CheckCircle2 className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              Approve
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-40"
            >
              <XCircle className="h-3.5 w-3.5" />
              Dismiss
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

interface GovernanceToastStackProps {
  suggestions: HermesSuggestion[];
  onDismiss: (id: string) => void;
  onApproved?: (id: string) => void;
}

/**
 * Top-right stack of HERMES suggestion toasts. Auto-dismisses after 20s.
 */
export function GovernanceToastStack({ suggestions, onDismiss, onApproved }: GovernanceToastStackProps) {
  const [, force] = useState(0);

  // Auto-dismiss each suggestion after 20s (so the stack never piles up).
  useEffect(() => {
    if (suggestions.length === 0) return;
    const timers = suggestions.map((s) =>
      setTimeout(() => {
        onDismiss(s.id);
        force((n) => n + 1);
      }, 20000)
    );
    return () => timers.forEach(clearTimeout);
  }, [suggestions, onDismiss]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {suggestions.map((s) => (
          <Toast key={s.id} suggestion={s} onDismiss={onDismiss} onApproved={onApproved} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default GovernanceToastStack;
