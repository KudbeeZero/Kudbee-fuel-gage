/**
 * THINKBOX PR-007 — Mission Planner Frontend
 *
 * Visual task graph. Displays the MissionGraph with epics, tasks, dependencies,
 * risks, required agents, execution order, and completion criteria.
 */

import { useState, useMemo } from 'react';
import {
  Target, Layers, GitBranch, AlertTriangle, Clock, CheckCircle2,
  ChevronDown, ChevronRight, Users, Zap, ArrowRight, Shield,
} from 'lucide-react';

interface MissionGraphData {
  missionId: string;
  objective: { id: string; title: string; description: string; status: string };
  epics: Array<{ id: string; title: string; description: string; tasks: any[]; confidence: number }>;
  tasks: Array<{ id: string; title: string; description: string; assignedAgent: string | null; risk: string; complexity: string; status: string; confidence: number; dependsOn: string[] }>;
  dependencies: Array<{ from: string; to: string; type: string }>;
  risks: Array<{ id: string; description: string; severity: string }>;
  requiredAgents: Array<{ name: string; reason: string; confidence: number }>;
  suggestedExecutionOrder: string[];
  completionCriteria: string[];
  confidence: number;
}

interface MissionPlannerProps {
  graph?: MissionGraphData;
  onGenerate?: (objective: string) => void;
}

export function MissionPlanner({ graph, onGenerate }: MissionPlannerProps) {
  const [objective, setObjective] = useState('');
  const [expandedEpic, setExpandedEpic] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  if (!graph) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
            <Target className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Mission Planner</h3>
            <p className="text-[10px] text-slate-500">Describe your engineering objective</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input value={objective} onChange={e => setObjective(e.target.value)}
            placeholder='e.g., "Add REST API for user management" or "Improve test coverage to 80%"'
            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
          <button onClick={() => onGenerate?.(objective)}
            disabled={!objective.trim()}
            className="px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-mono hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
            Plan
          </button>
        </div>
      </div>
    );
  }

  const taskMap = new Map(graph.tasks.map(t => [t.id, t]));

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
            <Target className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">{graph.objective.title}</h3>
            <p className="text-[10px] text-slate-500">{graph.epics.length} epics · {graph.tasks.length} tasks · {Math.round(graph.confidence * 100)}% confidence</p>
          </div>
        </div>
        <span className="text-[9px] text-slate-600 font-mono">{graph.missionId.slice(0, 8)}</span>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
          <div className="h-full rounded-full bg-violet-500/60" style={{ width: `${graph.confidence * 100}%` }} />
        </div>
        <span className="text-[9px] text-slate-600 font-mono">{Math.round(graph.confidence * 100)}%</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-3">
          <div className="flex items-center gap-1.5 mb-1"><Users className="w-3 h-3 text-slate-500" /><span className="text-[10px] text-slate-500">Required Agents</span></div>
          {graph.requiredAgents.map(a => (
            <div key={a.name} className="flex items-center justify-between text-[10px] py-0.5">
              <span className="text-slate-300 font-mono">{a.name}</span>
              <span className="text-slate-600">{Math.round(a.confidence * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3 h-3 text-amber-400" /><span className="text-[10px] text-amber-400">Risks ({graph.risks.length})</span></div>
          {graph.risks.slice(0, 3).map(r => (
            <div key={r.id} className="text-[9px] text-amber-400/80 py-0.5">{r.description}</div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {graph.epics.map(epic => (
          <div key={epic.id} className="rounded-lg border border-slate-800/40 bg-slate-950/40">
            <button onClick={() => {
              const next = new Set(expandedEpic);
              if (next.has(epic.id)) next.delete(epic.id); else next.add(epic.id);
              setExpandedEpic(next);
            }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/20">
              {expandedEpic.has(epic.id) ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
              <Layers className="w-3 h-3 text-violet-400" />
              <div className="flex-1">
                <div className="text-[10px] text-slate-300 font-mono">{epic.title}</div>
                <div className="text-[9px] text-slate-600">{epic.tasks.length} tasks</div>
              </div>
            </button>
            {expandedEpic.has(epic.id) && (
              <div className="px-3 pb-2 border-t border-slate-800/30">
                {epic.tasks.map((task, i) => (
                  <button key={task.id} onClick={() => setSelectedTask(selectedTask === task.id ? null : task.id)}
                    className="w-full flex items-center gap-2 py-1.5 text-left text-[10px] hover:bg-slate-800/20 rounded px-1">
                    <span className="text-slate-600 font-mono w-5">{i + 1}</span>
                    <span className="text-slate-400 flex-1">{task.title}</span>
                    {task.assignedAgent && <span className="text-[8px] text-violet-400 font-mono">{task.assignedAgent}</span>}
                    {task.risk !== 'none' && task.risk !== 'low' && <span className={`text-[8px] ${task.risk === 'high' ? 'text-rose-400' : 'text-amber-400'}`}>{task.risk}</span>}
                    <ArrowRight className="w-2.5 h-2.5 text-slate-600" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedTask && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          {(() => { const t = taskMap.get(selectedTask); if (!t) return null;
            return (
              <div className="space-y-1 text-[10px]">
                <div className="font-mono text-violet-400">{t.title}</div>
                <div className="text-slate-500">{t.description}</div>
                <div className="flex gap-3 text-slate-600">
                  <span>Agent: {t.assignedAgent ?? 'unassigned'}</span>
                  <span>Risk: {t.risk}</span>
                  <span>Complexity: {t.complexity}</span>
                  <span>Status: {t.status}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="border-t border-slate-800/60 pt-3">
        <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3 h-3 text-slate-500" /><span className="text-[10px] text-slate-500">Completion Criteria</span></div>
        {graph.completionCriteria.map((c, i) => (
          <div key={i} className="text-[9px] text-slate-600 py-0.5">• {c}</div>
        ))}
      </div>
    </div>
  );
}
