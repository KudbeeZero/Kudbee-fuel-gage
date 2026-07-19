/**
 * apps/web/src/components/plugins/ThinkStreamPlugin.tsx
 * ---------------------------------------------------------------------------
 * DAW-style "Think: Stream" plugin (4-col). Binds the verified useThinkStream
 * hook to render the scrolling chain-of-thought reasoning tokens and a compact
 * telemetry line (tokens in/out, model).
 *
 * Strictly typed — no `any`.
 */
import { useThinkStream } from '../../hooks/useThinkStream';
import type { ThinkThought } from '@kudbee/types';

function ThoughtRow({ t }: { t: ThinkThought }) {
  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2">
      <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-slate-500">
        <span className="truncate text-emerald-300/80">{t.model}</span>
        <span>
          {t.tokens_in}→{t.tokens_out} tok
        </span>
      </div>
      <p className="mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-400">
        {t.thought}
      </p>
    </div>
  );
}

export function ThinkStreamPlugin() {
  const { thoughts, latest, loading, error } = useThinkStream(20, 4000);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-cyan-500/25 bg-slate-900/60 p-4">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-cyan-200">
            Think: Stream
          </h3>
        </div>
        <span className="font-mono text-[9px] text-slate-500">
          {loading ? 'syncing…' : `${thoughts.length} blocks`}
        </span>
      </div>

      {latest && (
        <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] p-2">
          <p className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-300">
            {latest.thought}
            <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-cyan-400" />
          </p>
        </div>
      )}

      <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: 260 }}>
        {error ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 font-mono text-[10px] text-amber-300">
            stream offline: {error}
          </div>
        ) : thoughts.length === 0 ? (
          <div className="font-mono text-[10px] text-slate-600">awaiting reasoning tokens…</div>
        ) : (
          thoughts.map((t) => <ThoughtRow key={t.id} t={t} />)
        )}
      </div>
    </div>
  );
}

export default ThinkStreamPlugin;
