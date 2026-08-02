/** THINKBOX PR-014A — LiveTerminal placeholder */
import { Terminal } from 'lucide-react';
export function LiveTerminal() {
  return <div className="rounded-xl border border-slate-800/60 bg-slate-950/90 p-5"><div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-emerald-400" /><h3 className="font-display text-sm font-semibold text-slate-200">Interactive Terminal</h3></div><p className="text-[10px] text-slate-500 mt-2 font-mono">thinkbox:~$ _</p><p className="text-[10px] text-slate-600 mt-1">Live engineering terminal with BUS event streaming — coming in PR-014B.</p></div>;
}
