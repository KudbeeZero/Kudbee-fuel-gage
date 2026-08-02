/**
 * OPS-013 — Provider Dashboard Frontend
 */

import { useState } from 'react';
import { Cpu, TrendingUp, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface ProviderInfo {
  id: string; name: string; model: string; costPer1k: number;
  strengths: string[];
}

interface ProviderEval {
  providerId: string; taskType: string; score: number; recommendation: string;
}

interface ProviderDashboardProps {
  providers?: ProviderInfo[];
  evaluations?: ProviderEval[];
  bestFor?: Record<string, string>;
}

const TASKS = ['architecture', 'planning', 'implementation', 'refactoring', 'testing', 'documentation', 'debugging', 'long-context'];

export function ProviderDashboard({ providers: external, evaluations: externalEvals }: ProviderDashboardProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['deepseek-v4']));

  const providers: ProviderInfo[] = external ?? [
    { id: 'deepseek-v4', name: 'DeepSeek', model: 'V4 Pro', costPer1k: 0.002, strengths: ['architecture', 'planning', 'long-context', 'implementation'] },
    { id: 'openai-gpt4o', name: 'OpenAI', model: 'GPT-4o', costPer1k: 0.010, strengths: ['refactoring', 'testing', 'review'] },
    { id: 'anthropic-sonnet', name: 'Anthropic', model: 'Claude 3.5', costPer1k: 0.015, strengths: ['debugging', 'documentation', 'long-context'] },
    { id: 'groq-llama', name: 'Groq', model: 'Llama 3.1', costPer1k: 0.001, strengths: ['implementation', 'refactoring'] },
    { id: 'google-gemini', name: 'Google', model: 'Gemini 1.5', costPer1k: 0.005, strengths: ['documentation', 'review'] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10"><Cpu className="w-3.5 h-3.5 text-violet-400" /></div>
          <div><h3 className="font-display text-sm font-semibold text-slate-200">Multi-Model Intelligence</h3><p className="text-[10px] text-slate-500">{providers.length} providers · 9 task types</p></div>
        </div>
      </div>

      <div className="space-y-2">
        {providers.map(p => {
          const isExp = expanded.has(p.id);
          return (
            <div key={p.id} className={`rounded-lg border ${isExp ? 'border-violet-500/20 bg-violet-500/5' : 'border-slate-800/40 bg-slate-950/40'}`}>
              <button onClick={() => { const n = new Set(expanded); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setExpanded(n); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/20">
                <span className="text-[10px] text-slate-300 font-mono font-bold flex-1">{p.name} <span className="text-slate-600">{p.model}</span></span>
                <span className="text-[9px] text-emerald-400 font-mono">${p.costPer1k.toFixed(3)}/1k</span>
                {isExp ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
              </button>
              {isExp && (
                <div className="px-3 pb-2 border-t border-slate-800/30">
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {TASKS.map(task => {
                      const isStrong = p.strengths.includes(task);
                      return (
                        <span key={task} className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${isStrong ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800/30 text-slate-600'}`}>
                          {isStrong ? '★ ' : ''}{task}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-3">
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">Recommended by Task</span>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {TASKS.map(task => {
            const best = providers.filter(p => p.strengths.includes(task)).sort((a, b) => a.costPer1k - b.costPer1k)[0];
            return (
              <div key={task} className="text-[10px]">
                <span className="text-slate-500">{task}: </span>
                <span className="text-slate-300 font-mono">{best?.name ?? '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
