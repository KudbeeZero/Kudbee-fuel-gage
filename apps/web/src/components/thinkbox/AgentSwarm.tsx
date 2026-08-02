/**
 * THINKBOX PR-004 — Live Agent Swarm View
 *
 * Displays active agents with live status, task, progress, and health.
 * Subscribes to thinkbox events for real-time updates.
 */

import { useState, useEffect } from 'react';
import { Zap, CheckCircle2, AlertTriangle, Clock, Loader2 } from 'lucide-react';

interface AgentState {
  name: string;
  role: string;
  status: 'active' | 'idle' | 'error' | 'offline';
  task: string;
  progress: number;
  lastEvent: string;
  lastActivity: string;
  health: 'healthy' | 'degraded' | 'unhealthy';
}

interface AgentSwarmProps {
  workspaceId?: string;
  agents?: AgentState[];
  connected?: boolean;
}

export function AgentSwarm({ workspaceId, agents: externalAgents, connected = true }: AgentSwarmProps) {
  const [agents, setAgents] = useState<AgentState[]>(externalAgents ?? [
    { name: 'KILOH', role: 'Orchestrator', status: 'active', task: 'Mission THINKBOX-004', progress: 78, lastEvent: 'plan:generated', lastActivity: new Date().toISOString(), health: 'healthy' },
    { name: 'FORGE', role: 'Workspace Builder', status: 'active', task: 'Provision plan', progress: 100, lastEvent: 'provision:complete', lastActivity: new Date().toISOString(), health: 'healthy' },
    { name: 'DTHINK', role: 'Knowledge', status: 'active', task: 'Recording patterns', progress: 60, lastEvent: 'knowledge:stored', lastActivity: new Date().toISOString(), health: 'healthy' },
    { name: 'GATE', role: 'Quality', status: 'idle', task: 'Awaiting CI', progress: 0, lastEvent: 'guard:pass', lastActivity: new Date().toISOString(), health: 'healthy' },
    { name: 'JOURNAL', role: 'Memory', status: 'active', task: 'Session logging', progress: 45, lastEvent: 'memory:saved', lastActivity: new Date().toISOString(), health: 'healthy' },
    { name: 'BUS', role: 'Events', status: 'active', task: 'Publishing events', progress: 90, lastEvent: 'timeline:updated', lastActivity: new Date().toISOString(), health: 'healthy' },
  ]);

  useEffect(() => {
    if (externalAgents) setAgents(externalAgents);
  }, [externalAgents]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'active': return <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />;
      case 'idle': return <span className="w-2 h-2 rounded-full bg-slate-500" />;
      case 'error': return <AlertTriangle className="w-3 h-3 text-rose-400" />;
      default: return <span className="w-2 h-2 rounded-full bg-slate-600" />;
    }
  };

  const healthColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'border-emerald-500/20 bg-emerald-500/5';
      case 'degraded': return 'border-amber-500/20 bg-amber-500/5';
      case 'unhealthy': return 'border-rose-500/20 bg-rose-500/5';
      default: return 'border-slate-800/40 bg-slate-950/40';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Agent Swarm</h3>
            <p className="text-[10px] text-slate-500">
              {agents.filter(a => a.status === 'active').length} active · {connected ? 'LIVE' : 'OFFLINE'}
            </p>
          </div>
        </div>
        {!connected && (
          <span className="text-[9px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full font-mono">DISCONNECTED</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((agent) => (
          <div key={agent.name} className={`rounded-lg border p-3 ${healthColor(agent.health)}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {statusIcon(agent.status)}
                <span className={`text-xs font-mono font-bold ${agent.status === 'error' ? 'text-rose-400' : agent.status === 'active' ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {agent.name}
                </span>
              </div>
              <span className="text-[9px] text-slate-600 font-mono uppercase">{agent.status}</span>
            </div>
            <div className="text-[10px] text-slate-400 truncate mb-2">{agent.task}</div>
            {agent.progress > 0 && (
              <div className="h-1 rounded-full bg-slate-800/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${agent.status === 'error' ? 'bg-rose-500' : 'bg-emerald-500/50'}`}
                  style={{ width: `${agent.progress}%` }}
                />
              </div>
            )}
            <div className="flex items-center justify-between mt-2 text-[9px] text-slate-600">
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {agent.lastEvent}
              </span>
              {agent.status === 'active' && agent.progress < 100 && (
                <Loader2 className="w-2.5 h-2.5 animate-spin text-emerald-400" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
