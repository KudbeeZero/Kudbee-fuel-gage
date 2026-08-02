/**
 * THINKBOX PR-006 — Mission Center
 *
 * Dedicated mission panel. Displays mission ID, objective, status, branch,
 * PR, stack position, assigned agents, progress, blockers, and risks.
 */

import { useState } from 'react';
import {
  Target, Play, Pause, CheckCircle2, AlertTriangle, Clock,
  GitBranch, Users, Activity, ChevronDown, ChevronRight, Shield,
} from 'lucide-react';

interface Mission {
  id: string;
  title: string;
  objective: string;
  status: 'active' | 'paused' | 'completed' | 'blocked';
  branch: string;
  prNumber: number | null;
  stackPosition: number;
  assignedAgents: string[];
  progress: number;
  remainingTasks: number;
  blockers: string[];
  risks: Array<{ severity: string; message: string }>;
  startedAt: string;
  completedAt: string | null;
}

interface MissionCenterProps {
  mission?: Mission;
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: () => void;
}

export function MissionCenter({ mission, onPause, onResume, onComplete }: MissionCenterProps) {
  const m = mission ?? {
    id: 'THINKBOX-006',
    title: 'Engineering Mode & Collaborative Workspace',
    objective: 'Transform THINKBOX into a persistent engineering workspace',
    status: 'active' as const,
    branch: 'feature/thinkbox-pr006',
    prNumber: null,
    stackPosition: 6,
    assignedAgents: ['KILOH', 'FORGE', 'DTHINK', 'GATE', 'JOURNAL', 'BUS'],
    progress: 67,
    remainingTasks: 4,
    blockers: [],
    risks: [{ severity: 'medium', message: 'Plugin runtime is MVP — needs hardening' }],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const statusColors: Record<string, string> = {
    active: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    paused: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    completed: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
    blocked: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
  };

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">{m.id}</h3>
            <p className="text-[10px] text-slate-500">{m.title}</p>
          </div>
        </div>
        <span className={`text-[9px] px-2 py-1 rounded-full border font-mono uppercase ${statusColors[m.status]}`}>{m.status}</span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">{m.objective}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-[10px]">
          <GitBranch className="w-3 h-3 text-slate-500" />
          <span className="text-slate-500">Branch:</span>
          <span className="text-slate-300 font-mono">{m.branch}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <Activity className="w-3 h-3 text-slate-500" />
          <span className="text-slate-500">Stack:</span>
          <span className="text-slate-300 font-mono">#{m.stackPosition}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <Clock className="w-3 h-3 text-slate-500" />
          <span className="text-slate-500">Started:</span>
          <span className="text-slate-300">{new Date(m.startedAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <Users className="w-3 h-3 text-slate-500" />
          <span className="text-slate-500">Agents:</span>
          <span className="text-slate-300 font-mono">{m.assignedAgents.length}</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">Progress</span>
          <span className="text-slate-300 font-mono">{m.progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: `${m.progress}%` }} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-1">
          <Users className="w-3 h-3" /> Assigned Agents
        </div>
        <div className="flex flex-wrap gap-1">
          {m.assignedAgents.map(a => (
            <span key={a} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-400 font-mono">{a}</span>
          ))}
        </div>
      </div>

      {m.risks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-1">
            <Shield className="w-3 h-3" /> Risks
          </div>
          {m.risks.map((r, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px] text-amber-400">
              <AlertTriangle className="w-2.5 h-2.5" /> {r.message}
            </div>
          ))}
        </div>
      )}

      {m.status === 'active' && (
        <div className="flex gap-2">
          {onPause && <button onClick={onPause} className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono hover:bg-amber-500/20"><Pause className="w-3 h-3" /> Pause</button>}
          {onComplete && <button onClick={onComplete} className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Complete</button>}
        </div>
      )}
    </div>
  );
}
