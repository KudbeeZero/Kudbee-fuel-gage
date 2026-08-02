/**
 * THINKBOX PR-006 — Workspace Explorer
 *
 * Left-rail explorer: source tree, services, dependencies, runtime,
 * infrastructure, environment, memory, execution queue. Everything clickable.
 */

import { useState, useMemo } from 'react';
import {
  FolderTree, Database, Package, Cpu, Server, Key,
  Brain, Play, ChevronRight, ChevronDown, Search, File,
  Globe, Wifi, Boxes, GitBranch, Clock, Shield,
} from 'lucide-react';

interface ExplorerNode {
  id: string;
  label: string;
  kind: string;
  path: string;
  children: ExplorerNode[];
}

interface WorkspaceExplorerProps {
  intel?: any;
  plan?: any;
  execution?: any;
  onNavigate?: (kind: string, id: string) => void;
}

interface SectionDef {
  id: string;
  label: string;
  icon: any;
  children?: ExplorerNode[];
}

export function WorkspaceExplorer({ intel, plan, execution, onNavigate }: WorkspaceExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['source', 'services']));
  const [search, setSearch] = useState('');

  const sections: SectionDef[] = useMemo(() => [
    {
      id: 'source', label: 'Source Tree', icon: FolderTree,
      children: intel ? [
        { id: 'langs', label: `Languages (${intel.languages?.length ?? 0})`, kind: 'language', path: '/langs', children: (intel.languages ?? []).map((l: string) => ({ id: `lang-${l}`, label: l, kind: 'file', path: `/lang/${l}`, children: [] })) },
        { id: 'fws', label: `Frameworks (${intel.frameworks?.length ?? 0})`, kind: 'framework', path: '/fws', children: (intel.frameworks ?? []).map((f: string) => ({ id: `fw-${f}`, label: f, kind: 'file', path: `/fw/${f}`, children: [] })) },
        { id: 'entry', label: 'Entry Points', kind: 'directory', path: '/entry', children: (intel.entryPoints ?? []).slice(0, 5).map((e: string) => ({ id: `ep-${e}`, label: e, kind: 'file', path: `/entry/${e}`, children: [] })) },
        { id: 'files', label: `${intel.totalFiles ?? 0} files · ${intel.packageCount ?? 0} packages`, kind: 'directory', path: '/files', children: [] },
      ] : [],
    },
    {
      id: 'services', label: 'Services', icon: Database,
      children: intel?.services?.map((s: any) => ({
        id: `svc-${s.name}`, label: s.name, kind: s.kind, path: `/svc/${s.name}`,
        children: [{ id: `svc-${s.name}-sdk`, label: s.sdk ?? 'no sdk', kind: 'dependency', path: `/sdk/${s.sdk}`, children: [] }],
      })) ?? [],
    },
    {
      id: 'deps', label: 'Dependencies', icon: Package,
      children: intel?.packageManagers?.map((m: string) => ({
        id: `pm-${m}`, label: m, kind: 'dependency', path: `/pm/${m}`, children: [],
      })) ?? [],
    },
    {
      id: 'runtime', label: 'Runtime', icon: Cpu,
      children: intel?.runtimes?.map((r: any) => ({
        id: `rt-${r.kind}`, label: `${r.kind} ${r.version ?? ''}`, kind: 'runtime', path: `/rt/${r.kind}`, children: [],
      })) ?? [],
    },
    {
      id: 'env', label: 'Environment', icon: Key,
      children: intel?.env?.filter((e: any) => e.required).slice(0, 8).map((e: any) => ({
        id: `env-${e.name}`, label: e.name, kind: 'environment', path: `/env/${e.name}`, children: [],
      })) ?? [],
    },
    {
      id: 'deploy', label: 'Deploy & CI', icon: Globe,
      children: [
        ...(intel?.ci?.systems?.map((s: string) => ({ id: `ci-${s}`, label: s, kind: 'ci', path: `/ci/${s}`, children: [] })) ?? []),
        ...(intel?.deploy?.targets?.map((t: string) => ({ id: `dep-${t}`, label: t, kind: 'deploy', path: `/deploy/${t}`, children: [] })) ?? []),
      ],
    },
    {
      id: 'exec', label: 'Execution Queue', icon: Play,
      children: execution?.commands?.slice(0, 10)?.filter((c: any) => c.status !== 'completed')?.map((c: any) => ({
        id: `exec-${c.id}`, label: c.description.slice(0, 40), kind: 'execution', path: `/exec/${c.id}`, children: [],
      })) ?? [],
    },
    {
      id: 'memory', label: 'Memory', icon: Brain,
      children: [{ id: 'mem-decisions', label: 'Decisions', kind: 'memory', path: '/memory/decisions', children: [] },
        { id: 'mem-learnings', label: 'Learnings', kind: 'memory', path: '/memory/learnings', children: [] },
        { id: 'mem-architecture', label: 'Architecture', kind: 'memory', path: '/memory/architecture', children: [] }],
    },
  ], [intel, plan, execution]);

  const toggleSection = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const filtered = search
    ? sections.map(s => ({
      ...s,
      children: s.children?.filter(c => c.label.toLowerCase().includes(search.toLowerCase())),
    })).filter(s => s.children && s.children.length > 0)
    : sections;

  return (
    <div className="space-y-0.5">
      <div className="px-2 mb-2">
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-6 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30"
          />
        </div>
      </div>

      {filtered.map(section => (
        <div key={section.id}>
          <button
            onClick={() => toggleSection(section.id)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-slate-800/30 transition-colors rounded"
          >
            {expanded.has(section.id) ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
            <section.icon className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{section.label}</span>
            <span className="text-[9px] text-slate-600 ml-auto">{section.children?.length ?? 0}</span>
          </button>
          {expanded.has(section.id) && section.children && (
            <div className="ml-5">
              {section.children.length === 0 ? (
                <div className="text-[9px] text-slate-600 italic px-2 py-1">Empty</div>
              ) : (
                section.children.map(node => (
                  <button
                    key={node.id}
                    onClick={() => onNavigate?.(node.kind, node.id)}
                    className="w-full flex items-center gap-1.5 px-2 py-0.5 text-left hover:bg-slate-800/20 transition-colors rounded text-[10px] text-slate-400"
                  >
                    <File className="w-2.5 h-2.5 text-slate-600" />
                    <span className="truncate">{node.label}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
