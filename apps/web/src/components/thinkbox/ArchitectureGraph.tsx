/**
 * THINKBOX PR-006 — Architecture Graph
 *
 * Interactive living architecture graph. Nodes: services, APIs, databases,
 * Redis, workers, queues, AI providers, frontend, backend, agents.
 * Supports zoom, search, filtering, highlight relationships.
 */

import { useState, useMemo } from 'react';
import { Network, Search, ZoomIn, ZoomOut, Maximize, Filter } from 'lucide-react';

interface GraphNode {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  size: number;
  present: boolean;
  version?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

interface ArchitectureGraphProps {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
}

const KIND_COLORS: Record<string, string> = {
  repository: 'bg-slate-500',
  language: 'bg-blue-500',
  framework: 'bg-cyan-500',
  'package-manager': 'bg-emerald-500',
  service: 'bg-violet-500',
  database: 'bg-indigo-500',
  cache: 'bg-amber-500',
  ai: 'bg-rose-500',
  queue: 'bg-orange-500',
  'env-var': 'bg-teal-500',
  ci: 'bg-lime-500',
  deploy: 'bg-pink-500',
  runtime: 'bg-sky-500',
  agent: 'bg-fuchsia-500',
};

export function ArchitectureGraph({ nodes: externalNodes, edges: externalEdges }: ArchitectureGraphProps) {
  const nodes: GraphNode[] = externalNodes ?? [
    { id: 'n1', label: 'Kudbee', kind: 'repository', x: 50, y: 10, size: 28, present: true },
    { id: 'n2', label: 'TypeScript', kind: 'language', x: 20, y: 35, size: 20, present: true },
    { id: 'n3', label: 'Python', kind: 'language', x: 80, y: 35, size: 18, present: true },
    { id: 'n4', label: 'Bun', kind: 'package-manager', x: 50, y: 50, size: 22, present: true },
    { id: 'n5', label: 'PostgreSQL', kind: 'database', x: 20, y: 70, size: 22, present: true },
    { id: 'n6', label: 'Redis', kind: 'cache', x: 80, y: 70, size: 20, present: true },
    { id: 'n7', label: 'OpenAI', kind: 'ai', x: 30, y: 90, size: 18, present: true },
    { id: 'n8', label: 'Groq', kind: 'ai', x: 70, y: 90, size: 18, present: true },
    { id: 'n9', label: 'Heroku', kind: 'deploy', x: 50, y: 85, size: 20, present: true },
    { id: 'n10', label: 'GitHub Actions', kind: 'ci', x: 90, y: 15, size: 18, present: true },
    { id: 'n11', label: 'Vite', kind: 'framework', x: 15, y: 55, size: 16, present: true },
    { id: 'n12', label: 'Express', kind: 'service', x: 85, y: 55, size: 16, present: true },
    { id: 'n13', label: 'Anthropic', kind: 'ai', x: 50, y: 95, size: 16, present: true },
    { id: 'n14', label: 'DeepSeek', kind: 'ai', x: 85, y: 95, size: 16, present: true },
  ];

  const edges: GraphEdge[] = externalEdges ?? [
    { from: 'n1', to: 'n2', label: 'lang' },
    { from: 'n1', to: 'n3', label: 'lang' },
    { from: 'n1', to: 'n4', label: 'pkg' },
    { from: 'n1', to: 'n5', label: 'db' },
    { from: 'n1', to: 'n6', label: 'cache' },
    { from: 'n1', to: 'n7', label: 'ai' },
    { from: 'n1', to: 'n8', label: 'ai' },
    { from: 'n1', to: 'n9', label: 'deploy' },
    { from: 'n1', to: 'n10', label: 'ci' },
    { from: 'n1', to: 'n11', label: 'fw' },
    { from: 'n1', to: 'n12', label: 'svc' },
    { from: 'n1', to: 'n13', label: 'ai' },
    { from: 'n1', to: 'n14', label: 'ai' },
    { from: 'n4', to: 'n2', label: 'depends' },
    { from: 'n12', to: 'n2', label: 'depends' },
    { from: 'n9', to: 'n5', label: 'uses' },
    { from: 'n9', to: 'n6', label: 'uses' },
  ];

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (kindFilter && n.kind !== kindFilter) return false;
      return true;
    });
  }, [nodes, search, kindFilter]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
  }, [edges, filteredNodes]);

  const kinds = [...new Set(nodes.map(n => n.kind))].sort();
  const selected = nodes.find(n => n.id === selectedNode);
  const relatedEdges = selectedNode ? edges.filter(e => e.from === selectedNode || e.to === selectedNode) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
            <Network className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Architecture Graph</h3>
            <p className="text-[10px] text-slate-500">{nodes.length} nodes · {edges.length} edges</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 rounded text-slate-500 hover:text-slate-300"><ZoomOut className="w-3 h-3" /></button>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="p-1 rounded text-slate-500 hover:text-slate-300"><ZoomIn className="w-3 h-3" /></button>
          <button onClick={() => setZoom(1)} className="p-1 rounded text-slate-500 hover:text-slate-300"><Maximize className="w-3 h-3" /></button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-6 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none" />
        </div>
        <div className="flex gap-0.5 flex-wrap">
          {kinds.map(k => (
            <button key={k}
              onClick={() => setKindFilter(kindFilter === k ? null : k)}
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${kindFilter === k ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-600 hover:text-slate-400'}`}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-lg border border-slate-800/40 bg-slate-950/40 overflow-hidden" style={{ height: '240px' }}>
        <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          {filteredEdges.map((e, i) => {
            const from = filteredNodes.find(n => n.id === e.from);
            const to = filteredNodes.find(n => n.id === e.to);
            if (!from || !to) return null;
            return (
              <svg key={i} className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
                <line x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`}
                  stroke={selectedNode && (e.from === selectedNode || e.to === selectedNode) ? 'rgba(52,211,153,0.6)' : 'rgba(100,116,139,0.3)'}
                  strokeWidth={1} />
              </svg>
            );
          })}
          {filteredNodes.map(n => (
            <button key={n.id}
              onClick={() => setSelectedNode(selectedNode === n.id ? null : n.id)}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                selectedNode === n.id ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950 z-10' : 'z-0'
              } ${n.present ? KIND_COLORS[n.kind] ?? 'bg-slate-500' : 'bg-slate-700'}`}
              style={{
                left: `${n.x}%`,
                top: `${n.y}%`,
                width: `${n.size}px`,
                height: `${n.size}px`,
              }}
              title={`${n.label}${n.version ? ` ${n.version}` : ''}`}
            />
          ))}
        </div>
      </div>

      {selected && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="text-[10px]">
            <span className="font-mono text-emerald-400 font-bold">{selected.label}</span>
            <span className="text-slate-600 ml-2">{selected.kind}</span>
            {selected.version && <span className="text-slate-500 ml-2">{selected.version}</span>}
          </div>
          <div className="mt-1 text-[9px] text-slate-500">
            Related: {relatedEdges.map(e => {
              const other = nodes.find(n => n.id === (e.from === selected.id ? e.to : e.from));
              return other ? `${e.label} → ${other.label}` : '';
            }).filter(Boolean).join(', ')}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {kinds.map(k => (
          <div key={k} className="flex items-center gap-1 text-[8px] text-slate-500">
            <span className={`w-2 h-2 rounded-full ${KIND_COLORS[k] ?? 'bg-slate-500'}`} />
            {k}
          </div>
        ))}
      </div>
    </div>
  );
}
