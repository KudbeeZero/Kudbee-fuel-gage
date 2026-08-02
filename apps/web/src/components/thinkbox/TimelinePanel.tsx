/**
 * THINKBOX PR-004 — Timeline Panel
 *
 * Displays the chronological timeline of all workspace events.
 * Filterable, searchable, replayable. Every event from detection
 * through provisioning to agent decisions.
 */

import { useState, useMemo } from 'react';
import {
  Clock, Filter, Search, Play, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Info, XCircle, Eye,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: string;
  workspaceId: string | null;
  agentId: string | null;
  timestamp: string;
  data: Record<string, unknown>;
  severity: 'info' | 'warn' | 'error' | 'success';
}

interface TimelinePanelProps {
  events: TimelineEvent[];
  compact?: boolean;
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'error': return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
    case 'warn': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    default: return <Info className="w-3.5 h-3.5 text-slate-500" />;
  }
}

function formatType(type: string): string {
  return type
    .replace('workspace:', '')
    .replace('agent:', '')
    .replace('terminal:', '')
    .replace('healing:', '')
    .replace('browser:', '')
    .replace('timeline:', '')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ');
}

export function TimelinePanel({ events, compact = false }: TimelinePanelProps) {
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return events
      .filter(e => {
        if (search && !JSON.stringify(e).toLowerCase().includes(search.toLowerCase())) return false;
        if (typeFilter && e.type !== typeFilter) return false;
        if (filter === 'errors' && e.severity !== 'error') return false;
        if (filter === 'warnings' && e.severity !== 'warn' && e.severity !== 'error') return false;
        return true;
      })
      .reverse();
  }, [events, filter, typeFilter, search]);

  const types = useMemo(() => [...new Set(events.map(e => e.type))].sort(), [events]);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  if (!compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-200">Event Timeline</h3>
              <p className="text-[10px] text-slate-500">{events.length} events recorded</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search events..."
                className="w-40 bg-slate-800/50 border border-slate-700/50 rounded px-6 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30"
              />
            </div>
            <select
              value={typeFilter ?? ''}
              onChange={e => setTypeFilter(e.target.value || null)}
              className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 text-[10px] text-slate-400"
            >
              <option value="">All types</option>
              {types.map(t => (
                <option key={t} value={t}>{formatType(t)}</option>
              ))}
            </select>
            <div className="flex rounded border border-slate-700/50 overflow-hidden">
              {[
                { label: 'All', value: '' },
                { label: 'Warnings', value: 'warnings' },
                { label: 'Errors', value: 'errors' },
              ].map(f => (
                <button key={f.value}
                  onClick={() => setFilter(filter === f.value ? '' : f.value)}
                  className={`px-2 py-1 text-[9px] font-mono ${filter === f.value ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-[10px] text-slate-600 py-8 text-center">No events match the current filters.</div>
          ) : (
            filtered.map((event) => (
              <div key={event.id}
                className={`rounded border text-[10px] ${
                  event.severity === 'error' ? 'border-rose-500/30 bg-rose-500/5' :
                  event.severity === 'warn' ? 'border-amber-500/20 bg-amber-500/5' :
                  'border-slate-800/40 bg-slate-950/40'
                }`}>
                <button onClick={() => toggleExpand(event.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/20">
                  <SeverityIcon severity={event.severity} />
                  <span className="text-slate-400 font-mono flex-1">{formatType(event.type)}</span>
                  {event.agentId && <span className="text-slate-600">{event.agentId}</span>}
                  <span className="text-slate-600 tabular-nums">
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}
                  </span>
                  {expanded.has(event.id) ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
                </button>
                {expanded.has(event.id) && (
                  <div className="px-4 pb-2 pt-1 border-t border-slate-800/30">
                    <div className="text-slate-500 font-mono text-[9px]">ID: {event.id} · WS: {event.workspaceId ?? 'global'}</div>
                    {event.data && Object.keys(event.data).length > 0 && (
                      <pre className="mt-1 text-[9px] text-slate-600 font-mono whitespace-pre-wrap">{JSON.stringify(event.data, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Compact mode: just the event stream
  return (
    <div className="space-y-0.5 max-h-48 overflow-y-auto">
      {filtered.slice(0, 20).map((event) => (
        <div key={event.id} className="flex items-start gap-2 text-[10px] py-0.5">
          <span className="text-slate-600 tabular-nums mt-0.5">
            {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}
          </span>
          <SeverityIcon severity={event.severity} />
          <span className="text-slate-400">{formatType(event.type)}</span>
          {event.agentId && <span className="text-slate-600 font-mono">{event.agentId}</span>}
        </div>
      ))}
    </div>
  );
}
