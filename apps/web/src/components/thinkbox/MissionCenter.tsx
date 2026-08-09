import { Target, AlertTriangle, CheckCircle2, Clock, BarChart3 } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';

export function MissionCenter() {
  const { viewModel } = useDashboardSync();
  const mission = viewModel.mission;
  const health = viewModel.health;

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'P0': return 'text-rose-400 border-rose-800/30 bg-rose-950/20';
      case 'P1': return 'text-amber-400 border-amber-800/30 bg-amber-950/20';
      default: return 'text-slate-400 border-slate-800/30 bg-slate-950/20';
    }
  };

  const getGradeColor = (g: string) => {
    if (g === 'A') return 'text-emerald-400';
    if (g === 'B') return 'text-amber-400';
    return 'text-slate-500';
  };

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-zinc-100 font-mono">Mission Center</h3>
      </div>

      {/* Objective */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Current Mission</span>
          <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${getPriorityColor(mission.priority)}`}>
            {mission.priority}
          </span>
        </div>
        <div className="text-xs text-zinc-300 font-mono leading-relaxed">{mission.objective}</div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Progress</div>
          <div className="text-lg font-bold text-emerald-400 font-mono">{mission.progress}%</div>
        </div>
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Confidence</div>
          <div className="text-lg font-bold text-blue-400 font-mono">{Math.round(mission.confidence * 100)}%</div>
        </div>
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Health</div>
          <div className={`text-lg font-bold font-mono ${getGradeColor(health.grade)}`}>{health.grade}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
          <span>Readiness</span>
          <span>{health.readyScore}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${Math.min(100, health.readyScore)}%` }}
          />
        </div>
      </div>

      {/* Status indicators */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-500">Bus Connected</span>
          <span className={health.busConnected ? 'text-emerald-400' : 'text-red-400'}>
            {health.busConnected ? <CheckCircle2 className="w-3 h-3 inline" /> : <AlertTriangle className="w-3 h-3 inline" />}
            {' '}{health.busConnected ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-500">SSE Connected</span>
          <span className={health.sseConnected ? 'text-emerald-400' : 'text-slate-600'}>
            {health.sseConnected ? <CheckCircle2 className="w-3 h-3 inline" /> : <Clock className="w-3 h-3 inline" />}
            {' '}{health.sseConnected ? 'Live' : 'Off'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-500">API Latency</span>
          <span className="text-slate-400">{health.apiLatencyMs}ms</span>
        </div>
      </div>

      {/* Agent count */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-800/50 bg-slate-950/30 px-3 py-2">
        <BarChart3 className="w-3 h-3 text-slate-500" />
        <span className="text-[10px] text-slate-400 font-mono">
          {health.agentsOnline}/{health.agentsTotal} agents online
        </span>
      </div>
    </div>
  );
}

export default MissionCenter;
