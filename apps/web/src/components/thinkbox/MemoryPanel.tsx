/**
 * THINKBOX PR-006 — Mission Memory
 *
 * Captures decisions, agent summaries, files modified, risks, tests,
 * errors, recoveries, and recommendations. Everything searchable.
 */

import { useState, useMemo } from 'react';
import { Brain, Search, ChevronDown, ChevronRight, Clock, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface MemoryEntry {
  id: string;
  type: 'decision' | 'agent-summary' | 'file-modification' | 'test-result' | 'error' | 'recovery' | 'recommendation';
  title: string;
  content: string;
  agent: string | null;
  timestamp: string;
  tags: string[];
}

interface MemoryPanelProps {
  entries?: MemoryEntry[];
}

export function MemoryPanel({ entries: external }: MemoryPanelProps) {
  const [entries] = useState<MemoryEntry[]>(external ?? [
    { id: 'm1', type: 'decision', title: 'THINKBOX should be visual from day one', content: 'Every backend capability must appear as a first-class visual workflow within THINKBOX.', agent: 'KILOH', timestamp: new Date(Date.now() - 3600000).toISOString(), tags: ['architecture', 'product'] },
    { id: 'm2', type: 'agent-summary', title: 'FORGE: Provision plan complete', content: '73 steps planned across 8 phases for Kudbee workspace. Score 100/A.', agent: 'FORGE', timestamp: new Date(Date.now() - 1800000).toISOString(), tags: ['provision', 'planning'] },
    { id: 'm3', type: 'recommendation', title: 'Plugin runtime — provider interfaces', content: 'Define Source Control, Compute, Deployment, Secrets, AI provider interfaces. Implement later.', agent: 'KILOH', timestamp: new Date(Date.now() - 7200000).toISOString(), tags: ['plugins', 'architecture'] },
    { id: 'm4', type: 'test-result', title: 'Intelligence Engine: 21/21 tests passing', content: 'All detection engine tests pass with bun:test. Deterministic output verified.', agent: 'GATE', timestamp: new Date(Date.now() - 14400000).toISOString(), tags: ['testing', 'ci'] },
  ]);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.content.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter && e.type !== typeFilter) return false;
      return true;
    });
  }, [entries, search, typeFilter]);

  const types = [...new Set(entries.map(e => e.type))];

  const typeIcon = (type: string) => {
    switch (type) {
      case 'decision': return <Brain className="w-3 h-3 text-violet-400" />;
      case 'agent-summary': return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case 'recommendation': return <FileText className="w-3 h-3 text-cyan-400" />;
      case 'test-result': return <CheckCircle2 className="w-3 h-3 text-blue-400" />;
      case 'error': return <AlertTriangle className="w-3 h-3 text-rose-400" />;
      default: return <Clock className="w-3 h-3 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
            <Brain className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Mission Memory</h3>
            <p className="text-[10px] text-slate-500">{entries.length} entries</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search memory..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-6 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
        </div>
        <select value={typeFilter ?? ''} onChange={e => setTypeFilter(e.target.value || null)}
          className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 text-[10px] text-slate-400">
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {filtered.map(e => (
          <div key={e.id} className="rounded-lg border border-slate-800/40 bg-slate-950/40">
            <button
              onClick={() => {
                const next = new Set(expanded);
                if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                setExpanded(next);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/20 transition-colors"
            >
              {typeIcon(e.type)}
              <span className="text-[10px] text-slate-300 flex-1 truncate">{e.title}</span>
              {e.agent && <span className="text-[8px] text-slate-600 font-mono">{e.agent}</span>}
              <span className="text-[8px] text-slate-600">{new Date(e.timestamp).toLocaleTimeString()}</span>
              {expanded.has(e.id) ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
            </button>
            {expanded.has(e.id) && (
              <div className="px-3 pb-2 pt-1 border-t border-slate-800/30">
                <p className="text-[10px] text-slate-400 leading-relaxed">{e.content}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.tags.map(t => (
                    <span key={t} className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-500 font-mono">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
