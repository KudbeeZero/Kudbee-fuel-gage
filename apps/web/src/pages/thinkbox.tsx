/**
 * THINKBOX — Project Intelligence & Workspace Provisioning Dashboard
 *
 * PR-002 + PR-003 unified view. Every section consumes normalized manifests.
 * Simulation mode by default — no side effects until confirmed.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Brain,
  Code2,
  Database,
  Globe,
  Key,
  Package,
  Play,
  Rocket,
  Server,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Loader2,
  FileJson,
  Cpu,
  Layers,
  Workflow,
  Zap,
  Shield,
  Radio,
  Sliders,
  Eye,
  EyeOff,
  GitBranch,
  ArrowRight,
  ArrowDown,
  TrendingUp,
  Network,
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/apiClient';

// ---- Types ----

interface IntelligenceManifest {
  workspaceId: string;
  detectedAt: string;
  summary: string;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  dependencies: Array<{
    manager: string;
    lockfilePresent: boolean;
    lockfilePath: string | null;
    lockfileKind: string | null;
    direct: Array<{ name: string; version: string | null; category: string }>;
    transitiveCount: number;
    totalCount: number;
    workspaceCount: number;
    workspacePackages: string[];
  }>;
  runtimes: Array<{ kind: string; version: string | null; source: string }>;
  scripts: { build: string[]; start: string[]; test: string[]; dev: string[]; lint: string[]; format: string[]; other: Array<{ name: string; command: string }> };
  env: Array<{ name: string; source: string; required: boolean; category: string }>;
  services: Array<{ kind: string; name: string; sdk: string | null; envVarsRequired: string[]; evidence: string[] }>;
  ci: { systems: string[] };
  deploy: { targets: string[]; configFiles: string[] };
  cdn: { networks: string[] };
  entryPoints: string[];
  totalFiles: number;
  packageCount: number;
  confidence: number;
}

interface ProvisionPlan {
  workspaceId: string;
  plannedAt: string;
  summary: string;
  simulation: boolean;
  totalSteps: number;
  estimatedTotalDurationMs: number;
  warnings: string[];
  risks: Array<{ severity: string; message: string }>;
  phases: Record<string, Array<{
    id: string;
    phase: string;
    label: string;
    command: string | null;
    status: string;
    reason: string;
    risk: string;
    estimatedDurationMs: number | null;
  }>>;
  orderedSteps: string[];
  graph: {
    nodes: Array<{ id: string; label: string; kind: string; version: string | null; present: boolean }>;
    edges: Array<{ from: string; to: string; label: string }>;
    rootId: string;
  };
  readyScore: {
    total: number;
    grade: string;
    runtime: number;
    dependencies: number;
    environment: number;
    ci: number;
    deploy: number;
    risk: number;
    recommendedNextAction: string;
    breakdown: Record<string, { score: number; maxScore: number; issues: string[] }>;
  };
}

// ---- Sub-Components ----

function Badge({ children, color = 'slate' }: { children: string; color?: string }) {
  const c: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    slate: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${c[color] ?? c.slate}`}>{children}</span>;
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
        <Icon className="w-3.5 h-3.5 text-emerald-400" />
      </div>
      <div>
        <h3 className="font-display text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  const labels: Record<string, string> = {
    pending: 'Pending', runtime_detection: 'Runtime', dependency_install: 'Deps',
    service_setup: 'Services', env_config: 'Env', build: 'Build', test: 'Test',
    deploy: 'Deploy', ready: 'Ready',
  };
  const colors: Record<string, string> = {
    runtime_detection: 'cyan', dependency_install: 'emerald', service_setup: 'violet',
    env_config: 'amber', build: 'blue', test: 'orange', deploy: 'rose', pending: 'slate', ready: 'emerald',
  };
  return <Badge color={colors[phase] ?? 'slate'}>{labels[phase] ?? phase}</Badge>;
}

function RiskBadge({ risk }: { risk: string }) {
  const c: Record<string, string> = { none: 'slate', low: 'emerald', medium: 'amber', high: 'rose' };
  return <Badge color={c[risk] ?? 'slate'}>{risk.toUpperCase()}</Badge>;
}

function GradeBadge({ grade }: { grade: string }) {
  const c: Record<string, string> = { A: 'emerald', B: 'blue', C: 'amber', D: 'orange', F: 'rose' };
  return <span className={`text-lg font-display font-bold ${c[grade] ? `text-${c[grade]}-400` : 'text-slate-400'}`}>{grade}</span>;
}

// ---- Main Page ----

export function ThinkboxPage() {
  const [intel, setIntel] = useState<IntelligenceManifest | null>(null);
  const [plan, setPlan] = useState<ProvisionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState<'intel' | 'plan' | null>(null);
  const [simulation, setSimulation] = useState(true);
  const [terminalExpanded, setTerminalExpanded] = useState(true);
  const [activePhase, setActivePhase] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const detectRes = await apiPost<{ workspaceId: string }>('/api/thinkbox/detect', { path: '.' });
      if (!detectRes?.workspaceId) throw new Error('Detection failed');

      const [intelData, planData] = await Promise.all([
        apiGet<IntelligenceManifest>(`/api/thinkbox/intelligence/${detectRes.workspaceId}`),
        apiGet<ProvisionPlan>(`/api/thinkbox/provision/${detectRes.workspaceId}?sim=1`),
      ]);

      setIntel(intelData);
      setPlan(planData);
      setSimulation(planData?.simulation ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSimulation = async () => {
    if (!plan?.workspaceId) return;
    const newSim = !simulation;
    setSimulation(newSim);
    try {
      const updated = await apiGet<ProvisionPlan>(`/api/thinkbox/provision/${plan.workspaceId}?sim=${newSim ? 1 : 0}`);
      if (updated) setPlan(updated);
    } catch {}
  };

  const prodDeps = intel?.dependencies.flatMap(d => d.direct.filter(e => e.category === 'dependency')) ?? [];
  const devDeps = intel?.dependencies.flatMap(d => d.direct.filter(e => e.category === 'dev-dep')) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <span className="ml-3 text-slate-500 font-mono text-sm">Analyzing project...</span>
      </div>
    );
  }

  return (
    <div className="min-h-dvh space-y-6" id="thinkbox-page">
      {/* ---- Header ---- */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <Boxes className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">THINKBOX</h1>
            <p className="text-xs text-slate-500">Project Intelligence &amp; Workspace Provisioning</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <button onClick={toggleSimulation}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${simulation ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
              {simulation ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {simulation ? 'SIM ON' : 'SIM OFF'}
            </button>
          )}
          <button onClick={fetchData} className="p-2 rounded-lg border border-slate-700/30 bg-slate-800/30 text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowJson(showJson === 'plan' ? null : 'plan')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${showJson === 'plan' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-slate-800/30 border-slate-700/30 text-slate-500 hover:text-slate-300'}`}>
            <FileJson className="w-3 h-3" /> Manifest
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-400">{error}</div>}

      {/* ---- JSON Inspector ---- */}
      {showJson === 'plan' && plan && (
        <div className="rounded-xl border border-amber-500/20 bg-slate-950/60 p-4 max-h-96 overflow-y-auto">
          <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">{JSON.stringify(plan, null, 2)}</pre>
        </div>
      )}

      {intel && plan ? (
        <>
          {/* ---- Ready Score Bar ---- */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <SectionHeader icon={TrendingUp} title="Workspace Ready Score" />
                <GradeBadge grade={plan.readyScore.grade} />
              </div>
              <span className="text-2xl font-display font-bold text-emerald-400">{plan.readyScore.total}<span className="text-sm text-slate-600">/100</span></span>
            </div>
            <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden mb-3">
              <div className={`h-full rounded-full transition-all duration-1000 ${plan.readyScore.total >= 90 ? 'bg-emerald-500' : plan.readyScore.total >= 70 ? 'bg-blue-500' : plan.readyScore.total >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${plan.readyScore.total}%` }} />
            </div>
            <div className="grid grid-cols-6 gap-3 text-center">
              {Object.entries(plan.readyScore.breakdown ?? {}).slice(0, 6).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2">
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">{k.replace(/ /g, '\u00A0')}</div>
                  <div className={`text-xs font-mono font-bold ${v.score === v.maxScore ? 'text-emerald-400' : v.score === 0 ? 'text-rose-400' : 'text-amber-400'}`}>
                    {v.score}/{v.maxScore}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              Next: {plan.readyScore.recommendedNextAction}
            </div>
          </div>

          {/* ---- Stats Row ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { l: 'Languages', v: intel.languages.length, c: 'emerald' },
              { l: 'Deps', v: prodDeps.length + devDeps.length, c: 'blue' },
              { l: 'Services', v: intel.services.length, c: 'violet' },
              { l: 'Env Vars', v: intel.env.filter(e => e.required).length, c: 'amber' },
              { l: 'Steps', v: plan.totalSteps, c: 'cyan' },
              { l: 'Risks', v: plan.risks.length, c: 'rose' },
              { l: 'Est.', v: `${Math.round(plan.estimatedTotalDurationMs / 1000)}s`, c: 'orange' },
              { l: 'Sim', v: simulation ? 'ON' : 'OFF', c: simulation ? 'amber' : 'emerald' },
            ].map((s) => (
              <div key={s.l} className={`rounded-xl border border-${s.c}-500/20 bg-${s.c}-500/5 p-3 text-center`}>
                <div className={`text-[10px] text-${s.c}-400 font-mono uppercase tracking-wider`}>{s.l}</div>
                <div className={`text-lg font-display font-bold text-${s.c}-300`}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* ---- Build Pipeline ---- */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
            <SectionHeader icon={Workflow} title="Build Pipeline" subtitle={`${plan.totalSteps} steps · ${Math.round(plan.estimatedTotalDurationMs / 1000)}s estimated`} />
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {(['runtime_detection', 'dependency_install', 'service_setup', 'env_config', 'build', 'test', 'deploy'] as const)
                .filter(phase => (plan.phases[phase] ?? []).length > 0)
                .map((phase, i, arr) => (
                  <div key={phase} className="flex items-center gap-0 shrink-0">
                    <button onClick={() => setActivePhase(activePhase === phase ? null : phase)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono transition-colors ${activePhase === phase ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700/30 bg-slate-800/30 text-slate-400 hover:text-slate-200'}`}>
                      <PhaseBadge phase={phase} />
                      <span className="tabular-nums">{(plan.phases[phase] ?? []).length}</span>
                    </button>
                    {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600 mx-1" />}
                  </div>
                ))}
            </div>
            {activePhase && (plan.phases[activePhase] ?? []).length > 0 && (
              <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                {(plan.phases[activePhase] ?? []).map((step) => (
                  <div key={step.id} className="flex items-center gap-2 text-[10px] rounded border border-slate-800/30 bg-slate-950/30 p-2">
                    {step.status === 'skipped' ? <XCircle className="w-3 h-3 text-slate-600" /> :
                     step.command?.startsWith('[SIM]') ? <Eye className="w-3 h-3 text-amber-400" /> :
                     <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    <span className="text-slate-300 flex-1 truncate">{step.label}</span>
                    <RiskBadge risk={step.risk} />
                    {step.command && <span className="text-slate-600 font-mono truncate max-w-[120px]">{step.command.split(' ').slice(0, 2).join(' ')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Two-column: Deps + Services ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <SectionHeader icon={Package} title="Dependency Intelligence" />
              <div className="space-y-2">
                {intel.dependencies.map((dep, i) => (
                  <div key={i} className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-emerald-400">{dep.manager}</span>
                      <div className="flex gap-1">
                        {dep.lockfilePresent ? <Badge color="emerald">lockfile</Badge> : <Badge color="amber">no lock</Badge>}
                        <span className="text-[9px] font-mono text-slate-500">{dep.transitiveCount} transitive</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {dep.direct.slice(0, 8).map((e, j) => (
                        <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${e.category === 'dev-dep' ? 'bg-slate-800/40 text-slate-500' : 'bg-slate-800/60 text-slate-300'}`}>
                          {e.name}{e.version ? `@${e.version.replace(/[\^~]/, '')}` : ''}
                        </span>
                      ))}
                      {dep.direct.length > 8 && <span className="text-[10px] text-slate-600">+{dep.direct.length - 8}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <SectionHeader icon={Network} title="Dependency Graph" subtitle={`${plan.graph.nodes.length} nodes · ${plan.graph.edges.length} edges`} />
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {plan.graph.nodes.filter(n => n.id !== plan.graph.rootId).slice(0, 20).map((node) => (
                  <div key={node.id} className="flex items-center gap-2 text-[10px] py-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${node.present ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="font-mono text-slate-300">{node.label}</span>
                    <span className="text-slate-600">{node.kind}</span>
                    {node.version && <span className="text-slate-500">{node.version}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ---- Simulation Terminal ---- */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/80 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900/60">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-[11px] font-semibold text-slate-300 tracking-wider">PROVISION TERMINAL</span>
                {simulation && <Badge color="amber">SIMULATION</Badge>}
                {!simulation && <Badge color="rose">LIVE</Badge>}
              </div>
              <button onClick={() => setTerminalExpanded(!terminalExpanded)} className="p-1 text-slate-500 hover:text-slate-300">
                {terminalExpanded ? <XCircle className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            </div>
            {terminalExpanded && (
              <div className="p-4 font-mono text-[11px] max-h-64 overflow-y-auto space-y-0.5">
                <div className="text-emerald-400">$ thinkbox provision {plan.workspaceId.slice(0, 8)}</div>
                <div className="text-amber-400">[SIM] Provisioning simulation — no commands will execute</div>
                <div className="text-slate-500">[SIM] Plan: {plan.totalSteps} steps · {Math.round(plan.estimatedTotalDurationMs / 1000)}s estimated</div>
                <div className="text-slate-600">---</div>
                {Object.entries(plan.phases).filter(([, steps]) => steps.length > 0).map(([phase, steps]) => (
                  <div key={phase}>
                    <div className="text-cyan-400 mt-1">[{phase}]</div>
                    {steps.map(step => (
                      <div key={step.id} className="ml-4">
                        {step.command ? (
                          <span className="text-amber-400">$ {step.command}</span>
                        ) : step.status === 'skipped' ? (
                          <span className="text-slate-600"># SKIP: {step.label}</span>
                        ) : (
                          <span className="text-slate-400"># {step.label}</span>
                        )}
                        {step.risk !== 'none' && <span className="text-rose-400 ml-2">[RISK:{step.risk}]</span>}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="text-slate-600">---</div>
                <div className="text-emerald-400">Ready Score: {plan.readyScore.total}/100 ({plan.readyScore.grade})</div>
                {plan.warnings.length > 0 && <div className="text-amber-400 mt-1">Warnings: {plan.warnings.length}</div>}
                <div className="text-slate-500">$ _</div>
              </div>
            )}
          </div>

          {/* ---- Agent Activity ---- */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
            <SectionHeader icon={Radio} title="Agent Activity" subtitle="Swarm status — live" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { name: 'KILOH', role: 'Orchestrator', status: 'active', color: 'emerald', task: 'Mission THINKBOX-003' },
                { name: 'FORGE', role: 'Workspace Builder', status: 'active', color: 'violet', task: 'Provision plan generated' },
                { name: 'DTHINK', role: 'Knowledge', status: 'active', color: 'blue', task: 'Recording learnings' },
                { name: 'GATE', role: 'Quality', status: 'active', color: 'amber', task: 'CI verification pending' },
                { name: 'JOURNAL', role: 'Memory', status: 'active', color: 'cyan', task: 'Session logging' },
                { name: 'BUS', role: 'Events', status: 'active', color: 'rose', task: 'Publishing timeline' },
              ].map((agent) => (
                <div key={agent.name} className={`rounded-lg border p-3 ${agent.status === 'active' ? `border-${agent.color}-500/20 bg-${agent.color}-500/5` : 'border-slate-800/40 bg-slate-950/40'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${agent.status === 'active' ? `bg-${agent.color}-400 animate-pulse` : 'bg-slate-600'}`} />
                    <span className={`text-xs font-mono font-bold text-${agent.color}-400`}>{agent.name}</span>
                  </div>
                  <div className="text-[9px] text-slate-500">{agent.role}</div>
                  <div className="mt-1 text-[10px] text-slate-400 truncate">{agent.task}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ---- Risks & Warnings ---- */}
          {plan.risks.length > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
              <SectionHeader icon={AlertTriangle} title="Risks & Warnings" subtitle={`${plan.risks.length} risks · ${plan.warnings.length} warnings`} />
              <div className="space-y-1">
                {plan.risks.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] p-1.5">
                    <AlertTriangle className={`w-3 h-3 ${r.severity === 'high' ? 'text-rose-400' : r.severity === 'medium' ? 'text-amber-400' : 'text-slate-500'}`} />
                    <span className="text-slate-300">{r.message}</span>
                    <Badge color={r.severity === 'high' ? 'rose' : r.severity === 'medium' ? 'amber' : 'slate'}>{r.severity}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Summary Footer ---- */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-slate-600" />
              <span className="text-[10px] text-slate-500">Planned: {new Date(plan.plannedAt).toLocaleTimeString()} · Workspace: {plan.workspaceId.slice(0, 8)}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">{plan.summary}</div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Boxes className="w-16 h-16 text-slate-700 mb-4" />
          <h2 className="text-lg font-display font-bold text-slate-400 mb-2">No Data Loaded</h2>
          <p className="text-sm text-slate-600 max-w-md">Run detection and provisioning to see the dashboard.</p>
          {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default ThinkboxPage;
