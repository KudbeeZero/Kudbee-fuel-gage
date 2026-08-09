/**
 * THINKBOX — Unified Engineering Workspace
 *
 * PR-002 through PR-008. Consumes a single WorkspaceViewModel.
 * Every panel reads from the same data contract. No scattered APIs.
 *
 * THINKBOX-016A: Mobile-first Founder Mode.
 * On mobile: Engineering Pulse + Mission + PR + Terminal + Continue button.
 * On desktop: Full workspace with all panels.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Boxes, Brain, Code2, Database, Globe, Key, Package, Play,
  Rocket, Server, Terminal, CheckCircle2, XCircle, AlertTriangle,
  Clock, RefreshCw, Loader2, FileJson, Cpu, Layers, Workflow,
  Zap, Shield, Radio, Sliders, Eye, EyeOff, GitBranch, ArrowRight,
  TrendingUp, Network, Search,
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/apiClient';
import { LiveTerminal } from '../components/thinkbox/LiveTerminal';
import { AgentSwarm } from '../components/thinkbox/AgentSwarm';
import { TimelinePanel } from '../components/thinkbox/TimelinePanel';
import { MissionCenter } from '../components/thinkbox/MissionCenter';
import { NotificationCenter } from '../components/thinkbox/NotificationCenter';
import { MemoryPanel } from '../components/thinkbox/MemoryPanel';
import { WorkspaceStatusBar } from '../components/thinkbox/WorkspaceStatusBar';
import { DashboardHealthOverlay } from '../components/thinkbox/DashboardHealthOverlay';
import { useDashboardSync } from '../hooks/useDashboardSync';
import { FounderMode } from '../components/thinkbox/FounderMode';

interface DependencyEntry {
  name: string;
  version: string | null;
  category: 'dependency' | 'dev-dep' | 'peer-dep' | 'optional-dep' | 'workspace';
}

interface DependencyInfo {
  manager: string;
  lockfilePresent: boolean;
  lockfilePath: string | null;
  lockfileKind: string | null;
  packageManifestPath: string;
  direct: DependencyEntry[];
  transitiveCount: number;
  totalCount: number;
  resolutionState: 'complete' | 'partial' | 'none';
  workspacePackages: string[];
  workspaceCount: number;
}

interface EnvVarRequirement {
  name: string;
  source: string;
  required: boolean;
  category: string;
}

interface ScriptsInfo {
  build: string[];
  start: string[];
  test: string[];
  dev: string[];
  lint: string[];
  format: string[];
  other: Array<{ name: string; command: string }>;
}

interface RuntimeInfo {
  kind: string;
  version: string | null;
  source: string;
}

interface ServiceInfo {
  kind: string;
  name: string;
  sdk: string | null;
  envVarsRequired: string[];
  evidence: string[];
}

interface ProjectIntelligenceManifest {
  workspaceId: string;
  detectedAt: string;
  summary: string;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  dependencies: DependencyInfo[];
  runtimes: RuntimeInfo[];
  scripts: ScriptsInfo;
  env: EnvVarRequirement[];
  services: ServiceInfo[];
  cdn: { networks: string[]; frameworks: string[]; staticBuildOutput: string | null };
  deploy: { targets: string[]; configFiles: string[] };
  ci: { systems: string[]; configFiles: string[] };
  entryPoints: string[];
  totalFiles: number;
  packageCount: number;
  confidence: number;
}

interface WorkspaceSummary {
  workspaceId: string;
  name: string;
  sourceType: string;
  state: string;
}

function StateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    detected: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    created: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    detecting: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    failed: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${colors[state] ?? 'text-slate-500 bg-slate-800/50 border-slate-700/30'}`}>
      {state}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
        <Icon className="w-4 h-4 text-emerald-400" />
      </div>
      <div>
        <h3 className="font-display text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = 'emerald' }: { label: string; value: string | number; icon?: React.ComponentType<{ className?: string }>; color?: string }) {
  const borders: Record<string, string> = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    violet: 'border-violet-500/20 bg-violet-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    rose: 'border-rose-500/20 bg-rose-500/5',
    cyan: 'border-cyan-500/20 bg-cyan-500/5',
  };
  return (
    <div className={`rounded-xl border ${borders[color] ?? borders.emerald} p-4`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-600" />}
      </div>
      <div className="text-xl font-display font-bold text-slate-100">{value}</div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    database: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    cache: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'api-key': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    url: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    auth: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    feature: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${colors[category] ?? 'bg-slate-800/30 text-slate-500 border-slate-700/30'}`}>
      {category}
    </span>
  );
}

function ServiceBadge({ kind }: { kind: string }) {
  const colors: Record<string, string> = {
    database: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    cache: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    ai: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    queue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    storage: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    monitoring: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    auth: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    deploy: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    other: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${colors[kind] ?? colors.other}`}>
      {kind}
    </span>
  );
}

export function ThinkboxPage() {
  const dashboard = useDashboardSync();
  const [manifest, setManifest] = useState<ProjectIntelligenceManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulation, setSimulation] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWs, setSelectedWs] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const data = await apiGet<WorkspaceSummary[]>('/api/thinkbox/workspaces');
      setWorkspaces(data ?? []);
    } catch {
      setWorkspaces([]);
    }
  }, []);

  const fetchIntelligence = useCallback(async (workspaceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ProjectIntelligenceManifest>(`/api/thinkbox/intelligence/${workspaceId}`);
      setManifest(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load intelligence');
      setManifest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  useEffect(() => {
    const checkMobile = () => setMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDetect = async () => {
    try {
      const data = await apiPost<WorkspaceSummary>('/api/thinkbox/detect', { path: '.' });
      await fetchWorkspaces();
      if (data?.workspaceId) {
        setSelectedWs(data.workspaceId);
        fetchIntelligence(data.workspaceId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed');
    }
  };

  const prodDeps = manifest?.dependencies.flatMap(d => d.direct.filter(e => e.category === 'dependency')) ?? [];
  const devDeps = manifest?.dependencies.flatMap(d => d.direct.filter(e => e.category === 'dev-dep')) ?? [];
  const totalDeps = prodDeps.length + devDeps.length;
  const hasLockfiles = manifest?.dependencies.some(d => d.lockfilePresent) ?? false;

  const dbServices = manifest?.services.filter(s => s.kind === 'database') ?? [];
  const cacheServices = manifest?.services.filter(s => s.kind === 'cache') ?? [];
  const aiServices = manifest?.services.filter(s => s.kind === 'ai') ?? [];
  const otherServices = manifest?.services.filter(s => !['database', 'cache', 'ai'].includes(s.kind)) ?? [];

  const requiredEnv = manifest?.env.filter(e => e.required) ?? [];
  const optionalEnv = manifest?.env.filter(e => !e.required) ?? [];

  const readinessChecks = [
    { label: 'Detection', done: (manifest?.languages?.length ?? 0) > 0 },
    { label: 'Dependencies', done: totalDeps > 0 },
    { label: 'Lockfiles', done: hasLockfiles },
    { label: 'Runtimes', done: (manifest?.runtimes?.length ?? 0) > 0 },
    { label: 'Scripts', done: (manifest?.scripts?.build?.length ?? 0) > 0 || (manifest?.scripts?.start?.length ?? 0) > 0 },
    { label: 'Env Vars', done: requiredEnv.length > 0 },
    { label: 'Services', done: (manifest?.services?.length ?? 0) > 0 },
    { label: 'CI/CD', done: (manifest?.ci?.systems?.length ?? 0) > 0 },
  ];
  const readyCount = readinessChecks.filter(c => c.done).length;

  return (
    <div className={`min-h-dvh ${mobile ? 'pb-20' : ''}`} id="thinkbox-page">
       {mobile && (
        <div className="px-4 pt-4 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-bold text-slate-100">THINKBOX</h1>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">v2.2 MOBILE</span>
          </div>
          <FounderMode />
        </div>
      )}
      {!mobile && (
        <>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <Boxes className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">THINKBOX</h1>
            <p className="text-xs text-slate-500">Project Intelligence Engine — PR-002</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDetect}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono hover:bg-emerald-500/20 transition-colors"
          >
            <Play className="w-3 h-3" />
            Detect Project
          </button>
          {manifest && (
            <button
              onClick={() => setShowJson(!showJson)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${showJson ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-slate-800/30 border-slate-700/30 text-slate-500 hover:text-slate-300'}`}
            >
              <FileJson className="w-3 h-3" />
              Manifest
            </button>
          )}
        </div>
      </header>

      {showJson && manifest && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Project Intelligence Manifest</span>
            <button onClick={() => setShowJson(false)} className="text-slate-500 hover:text-slate-300"><XCircle className="w-3.5 h-3.5" /></button>
          </div>
          <pre className="text-[10px] text-slate-400 font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">{JSON.stringify(manifest, null, 2)}</pre>
        </div>
      )}

      {manifest ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <StatCard label="Languages" value={manifest.languages.length} icon={Code2} />
            <StatCard label="Frameworks" value={manifest.frameworks.length > 0 ? manifest.frameworks.join(', ') : '—'} icon={Layers} />
            <StatCard label="Dependencies" value={`${totalDeps} (${prodDeps.length} prod)`} icon={Package} />
            <StatCard label="Services" value={manifest.services.length} icon={Database} color="violet" />
            <StatCard label="Confidence" value={`${Math.round(manifest.confidence * 100)}%`} icon={Brain} color={manifest.confidence > 0.7 ? 'emerald' : 'amber'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <SectionHeader icon={Package} title="Dependency Intelligence" subtitle={`${manifest.dependencies.length} manager${manifest.dependencies.length !== 1 ? 's' : ''}`} />
              <div className="space-y-3">
                {manifest.dependencies.map((dep, i) => (
                  <div key={i} className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-emerald-400">{dep.manager}</span>
                      <div className="flex items-center gap-2">
                        {dep.lockfilePresent ? (
                          <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">lockfile</span>
                        ) : (
                          <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">no lockfile</span>
                        )}
                        <span className="text-[9px] font-mono text-slate-500">{dep.transitiveCount} transitive</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {dep.direct.slice(0, 12).map((e, j) => (
                        <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${e.category === 'dev-dep' ? 'bg-slate-800/40 text-slate-500' : 'bg-slate-800/60 text-slate-300'}`}>
                          {e.name}{e.version ? `@${e.version}` : ''}
                        </span>
                      ))}
                      {dep.direct.length > 12 && <span className="text-[10px] text-slate-600">+{dep.direct.length - 12} more</span>}
                    </div>
                    {dep.workspaceCount > 0 && (
                      <div className="mt-2 text-[10px] text-slate-500">
                        Workspaces: {dep.workspacePackages.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <SectionHeader icon={Cpu} title="Runtime & Scripts" subtitle={`${manifest.runtimes.length} runtime${manifest.runtimes.length !== 1 ? 's' : ''}`} />
              <div className="space-y-3">
                {manifest.runtimes.map((rt, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-800/40 bg-slate-950/40 p-2.5">
                    <span className="text-xs font-mono text-slate-300">{rt.kind}</span>
                    {rt.version && <span className="text-[10px] font-mono text-emerald-400">{rt.version}</span>}
                    <span className="text-[9px] text-slate-600 ml-auto">{rt.source}</span>
                  </div>
                ))}
                {manifest.scripts.build.length > 0 && (
                  <div className="text-[10px] text-slate-500 mt-2">
                    <span className="text-slate-400">Build:</span> {manifest.scripts.build.slice(0, 2).join(', ')}
                    {manifest.scripts.build.length > 2 && ` +${manifest.scripts.build.length - 2}`}
                  </div>
                )}
                {manifest.scripts.start.length > 0 && (
                  <div className="text-[10px] text-slate-500">
                    <span className="text-slate-400">Start:</span> {manifest.scripts.start.slice(0, 2).join(', ')}
                  </div>
                )}
                {manifest.scripts.test.length > 0 && (
                  <div className="text-[10px] text-slate-500">
                    <span className="text-slate-400">Test:</span> {manifest.scripts.test.slice(0, 2).join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <SectionHeader icon={Database} title="Services" subtitle={`${manifest.services.length} detected`} />
              <div className="space-y-2">
                {dbServices.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[9px] text-violet-400 font-mono uppercase tracking-wider">Databases</span>
                    {dbServices.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 mt-1 text-[10px]">
                        <span className="text-slate-300">{s.name}</span>
                        {s.sdk && <span className="text-slate-600 font-mono">{s.sdk}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {cacheServices.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[9px] text-amber-400 font-mono uppercase tracking-wider">Cache</span>
                    {cacheServices.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 mt-1 text-[10px]">
                        <span className="text-slate-300">{s.name}</span>
                        {s.sdk && <span className="text-slate-600 font-mono">{s.sdk}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {aiServices.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[9px] text-rose-400 font-mono uppercase tracking-wider">AI / LLM</span>
                    {aiServices.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 mt-1 text-[10px]">
                        <span className="text-slate-300">{s.name}</span>
                        {s.sdk && <span className="text-slate-600 font-mono">{s.sdk}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {otherServices.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-300">{s.name}</span>
                    <ServiceBadge kind={s.kind} />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <SectionHeader icon={Key} title="Environment Variables" subtitle={`${manifest.env.length} detected`} />
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {requiredEnv.slice(0, 15).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono text-slate-300 truncate">{e.name}</span>
                    <CategoryBadge category={e.category} />
                    <span className="text-slate-600 ml-auto">{e.source}</span>
                  </div>
                ))}
                {requiredEnv.length > 15 && (
                  <div className="text-[10px] text-slate-600">+ {requiredEnv.length - 15} more</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <SectionHeader icon={Rocket} title="Deployment & CI" />
              <div className="space-y-3">
                {manifest.deploy.targets.length > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Deploy Targets</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {manifest.deploy.targets.map((t, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {manifest.ci.systems.length > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">CI Systems</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {manifest.ci.systems.map((s, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {manifest.cdn.networks.length > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">CDN</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {manifest.cdn.networks.map((n, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[10px] text-slate-500">
                  <span className="text-slate-400">Entry Points:</span> {manifest.entryPoints.join(', ')}
                </div>
                <div className="text-[10px] text-slate-500">
                  <span className="text-slate-400">Files:</span> {manifest.totalFiles} | <span className="text-slate-400">Packages:</span> {manifest.packageCount}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 mb-6">
            <SectionHeader icon={Workflow} title="Engineering Readiness" subtitle={`${readyCount}/${readinessChecks.length} checks passed`} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {readinessChecks.map((check, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 ${check.done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-800/40 bg-slate-950/40'}`}>
                  {check.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-slate-600" />}
                  <span className={`text-xs font-mono ${check.done ? 'text-slate-300' : 'text-slate-600'}`}>{check.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500/50 transition-all" style={{ width: `${(readyCount / readinessChecks.length) * 100}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
            <SectionHeader icon={Clock} title="Detection Summary" />
            <div className="text-xs text-slate-400">{manifest.summary}</div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-600">
              <span>Detected: {new Date(manifest.detectedAt).toLocaleString()}</span>
              <span>Workspace: {manifest.workspaceId.slice(0, 8)}</span>
              <span>Confidence: {Math.round(manifest.confidence * 100)}%</span>
            </div>
          </div>

          {/* PHASE-7: THINKBOX Product Layer — live panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <AgentSwarm />
            <MissionCenter />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <NotificationCenter />
            <MemoryPanel />
          </div>
        </>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <span className="ml-3 text-slate-500 font-mono text-sm">Analyzing project...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Boxes className="w-16 h-16 text-slate-700 mb-4" />
          <h2 className="text-lg font-display font-bold text-slate-400 mb-2">No Workspace Selected</h2>
          <p className="text-sm text-slate-600 max-w-md mb-6">
            Click "Detect Project" to analyze the current repository and generate a Project Intelligence Manifest.
          </p>
          <button
            onClick={handleDetect}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-mono hover:bg-emerald-500/20 transition-colors"
          >
            <Play className="w-4 h-4" />
            Detect Project
          </button>
          {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}
        </div>
      )}

       {/* PR-008: Persistent Status Bar */}
      <WorkspaceStatusBar
        readyScore={dashboard.viewModel?.health?.readyScore ?? (manifest?.confidence ? Math.round(manifest.confidence * 100) : 0)}
        grade={dashboard.viewModel?.health?.grade ?? (manifest?.confidence ? (manifest.confidence > 0.8 ? 'A' : manifest.confidence > 0.6 ? 'B' : 'C') : 'F')}
        agentsOnline={dashboard.viewModel?.health?.agentsOnline ?? 6}
        agentsTotal={dashboard.viewModel?.health?.agentsTotal ?? 6}
        busConnected={dashboard.viewModel?.health?.busConnected ?? true}
        sseConnected={dashboard.viewModel?.health?.sseConnected ?? dashboard.connected}
        executionStatus={dashboard.viewModel?.execution?.status ?? 'idle'}
        simulation={simulation}
      />

      {/* PR-008: Developer Health Overlay (Ctrl+Shift+D) */}
      <DashboardHealthOverlay />
      </>)}
    </div>
  );
}

export default ThinkboxPage;
