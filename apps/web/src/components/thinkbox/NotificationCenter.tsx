import { Bell, AlertTriangle, Info, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';

export function NotificationCenter() {
  const { viewModel } = useDashboardSync();
  const notifications = viewModel.notifications || [];
  const timeline = viewModel.timeline || [];

  const severityBadge = (s: string) => {
    switch (s) {
      case 'error':
        return { icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-950/30', border: 'border-rose-800/30' };
      case 'warning':
        return { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-950/30', border: 'border-amber-800/30' };
      case 'success':
        return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-800/30' };
      default:
        return { icon: Info, color: 'text-blue-400', bg: 'bg-blue-950/30', border: 'border-blue-800/30' };
    }
  };

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100 font-mono">Notifications</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{timeline.length} events</span>
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Active</span>
          {notifications.slice(0, 5).map((n) => {
            const s = severityBadge(n.severity);
            const Icon = s.icon;
            return (
              <div key={n.id} className={`flex items-start gap-2 rounded-lg border p-2.5 ${s.bg} ${s.border}`}>
                <Icon className={`w-3 h-3 ${s.color} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-mono font-semibold ${s.color}`}>{n.title}</div>
                  <div className="text-[9px] text-slate-400 font-mono">{n.message}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline events */}
      <div className="space-y-1.5">
        <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Recent Events</span>
        {timeline.length === 0 ? (
          <div className="text-[10px] text-slate-600 font-mono text-center py-3">
            No events recorded yet.
          </div>
        ) : (
          timeline.slice(0, 12).map((event) => {
            const s = severityBadge(event.severity);
            const Icon = s.icon;
            return (
              <div key={event.id} className="flex items-center gap-2 py-1">
                <Icon className={`w-2.5 h-2.5 ${s.color} flex-shrink-0`} />
                <span className="text-[10px] text-zinc-300 font-mono truncate flex-1">{event.message}</span>
                <span className="text-[9px] text-slate-600 font-mono flex-shrink-0">
                  {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default NotificationCenter;
