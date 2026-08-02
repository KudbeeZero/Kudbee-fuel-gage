/** THINKBOX PR-014A — MissionCenter placeholder */
import { Target } from 'lucide-react';
export function MissionCenter() {
  return <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10"><Target className="w-3.5 h-3.5 text-violet-400" /></div><h3 className="font-display text-sm font-semibold text-slate-200">Mission Center</h3></div><p className="text-[10px] text-slate-500 mt-2">Mission dashboard with objective, progress, agents, and blockers — coming in PR-014E.</p></div>;
}
