import { Play, Pause, XCircle, CheckCircle2, AlertTriangle, Clock, GitBranch } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';
import { useGovernanceStream } from '../../hooks/useGovernanceStream';

export function ExecutionPanel() {
  const { viewModel } = useDashboardSync();
  const { pending: pendingApprovals, submitApproval } = useGovernanceStream();
  const execution = viewModel.execution;
  const timeline = viewModel.timeline || [];

  const percentComplete = execution.totalCommands > 0
    ? Math.round((execution.completedCount / execution.totalCommands) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100 font-mono">Execution</h3>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
          execution.status === 'running'
            ? 'text-emerald-400 border-emerald-800/30 bg-emerald-950/20'
            : execution.status === 'paused'
              ? 'text-amber-400 border-amber-800/30 bg-amber-950/20'
              : 'text-slate-500 border-slate-800/30 bg-slate-950/20'
        }`}>
          {execution.status}
        </span>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-500">Progress</span>
          <span className="text-slate-300">{execution.completedCount}/{execution.totalCommands} complete</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              execution.status === 'running' ? 'bg-amber-500' : 'bg-slate-600'
            }`}
            style={{ width: `${Math.min(100, percentComplete)}%` }}
          />
        </div>
        {execution.currentCommand && (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <GitBranch className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400">{execution.currentCommand}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Complete</div>
          <div className="text-sm font-bold text-emerald-400 font-mono">{execution.completedCount}</div>
        </div>
        <div className="rounded-lg border border-red-800/20 bg-red-950/20 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Failed</div>
          <div className="text-sm font-bold text-red-400 font-mono">{execution.failedCount}</div>
        </div>
        <div className="rounded-lg border border-amber-800/20 bg-amber-950/20 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Pending</div>
          <div className="text-sm font-bold text-amber-400 font-mono">{execution.pendingApprovals}</div>
        </div>
      </div>

      {/* Pending governance approvals */}
      {pendingApprovals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            HITL Approvals Required
          </div>
          {pendingApprovals.slice(0, 3).map((req) => (
            <div key={req.id} className="rounded-lg border border-amber-800/30 bg-amber-950/20 p-2.5">
              <div className="text-[10px] text-zinc-300 font-mono truncate">{req.id}</div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => submitApproval(req.id, 'APPROVE')}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono hover:bg-emerald-500/20"
                >
                  <CheckCircle2 className="w-3 h-3" /> Approve
                </button>
                <button
                  onClick={() => submitApproval(req.id, 'REJECT')}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 font-mono hover:bg-red-500/20"
                >
                  <XCircle className="w-3 h-3" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent execution events */}
      <div className="space-y-1">
        <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Recent Events</span>
        {timeline.filter(t => t.type === 'deploy' || t.type === 'ci').slice(0, 5).map((event) => (
          <div key={event.id} className="flex items-center gap-2 text-[10px] py-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              event.severity === 'success' ? 'bg-emerald-400' :
              event.severity === 'error' ? 'bg-red-400' : 'bg-slate-500'
            }`} />
            <span className="text-zinc-300 font-mono truncate flex-1">{event.message}</span>
            <Clock className="w-3 h-3 text-slate-600 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ExecutionPanel;
