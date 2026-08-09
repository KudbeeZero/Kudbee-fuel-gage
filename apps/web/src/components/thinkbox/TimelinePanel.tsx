import { Clock, Activity, GitBranch, Play, XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';

export function TimelinePanel() {
  const { viewModel } = useDashboardSync();
  const timeline = viewModel.timeline || [];
  const executions = timeline.filter(t => t.type === 'deploy' || t.type === 'ci');
  const agentEvents = timeline.filter(t => t.type === 'agent');
  const telemetryEvents = timeline.filter(t => t.type !== 'deploy' && t.type !== 'ci' && t.type !== 'agent');

  const typeBadge = (type: string) => {
    switch (type) {
      case 'deploy': return { label: 'DEPLOY', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
      case 'ci': return { label: 'CI', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
      case 'agent': return { label: 'AGENT', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
      default: return { label: 'EVENT', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
    }
  };

  const severityIcon = (s: string) => {
    switch (s) {
      case 'success': return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case 'error': return <XCircle className="w-3 h-3 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-3 h-3 text-amber-400" />;
      default: return <Activity className="w-3 h-3 text-slate-500" />;
    }
  };

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100 font-mono">Timeline</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{timeline.length} events</span>
      </div>

      {timeline.length === 0 ? (
        <div className="text-[10px] text-slate-600 font-mono text-center py-6">
          No events recorded. Telemetry events appear as they are ingested via the telemetry pipeline.
        </div>
      ) : (
        <div className="relative pl-4 border-l border-slate-800 space-y-2 max-h-96 overflow-y-auto">
          {timeline.slice(0, 20).map((event) => {
            const badge = typeBadge(event.type);
            return (
              <div key={event.id} className="relative pb-2">
                <div className="absolute -left-[21px] top-1.5">{severityIcon(event.severity)}</div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[8px] font-mono px-1.5 py-0 rounded border ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="text-[9px] text-slate-600 font-mono">
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}
                  </span>
                  {event.agentId && (
                    <span className="text-[9px] text-slate-600 font-mono">{event.agentId}</span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-300 font-mono">{event.message}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary counts */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
        <span className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" /> {executions.length} executions
        </span>
        <span className="flex items-center gap-1">
          <Play className="w-3 h-3" /> {agentEvents.length} agents
        </span>
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" /> {telemetryEvents.length} telemetry
        </span>
      </div>
    </div>
  );
}

export default TimelinePanel;
