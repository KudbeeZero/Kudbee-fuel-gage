/**
 * THINKBOX PR-007 — Engineering Graph View
 *
 * Interactive node explorer for the canonical Engineering Graph. Supports
 * search, filtering by kind, traversal, and impact analysis.
 */

import { useState, useMemo } from 'react';
import { Network, Search, ChevronDown, ChevronRight, AlertTriangle, ZoomIn, ZoomOut } from 'lucide-react';

interface GraphNode { id: string; label: string; kind: string; properties: Record<string, unknown>; metadata: { confidence: number; agentId: string | null } }
interface GraphEdge { id: string; from: string; to: string; kind: string; label: string }
interface EngineeringGraphProps { graph?: { nodes: GraphNode[]; edges: GraphEdge[] }; onSelectNode?: (id: string) => void }

const KIND_COLORS: Record<string, string> = {
  workspace: 'bg-emerald-500', mission: 'bg-violet-500', pr: 'bg-blue-500', branch: 'bg-cyan-500',
  file: 'bg-slate-500', service: 'bg-amber-500', api: 'bg-indigo-500', database: 'bg-rose-500',
  dependency: 'bg-orange-500', test: 'bg-lime-500', documentation: 'bg-teal-500',
  agent: 'bg-pink-500', decision: 'bg-emerald-600', risk: 'bg-red-500', deployment: 'bg-purple-500',
  epic: 'bg-violet-400', task: 'bg-violet-300',
};

export function EngineeringGraphView({ graph, onSelectNode }: EngineeringGraphProps) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (kindFilter && n.kind !== kindFilter) return false;
      return true;
    });
  }, [nodes, search, kindFilter]);

  const kinds = [...new Set(nodes.map(n => n.kind))].sort();
  const selected = nodes.find(n => n.id === selectedNode);
  const relatedEdges = selectedNode ? edges.filter(e => e.from === selectedNode || e.to === selectedNode) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
            <Network className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Engineering Graph</h3>
            <p className="text-[10px] text-slate-500">{nodes.length} nodes · {edges.length} edges</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 text-slate-500 hover:text-slate-300"><ZoomOut className="w-3 h-3" /></button>
          <span className="text-[9px] text-slate-600 font-mono px-1">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="p-1 text-slate-500 hover:text-slate-300"><ZoomIn className="w-3 h-3" /></button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[120px]">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..." className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-6 py-1 text-[10px] text-slate-300 placeholder:text-slate-600" />
        </div>
        {kinds.map(k => (
          <button key={k} onClick={() => setKindFilter(kindFilter === k ? null : k)} className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${kindFilter === k ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-600 hover:text-slate-400'}`}>{k}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
        {filteredNodes.slice(0, 30).map(n => (
          <button key={n.id} onClick={() => { setSelectedNode(selectedNode === n.id ? null : n.id); onSelectNode?.(n.id); }}
            className={`flex items-center gap-2 p-2 rounded-lg border text-left text-[10px] transition-colors ${selectedNode === n.id ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-800/40 bg-slate-950/40 hover:bg-slate-800/20'}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${KIND_COLORS[n.kind] ?? 'bg-slate-500'}`} />
            <div className="min-w-0">
              <div className="text-slate-300 truncate font-mono">{n.label}</div>
              <div className="text-[8px] text-slate-600">{n.kind} · {n.metadata.agentId ?? 'system'}</div>
            </div>
            {n.metadata.confidence < 0.7 && <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
          <div className="text-[10px] font-mono text-indigo-400 font-bold mb-1">{selected.label}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-slate-500">
            <span>Kind: {selected.kind}</span>
            <span>Confidence: {Math.round(selected.metadata.confidence * 100)}%</span>
            <span>Source: {selected.metadata.agentId ?? 'system'}</span>
            <span>ID: {selected.id.slice(0, 8)}</span>
          </div>
          {Object.keys(selected.properties).length > 0 && (
            <div className="mt-1 text-[8px] text-slate-600">
              {Object.entries(selected.properties).map(([k, v]) => (
                <span key={k} className="mr-2">{k}: {String(v)}</span>
              ))}
            </div>
          )}
          <div className="mt-1 text-[9px] text-slate-500">
            Connected: {relatedEdges.map(e => {
              const other = nodes.find(n => n.id === (e.from === selected.id ? e.to : e.from));
              return other ? `${e.kind}→${other.label}` : '';
            }).filter(Boolean).join(', ') || 'none'}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {kinds.map(k => (
          <div key={k} className="flex items-center gap-1 text-[8px] text-slate-600">
            <span className={`w-2 h-2 rounded-full ${KIND_COLORS[k] ?? 'bg-slate-500'}`} />{k}
          </div>
        ))}
      </div>
    </div>
  );
}
