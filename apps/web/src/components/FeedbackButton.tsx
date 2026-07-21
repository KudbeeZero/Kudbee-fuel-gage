import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, X } from 'lucide-react';

interface FeedbackButtonProps {
  traceId: string;
  onFeedbackSubmitted?: (verdict: string) => void;
}

export function FeedbackButton({ traceId, onFeedbackSubmitted }: FeedbackButtonProps) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');

  const submit = async (verdict: 'thumbs_up' | 'thumbs_down') => {
    setSubmitting(verdict);
    setError(null);
    try {
      const res = await fetch('/api/governance/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traceId, verdict, notes: note || undefined })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Feedback failed (${res.status})`);
      }
      setSubmitted(verdict);
      setShowNote(false);
      setNote('');
      onFeedbackSubmitted?.(verdict);
      setTimeout(() => setSubmitted(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Feedback submission failed');
    } finally {
      setSubmitting(null);
    }
  };

  if (submitted) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
        <Check className="w-3 h-3" /> Feedback recorded
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => submit('thumbs_up')}
        disabled={submitting !== null}
        title="Mark this trace as correct"
        className="p-1 rounded border border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-all disabled:opacity-40"
      >
        <ThumbsUp className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => { setShowNote(!showNote); }}
        disabled={submitting !== null}
        title="Report false positive/negative"
        className="p-1 rounded border border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-all disabled:opacity-40"
      >
        <ThumbsDown className="w-3 h-3" />
      </button>
      {showNote && (
        <span className="inline-flex items-center gap-1 ml-1">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Expected behavior..."
            className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-950 border border-slate-700 rounded text-slate-300 w-32"
          />
          <button
            type="button"
            onClick={() => submit('thumbs_down')}
            className="p-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
      {error && <span className="text-[9px] text-rose-400 ml-1">{error}</span>}
    </span>
  );
}
