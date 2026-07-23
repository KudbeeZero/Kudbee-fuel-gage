import { useBatcherState } from '../hooks/useBatcherState';
import { Loader2, CheckCircle2 } from 'lucide-react';

export function BatcherIndicator() {
  const { queueLength, flushing, batchPending } = useBatcherState();

  if (queueLength === 0 && !flushing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-slate-600">
        <CheckCircle2 className="h-2.5 w-2.5 text-slate-600" />
        IDLE
      </span>
    );
  }

  if (flushing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan-300">
        <Loader2 className="h-2.5 w-2.5 animate-spin text-cyan-400" />
        FLUSHING {queueLength}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-300"
      title={`${queueLength} events queued, flush in <1s`}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
      </span>
      BATCHING {queueLength}
    </span>
  );
}
