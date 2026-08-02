/** THINKBOX PR-014A — NotificationCenter placeholder */
import { Bell } from 'lucide-react';
export function NotificationCenter() {
  return <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10"><Bell className="w-3.5 h-3.5 text-amber-400" /></div><h3 className="font-display text-sm font-semibold text-slate-200">Notifications</h3></div><p className="text-[10px] text-slate-500 mt-2">Unified notification center with BUS event subscriptions — coming in PR-014D.</p></div>;
}
