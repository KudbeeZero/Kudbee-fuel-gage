import React, { useState, useCallback } from 'react';
import { Globe, Terminal, Send, Loader2, Sparkles } from 'lucide-react';
import { apiPost } from '../lib/apiClient';
import { GroundedIntelligenceComponent } from './GroundedIntelligenceComponent';

interface BuiltSkill {
  id: string;
  description: string;
  destructive: boolean;
}

interface ContextResponse {
  system_prompt: string;
  active_skills: BuiltSkill[];
  skill_count: number;
}

const EXAMPLE_PROMPT =
  'Insert a new telemetry trace into the database and render a React dashboard widget for the Edge Sentinel.';

export function IntelligenceView() {
  const [prompt, setPrompt] = useState<string>(EXAMPLE_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContextResponse | null>(null);

  const runContextFactory = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Prompt cannot be empty.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<ContextResponse>('/api/agents/context', { prompt });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build agent context');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [prompt]);

  return (
    <div className="space-y-6">
      {/* VIEW PANEL HEADER */}
      <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-800/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-emerald-500/[0.02] rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-5 h-5 text-emerald-400 animate-pulse drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
          <h1 className="font-display font-bold text-xl text-slate-100 tracking-tight">AI Grounded News Intelligence</h1>
        </div>
        <p className="text-xs text-slate-400">
          Real-time global breakthroughs and regulatory policies, grounded live via Google Search telemetry.
        </p>
      </div>

      {/* NESTED DYNAMIC GROUNDED COMPONENT */}
      <GroundedIntelligenceComponent />

      {/* AGENT CONTEXT FACTORY TEST PANEL */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h2 className="font-display font-semibold text-slate-200 text-sm">Agent Context Factory · Live Tester</h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          POST a task to <span className="font-mono">/api/agents/context</span> and watch the factory assemble the
          dynamic system prompt from the matched Skill Tags in real time.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Describe the task you want the agent to perform…"
            className="w-full resize-y rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40"
            aria-label="Agent task prompt"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void runContextFactory()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-mono font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {loading ? 'Assembling…' : 'Build Context'}
            </button>
            <span className="text-[10px] font-mono text-slate-600">POST /api/agents/context</span>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="text-xs font-mono text-rose-300">{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Skill chips */}
            <div className="lg:col-span-1 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Matched Skills</span>
                <span className="text-[10px] font-mono text-emerald-400">{result.skill_count}</span>
              </div>
              {result.active_skills.length === 0 ? (
                <div className="font-mono text-xs text-slate-600">0 Active Signals · no skills matched</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {result.active_skills.map((skill) => (
                    <span
                      key={skill.id}
                      className={`rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${
                        skill.destructive
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      }`}
                    >
                      {skill.id}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Assembled system prompt */}
            <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Assembled System Prompt</span>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
                {result.system_prompt}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
