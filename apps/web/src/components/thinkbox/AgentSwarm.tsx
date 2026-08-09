import { Zap, Wifi, WifiOff, Activity, Clock } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';

export function AgentSwarm() {
  const { viewModel, loading, error } = useDashboardSync();
  const agents = viewModel.agents || [];

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100 font-mono">Agent Swarm</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {agents.filter((a) => a.status === 'online').length}/{agents.length} online
        </span>
      </div>

      {loading && agents.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity className="w-3 h-3 animate-pulse" />
          Connecting to agent fleet...
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 font-mono">Agent fleet unavailable: {error}</div>
      )}

      {!loading && agents.length === 0 && !error && (
        <div className="text-xs text-slate-600 font-mono text-center py-4">
          No agents detected. Register agents via kudbee:agent:state in Redis.
        </div>
      )}

      <div className="space-y-1 max-h-80 overflow-y-auto">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
              agent.status === 'online'
                ? 'border-emerald-800/30 bg-emerald-950/20'
                : 'border-slate-800/30 bg-slate-950/20 opacity-60'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {agent.status === 'online' && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  agent.status === 'online' ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-200 truncate">{agent.name}</span>
                <span className="text-[9px] text-slate-600 font-mono">{agent.role}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-500 font-mono">{agent.task}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={agent.status === 'online' ? 'text-emerald-400' : 'text-slate-600'}>
                {agent.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              </span>
              {agent.lastEvent && (
                <span className="text-[9px] text-slate-600">
                  <Clock className="w-3 h-3 inline mr-0.5" />
                  {agent.lastEvent}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentSwarm;
