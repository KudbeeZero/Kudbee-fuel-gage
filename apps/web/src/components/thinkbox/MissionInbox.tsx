/**
 * THINKBOX PR-011 — Mission Inbox
 *
 * Aggregates missions from roadmap, GitHub issues, technical debt,
 * learning recommendations, user feedback, and CI failures.
 * Each item shows priority, effort, dependencies, suggested agent.
 */

import { useState, useMemo } from 'react';
import { Inbox, Search, Filter, Zap, ChevronDown, ChevronRight, ExternalLink, GitBranch, AlertTriangle, Lightbulb, Bug, Target } from 'lucide-react';

interface InboxItem {
  id: string;
  source: string;
  title: string;
  description: string;
  priority: string;
  estimatedEffort: string;
  dependencies: string[];
  suggestedAgent: string;
  confidence: number;
  status: string;
}

interface MissionInboxProps {
  items?: InboxItem[];
  onSelect?: (item: InboxItem) => void;
}

const sourceIcons: Record<string, any> = {
  roadmap: Target, 'github-issue': GitBranch, 'technical-debt': AlertTriangle,
  learning: Lightbulb, feedback: Bug, 'ci-failure': Zap,
};

const sourceColors: Record<string, string> = {
  roadmap: 'text-amber-400', 'github-issue': 'text-blue-400', 'technical-debt': 'text-rose-400',
  learning: 'text-violet-400', feedback: 'text-cyan-400', 'ci-failure': 'text-red-400',
};

const prioritySort: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function MissionInbox({ items: external, onSelect }: MissionInboxProps) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const items = external ?? [
    { id: 'i1', source: 'roadmap', title: 'Session Continuity', description: 'Auto-restore terminal, timeline, agents on reopen', priority: 'P0', estimatedEffort: 'medium', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.9, status: 'in-progress' },
    { id: 'i2', source: 'technical-debt', title: 'Panel-level error boundaries', description: 'Each panel needs independent error boundary', priority: 'P1', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.85, status: 'new' },
    { id: 'i3', source: 'learning', title: 'Add deployment rollback config', description: 'Based on prior deployment failures', priority: 'P1', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.8, status: 'new' },
    { id: 'i4', source: 'github-issue', title: 'Agent skill profile tests', description: '#253: Agent assignment needs test coverage', priority: 'P2', estimatedEffort: 'medium', dependencies: [], suggestedAgent: 'GATE', confidence: 0.75, status: 'triaged' },
    { id: 'i5', source: 'feedback', title: 'Mobile responsive left rail', description: 'Left rail should collapse on small screens', priority: 'P2', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.7, status: 'new' },
    { id: 'i6', source: 'ci-failure', title: 'TypeScript check in CI', description: 'TypeScript unavailable in sandbox — add to pipeline', priority: 'P1', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'GATE', confidence: 0.8, status: 'new' },
  ];

  const filtered = useMemo(() => {
    return items
      .filter(i => {
        if (search && !i.title.toLowerCase().includes(search.toLowerCase()) && !i.description.toLowerCase().includes(search.toLowerCase())) return false;
        if (sourceFilter && i.source !== sourceFilter) return false;
        if (statusFilter && i.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (prioritySort[a.priority] ?? 9) - (prioritySort[b.priority] ?? 9));
  }, [items, search, sourceFilter, statusFilter]);

  const sources = [...new Set(items.map(i => i.source))];
  const statuses = [...new Set(items.map(i => i.status))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10">
            <Inbox className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Mission Inbox</h3>
            <p className="text-[10px] text-slate-500">{items.length} items · {items.filter(i => i.status === 'new').length} new</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search inbox..." className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-7 py-1.5 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {sources.map(s => {
            const Icon = sourceIcons[s] ?? Filter;
            return (
              <button key={s} onClick={() => setSourceFilter(sourceFilter === s ? null : s)}
                className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono ${sourceFilter === s ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-slate-600 hover:text-slate-400'}`}>
                <Icon className="w-2.5 h-2.5" />{s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        {filtered.map(item => {
          const Icon = sourceIcons[item.source] ?? Filter;
          const color = sourceColors[item.source] ?? 'text-slate-400';
          return (
            <div key={item.id} className={`rounded-lg border ${item.priority === 'P0' ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-800/40 bg-slate-950/40'}`}>
              <button onClick={() => {
                const next = new Set(expanded);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                setExpanded(next);
              }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/20 transition-colors">
                <Icon className={`w-3 h-3 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-300 truncate">{item.title}</span>
                    <span className={`text-[8px] px-1 rounded font-mono ${item.priority === 'P0' ? 'bg-rose-500/10 text-rose-400' : item.priority === 'P1' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>{item.priority}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[8px] text-slate-600 mt-0.5">
                    <span>{item.estimatedEffort}</span>
                    <span>·</span>
                    <span className="font-mono">{item.suggestedAgent}</span>
                    <span>·</span>
                    <span>{Math.round(item.confidence * 100)}%</span>
                  </div>
                </div>
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-mono ${item.status === 'new' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : item.status === 'in-progress' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>{item.status}</span>
                {expanded.has(item.id) ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
              </button>
              {expanded.has(item.id) && (
                <div className="px-3 pb-2 border-t border-slate-800/30">
                  <p className="text-[10px] text-slate-400 py-1">{item.description}</p>
                  {item.dependencies.length > 0 && (
                    <div className="text-[9px] text-slate-600">Depends on: {item.dependencies.join(', ')}</div>
                  )}
                  {onSelect && (
                    <button onClick={() => onSelect(item)} className="mt-1 text-[9px] text-blue-400 font-mono hover:underline">Plan this mission</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
