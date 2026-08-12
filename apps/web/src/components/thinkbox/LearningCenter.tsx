/**
 * THINKBOX PR-009 — Learning Center
 *
 * Displays recent learnings, high-impact patterns, recurring issues,
 * agent improvements, architecture evolution, and search.
 * Every recommendation traces back to its originating mission.
 */

import { useState, useMemo } from 'react';
import { Brain, Search, TrendingUp, AlertTriangle, Lightbulb, CheckCircle2, ChevronRight, Clock, Users, Activity, GitBranch, Shield } from 'lucide-react';

interface LearningRecord {
  id: string;
  observation: string;
  rootCause: string;
  recommendation: string;
  confidence: number;
  category: string;
  severity: string;
  scope: string;
  createdAt: string;
  source: string;
  context: { agents: string[]; services: string[]; files: string[] };
  validationResults: Array<{ outcome: string }>;
}

interface AgentProfile {
  agentName: string;
  strengths: string[];
  weaknesses: string[];
  successRate: number;
  confidenceTrend: number[];
  totalTasks: number;
}

interface LearningCenterProps {
  records?: LearningRecord[];
  profiles?: AgentProfile[];
  onSearch?: (query: string) => void;
}

export function LearningCenter({ records: external, profiles: externalProfiles, onSearch }: LearningCenterProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'learnings' | 'profiles' | 'recommendations'>('learnings');
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);

  const records: LearningRecord[] = external ?? [
    { id: 'r1', observation: 'Deployment encountered 2 failures', rootCause: 'Missing rollback configuration', recommendation: 'Add rollback config before deploy', confidence: 0.8, category: 'deployment', severity: 'high', scope: 'local', createdAt: new Date(Date.now() - 3600000).toISOString(), source: 'pipeline', context: { agents: ['FORGE'], services: ['Heroku'], files: [] }, validationResults: [] },
    { id: 'r2', observation: '3/15 tests failed', rootCause: 'Test regressions in API layer', recommendation: 'Add regression tests before merge', confidence: 0.75, category: 'testing', severity: 'high', scope: 'local', createdAt: new Date(Date.now() - 7200000).toISOString(), source: 'pipeline', context: { agents: ['GATE'], services: [], files: ['api.test.ts'] }, validationResults: [] },
    { id: 'r3', observation: 'FORGE: Design API schema', rootCause: 'Agent decision', recommendation: 'Consider automating schema design workflow', confidence: 0.65, category: 'agent', severity: 'medium', scope: 'local', createdAt: new Date(Date.now() - 14400000).toISOString(), source: 'pipeline', context: { agents: ['FORGE'], services: [], files: [] }, validationResults: [{ outcome: 'confirmed' }] },
    { id: 'r4', observation: '2 successful recoveries', rootCause: 'Recovery procedures effective', recommendation: 'Formalize into runbook', confidence: 0.85, category: 'recovery', severity: 'medium', scope: 'global', createdAt: new Date(Date.now() - 28800000).toISOString(), source: 'pipeline', context: { agents: ['KILOH'], services: [], files: [] }, validationResults: [{ outcome: 'confirmed' }] },
  ];

  const profiles: AgentProfile[] = externalProfiles ?? [
    { agentName: 'FORGE', strengths: ['implementation', 'building'], weaknesses: ['edge-case-testing'], successRate: 0.82, confidenceTrend: [0.75, 0.8, 0.82], totalTasks: 18 },
    { agentName: 'GATE', strengths: ['testing', 'verification'], weaknesses: [], successRate: 0.92, confidenceTrend: [0.88, 0.9, 0.92], totalTasks: 15 },
  ];

  const categories = [...new Set(records.map(r => r.category))];
  const filtered = useMemo(() => {
    return records.filter(r => {
      if (search && !r.observation.toLowerCase().includes(search.toLowerCase()) && !r.recommendation.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      return true;
    });
  }, [records, search, categoryFilter]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-100">Learning Center</h1>
            <p className="text-xs text-slate-500">Continuous Engineering Learning Engine</p>
          </div>
        </div>
      </header>

      <div className="flex gap-1 rounded-lg border border-slate-800/60 p-0.5 bg-slate-900/40">
        {(['learnings', 'profiles', 'recommendations'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${activeTab === tab ? 'bg-violet-500/10 text-violet-400' : 'text-slate-600 hover:text-slate-400'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'learnings' && (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search learnings..." className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-7 py-1.5 text-[10px] text-slate-300" />
            </div>
            {categories.map(c => (
              <button key={c} onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}
                className={`text-[9px] px-2 py-1 rounded font-mono ${categoryFilter === c ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' : 'text-slate-600 hover:text-slate-400'}`}>{c}</button>
            ))}
          </div>

          <div className="space-y-1">
            {filtered.map(r => (
              <div key={r.id} className={`rounded-lg border ${r.severity === 'high' ? 'border-rose-500/20 bg-rose-500/5' : 'border-slate-800/40 bg-slate-950/40'}`}>
                <button onClick={() => setSelectedRecord(selectedRecord === r.id ? null : r.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/20 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full ${r.severity === 'high' ? 'bg-rose-400' : r.category === 'recovery' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="text-[10px] text-slate-300 flex-1 truncate">{r.observation}</span>
                  <span className="text-[8px] text-slate-600 font-mono">{r.category}</span>
                  <span className="text-[8px] text-slate-600">{Math.round(r.confidence * 100)}%</span>
                  <ChevronRight className={`w-3 h-3 text-slate-600 transition-transform ${selectedRecord === r.id ? 'rotate-90' : ''}`} />
                </button>
                {selectedRecord === r.id && (
                  <div className="px-3 pb-2 border-t border-slate-800/30 space-y-1.5">
                    <div className="text-[10px] text-slate-400">{r.recommendation}</div>
                    <div className="flex flex-wrap gap-2 text-[9px] text-slate-600">
                      <span>Root cause: {r.rootCause}</span>
                      <span>Scope: {r.scope}</span>
                      <span>Source: {r.source}</span>
                    </div>
                    {r.context.agents.length > 0 && <div className="text-[9px] text-slate-600">Agents: {r.context.agents.join(', ')}</div>}
                    {r.validationResults.length > 0 && (
                      <div className="text-[9px]">
                        {r.validationResults.map((v, i) => (
                          <span key={i} className={`mr-1 ${v.outcome === 'confirmed' ? 'text-emerald-400' : 'text-rose-400'}`}>{v.outcome}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'profiles' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {profiles.map(p => (
            <div key={p.agentName} className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm text-slate-200 font-bold">{p.agentName}</span>
                <span className={`text-xs font-mono font-bold ${p.successRate >= 0.9 ? 'text-emerald-400' : p.successRate >= 0.75 ? 'text-amber-400' : 'text-rose-400'}`}>{Math.round(p.successRate * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800/60 overflow-hidden mb-2">
                <div className={`h-full rounded-full ${p.successRate >= 0.9 ? 'bg-emerald-500' : p.successRate >= 0.75 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${p.successRate * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {p.strengths.map(s => <span key={s} className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">{s}</span>)}
                {p.weaknesses.map(w => <span key={w} className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono">{w}</span>)}
              </div>
              <div className="flex items-center gap-1 text-[9px] text-slate-600">
                <span>{p.totalTasks} tasks</span>
                <span className="text-slate-500">
                  {p.confidenceTrend.slice(-3).map((v, i) => (
                    <span key={i} className={i > 0 ? (v > (p.confidenceTrend[p.confidenceTrend.length - 4 + i] ?? 0) ? 'text-emerald-400' : 'text-rose-400') : ''}>{i > 0 ? ' → ' : ''}{Math.round(v * 100)}%</span>
                  ))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'recommendations' && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-violet-400" />
            <h3 className="font-display text-sm font-semibold text-slate-200">Evidence-Based Recommendations</h3>
          </div>
          <div className="space-y-2">
            {[
              { title: 'Add rollback configuration', reason: 'Based on 2 deployment failures (80% confidence)', category: 'deployment' },
              { title: 'Formalize recovery runbook', reason: 'Based on 2 successful recoveries (85% confidence)', category: 'recovery' },
              { title: 'Balance agent task distribution', reason: 'FORGE had 5 tasks last mission (70% confidence)', category: 'agent' },
              { title: 'Run regression tests before merge', reason: '3 tests failed in previous mission (75% confidence)', category: 'testing' },
            ].map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded border border-slate-800/40 bg-slate-950/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-300">{r.title}</div>
                  <div className="text-[9px] text-slate-600">{r.reason}</div>
                </div>
                <span className="ml-auto text-[8px] text-slate-600 font-mono">{r.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
