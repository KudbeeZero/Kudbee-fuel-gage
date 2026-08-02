/** THINKBOX PR-014A — TimelinePanel placeholder */
import { Clock } from 'lucide-react';
export function TimelinePanel() {
  return <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10"><Clock className="w-3.5 h-3.5 text-cyan-400" /></div><h3 className="font-display text-sm font-semibold text-slate-200">Event Timeline</h3></div><p className="text-[10px] text-slate-500 mt-2">Replayable event timeline with BUS subscriptions — coming in PR-014D.</p></div>;
}
