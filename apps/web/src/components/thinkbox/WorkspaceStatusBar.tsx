/**
 * THINKBOX PR-008 — Workspace Status Bar
 *
 * Persistent bottom status bar showing: workspace readiness, agent count,
 * BUS connection, last event, execution status. Always visible across all
 * THINKBOX tabs.
 */

import { Wifi, WifiOff, Activity, Users, Clock, Zap, Shield, Play, Pause } from 'lucide-react';

interface StatusBarProps {
  readyScore?: number;
  grade?: string;
  agentsOnline?: number;
  agentsTotal?: number;
  busConnected?: boolean;
  sseConnected?: boolean;
  executionStatus?: string;
  lastEvent?: string;
  simulation?: boolean;
  onToggleSimulation?: () => void;
}

export function WorkspaceStatusBar({
  readyScore = 0,
  grade = 'F',
  agentsOnline = 0,
  agentsTotal = 6,
  busConnected = false,
  sseConnected = false,
  executionStatus = 'idle',
  lastEvent = '',
  simulation = true,
  onToggleSimulation,
}: StatusBarProps) {
  const scoreColor = readyScore >= 90 ? 'text-emerald-400' : readyScore >= 70 ? 'text-blue-400' : readyScore >= 50 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-800/60 bg-slate-950/80 text-[10px]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Ready</span>
          <span className={`font-mono font-bold ${scoreColor}`}>{readyScore}</span>
          <span className={`text-[9px] px-1 rounded font-mono ${grade === 'A' ? 'bg-emerald-500/10 text-emerald-400' : grade === 'B' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-500/10 text-slate-400'}`}>{grade}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Users className="w-3 h-3 text-slate-500" />
          <span className="text-slate-500">Agents</span>
          <span className={`font-mono ${agentsOnline === agentsTotal ? 'text-emerald-400' : 'text-amber-400'}`}>{agentsOnline}/{agentsTotal}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {busConnected ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-rose-400" />}
          <span className={`font-mono ${busConnected ? 'text-emerald-400' : 'text-rose-400'}`}>BUS</span>
          {sseConnected && <span className="text-slate-600">· SSE</span>}
        </div>

        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-slate-500" />
          <span className="text-slate-500">Execution</span>
          <span className={`font-mono ${
            executionStatus === 'running' ? 'text-cyan-400' :
            executionStatus === 'completed' ? 'text-emerald-400' :
            executionStatus === 'failed' ? 'text-rose-400' :
            'text-slate-500'
          }`}>{executionStatus}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {lastEvent && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-slate-600" />
            <span className="text-slate-600 truncate max-w-[200px]">{lastEvent}</span>
          </div>
        )}

        {onToggleSimulation && (
          <button onClick={onToggleSimulation}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono ${
              simulation ? 'border-amber-500/20 bg-amber-500/5 text-amber-400' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
            }`}>
            {simulation ? <Shield className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
            {simulation ? 'SIM' : 'LIVE'}
          </button>
        )}

        <span className="text-slate-600 font-mono">THINKBOX v1.0 · PR-008</span>
      </div>
    </div>
  );
}
