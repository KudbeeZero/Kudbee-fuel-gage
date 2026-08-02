/**
 * THINKBOX PR-006 — Plugin Manager
 *
 * Plugin runtime: register, enable, disable, unload plugins.
 * Lifecycle: install → enable → disable → unload.
 * Shows registered plugins with their panels, commands, and handlers.
 */

import { useState } from 'react';
import { Puzzle, Play, Square, Trash2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  status: 'installed' | 'enabled' | 'disabled' | 'error';
  panels: string[];
  commands: Array<{ name: string; description: string }>;
  eventHandlers: string[];
  providerKinds: string[];
}

interface PluginManagerProps {
  plugins?: PluginInfo[];
  onEnable?: (id: string) => void;
  onDisable?: (id: string) => void;
  onUnload?: (id: string) => void;
}

export function PluginManager({ plugins: external, onEnable, onDisable, onUnload }: PluginManagerProps) {
  const [plugins] = useState<PluginInfo[]>(external ?? [
    { id: 'core-agent-swarm', name: 'Agent Swarm', version: '1.0.0', description: 'Live agent collaboration and status monitoring', status: 'enabled', panels: ['agent-swarm', 'agent-detail'], commands: [{ name: '/agents', description: 'List agents' }, { name: '/agent status', description: 'Agent status' }], eventHandlers: ['agent:*', 'workspace:*'], providerKinds: [] },
    { id: 'core-execution-engine', name: 'Execution Engine', version: '1.0.0', description: 'Governed command execution with approval gates', status: 'enabled', panels: ['execution-queue', 'approval-panel'], commands: [{ name: '/execute', description: 'Start execution' }], eventHandlers: ['execution:*', 'healing:*'], providerKinds: [] },
    { id: 'core-timeline', name: 'Timeline Engine', version: '1.0.0', description: 'Replayable event timeline', status: 'enabled', panels: ['timeline-view'], commands: [{ name: '/timeline', description: 'Show timeline' }], eventHandlers: ['timeline:*'], providerKinds: [] },
    { id: 'core-terminal', name: 'Interactive Terminal', version: '1.0.0', description: 'Live command execution and agent communication', status: 'enabled', panels: ['terminal-panel'], commands: [], eventHandlers: ['terminal:*'], providerKinds: [] },
    { id: 'core-architecture', name: 'Architecture Graph', version: '1.0.0', description: 'Interactive dependency visualization', status: 'enabled', panels: ['architecture-graph'], commands: [{ name: '/graph', description: 'Show graph' }], eventHandlers: ['graph:*'], providerKinds: [] },
  ]);

  const statusColors: Record<string, string> = {
    enabled: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    disabled: 'text-slate-500 bg-slate-500/10 border-slate-500/20',
    installed: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    error: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
            <Puzzle className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Plugins</h3>
            <p className="text-[10px] text-slate-500">{plugins.length} registered</p>
          </div>
        </div>
        <span className="text-[9px] text-slate-600 font-mono">v1.0 runtime</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {plugins.map(p => (
          <div key={p.id} className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'enabled' ? 'bg-emerald-400' : p.status === 'error' ? 'bg-rose-400' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-mono text-slate-300 font-bold">{p.name}</span>
              </div>
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-mono ${statusColors[p.status]}`}>{p.status}</span>
            </div>
            <p className="text-[9px] text-slate-500 mb-2">{p.description}</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {p.panels.map(panel => (
                <span key={panel} className="text-[7px] px-1 py-0.5 rounded bg-slate-800/50 text-slate-500 font-mono">{panel}</span>
              ))}
            </div>
            <div className="flex gap-1">
              {p.status !== 'enabled' && onEnable && (
                <button onClick={() => onEnable(p.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-mono hover:bg-emerald-500/20"><Play className="w-2 h-2" /> Enable</button>
              )}
              {p.status === 'enabled' && onDisable && (
                <button onClick={() => onDisable(p.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[8px] font-mono hover:bg-amber-500/20"><Square className="w-2 h-2" /> Disable</button>
              )}
              {onUnload && (
                <button onClick={() => onUnload(p.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[8px] font-mono hover:bg-rose-500/20"><Trash2 className="w-2 h-2" /> Unload</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
