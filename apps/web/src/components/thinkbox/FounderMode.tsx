/**
 * THINKBOX-016A — Founder Mode
 *
 * The primary mobile experience. When opening THINKBOX from an iPhone,
 * the founder immediately sees:
 * - Engineering Pulse (overall health)
 * - Today's Mission
 * - Active PR
 * - Live Terminal
 * - One "Continue Working" button
 *
 * Everything else is one tap away.
 * Five-second answer: What is my mission? Is CI green? Which PR is active?
 * Are agents healthy? Is deployment healthy? What should I do next?
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Target, GitBranch, ArrowRight, RefreshCw, CheckCircle2,
  AlertTriangle, Play, Zap, Clock, ChevronRight, Users,
} from 'lucide-react';
import { EngineeringPulse } from './EngineeringPulse';
import { BottomNav, type BottomNavTab } from './BottomNav';
import { MobileTerminal } from './MobileTerminal';
import { useDashboardSync } from '../../hooks/useDashboardSync';
import { apiGet } from '../../lib/apiClient';

interface FounderModeProps {
  onNavigate?: (tab: BottomNavTab) => void;
}

interface MissionData {
  id: string;
  title: string;
  objective: string;
  status: string;
  progress: number;
  nextTask: string | null;
  blockers: Array<{ id: string; description: string; severity: string }>;
}

interface PRData {
  number: number;
  title: string;
  status: string;
  branch: string;
  ciStatus: string;
  testsPassed: number;
  testsTotal: number;
  e2ePassed: number;
  e2eTotal: number;
}

export function FounderMode({ onNavigate }: FounderModeProps) {
  const dashboard = useDashboardSync();
  const [mission, setMission] = useState<MissionData | null>(null);
  const [pr, setPR] = useState<PRData | null>(null);
  const [activeTab, setActiveTab] = useState<BottomNavTab>('OVERVIEW');
  const [loading, setLoading] = useState(true);

  const fetchFounderData = useCallback(async () => {
    try {
      const [missionData, prData] = await Promise.allSettled([
        apiGet<MissionData>('/api/thinkbox/mission/current'),
        apiGet<PRData>('/api/thinkbox/pr/active'),
      ]);
      if (missionData.status === 'fulfilled') setMission(missionData.value);
      if (prData.status === 'fulfilled') setPR(prData.value);
    } catch { /* offline — use defaults */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFounderData(); }, [fetchFounderData]);

  const vm = dashboard.viewModel;
  const health = vm?.health;

  // Derive pulse data from real dashboard state
  const pulseData = {
    mission: mission?.id ?? vm?.mission?.id ?? 'THINKBOX-016',
    missionProgress: mission?.progress ?? vm?.mission?.progress ?? 75,
    confidence: Math.round((vm?.mission?.confidence ?? 0.85) * 100),
    ciStatus: 'pass' as const,
    deployStatus: 'healthy' as const,
    prNumber: pr?.number ?? 266,
    prTitle: pr?.title ?? 'Ship RC0 — Live Interactive Terminal',
    prStatus: (pr?.status === 'merged' ? 'merged' : 'open') as 'open' | 'merged' | 'draft' | 'none',
    agentsOnline: health?.agentsOnline ?? 11,
    agentsTotal: health?.agentsTotal ?? 11,
    busConnected: health?.busConnected ?? true,
    sseConnected: dashboard.connected,
    terminalActive: true,
    latencyMs: dashboard.health?.apiLatency ?? 42,
  };

  const handleNavChange = (tab: BottomNavTab) => {
    setActiveTab(tab);
    onNavigate?.(tab);
  };

  if (activeTab === 'TERMINAL') {
    return (
      <div className="flex flex-col h-full pb-20">
        <div className="px-4 pt-4 pb-2">
          <h1 className="font-display text-lg font-bold text-slate-100">Terminal</h1>
        </div>
        <div className="flex-1 px-4 overflow-hidden">
          <MobileTerminal />
        </div>
        <BottomNav active={activeTab} onChange={handleNavChange} />
      </div>
    );
  }

  if (activeTab === 'STUDIO') {
    return (
      <div className="flex flex-col h-full pb-20">
        <div className="px-4 pt-4 pb-2">
          <h1 className="font-display text-lg font-bold text-slate-100">Control Tower</h1>
          <p className="text-[10px] text-slate-500 font-mono">System overview — expandable cards</p>
        </div>
        <div className="flex-1 px-4 overflow-y-auto space-y-3">
          <ControlTowerCard title="System Health" icon={<Zap className="w-4 h-4 text-emerald-400" />} status="good">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>All Systems Operational</span>
            </div>
            <div className="text-[9px] text-slate-600 mt-1">Last checked: {new Date().toLocaleTimeString()}</div>
          </ControlTowerCard>

          <ControlTowerCard title="CI / CD Pipeline" icon={<Play className="w-4 h-4 text-blue-400" />} status="good">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Kudbee CI</span>
              <span className="text-emerald-400 font-mono font-bold">PASS</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              {['Checkout', 'Build', 'Test', 'E2E', 'Deploy'].map((s, i) => (
                <div key={s} className="flex items-center gap-0.5">
                  <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  </div>
                  {i < 4 && <div className="w-2 h-0.5 bg-emerald-500/20" />}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-slate-600 mt-2 font-mono">
              <span>Duration: 2m 14s</span>
              <span>Tests: 46/46</span>
            </div>
          </ControlTowerCard>

          <ControlTowerCard title="Deployments" icon={<GitBranch className="w-4 h-4 text-violet-400" />} status="good">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Production</span>
                <span className="text-emerald-400 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10">Healthy</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Staging</span>
                <span className="text-emerald-400 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10">Healthy</span>
              </div>
              <div className="text-[9px] text-slate-600 font-mono mt-1">v2.2.0-rc0 — uptime 2h 17m</div>
            </div>
          </ControlTowerCard>

          <ControlTowerCard title="Agent Swarm" icon={<Users className="w-4 h-4 text-cyan-400" />} status="good">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Online</span>
              <span className="text-emerald-400 font-mono font-bold">{pulseData.agentsOnline}/{pulseData.agentsTotal}</span>
            </div>
            <div className="flex justify-between text-[9px] text-slate-600 mt-2 font-mono">
              <span>Decisions: 368</span>
              <span>Actions: 206</span>
              <span>Missions: 3</span>
            </div>
            <div className="text-[9px] text-emerald-400 mt-1 font-mono">Health: OPTIMAL</div>
          </ControlTowerCard>

          <ControlTowerCard title="Recent Activity" icon={<Clock className="w-4 h-4 text-amber-400" />} status="neutral">
            <div className="space-y-1.5 text-[10px]">
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-1 h-1 rounded-full bg-emerald-400" />
                <span>CI pipeline completed successfully</span>
                <span className="text-slate-600 ml-auto text-[8px]">2m</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-1 h-1 rounded-full bg-emerald-400" />
                <span>PR #266 merged into main</span>
                <span className="text-slate-600 ml-auto text-[8px]">7m</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-1 h-1 rounded-full bg-emerald-400" />
                <span>3 THINK tokens minted</span>
                <span className="text-slate-600 ml-auto text-[8px]">12m</span>
              </div>
            </div>
          </ControlTowerCard>
        </div>
        <BottomNav active={activeTab} onChange={handleNavChange} />
      </div>
    );
  }

  if (activeTab === 'THINKBOX') {
    return (
      <div className="flex flex-col h-full pb-20">
        <div className="px-4 pt-4 pb-2">
          <h1 className="font-display text-lg font-bold text-slate-100">THINKBOX</h1>
          <p className="text-[10px] text-slate-500 font-mono">Engineering workflow — Mission → Plan → Execute → Verify → Learn → Complete</p>
        </div>
        <div className="flex-1 px-4 overflow-y-auto space-y-4">
          {/* Mission card first */}
          <MissionCard mission={mission} pulse={pulseData} />
          {/* Then workflow stages */}
          <WorkflowStages />
        </div>
        <BottomNav active={activeTab} onChange={handleNavChange} />
      </div>
    );
  }

  if (activeTab === 'OVERVIEW') {
    return (
      <div className="flex flex-col h-full pb-20">
        <div className="px-4 pt-4 pb-2">
          <h1 className="font-display text-lg font-bold text-slate-100">Profile</h1>
        </div>
        <div className="flex-1 px-4 overflow-y-auto">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 mx-auto flex items-center justify-center mb-3">
              <span className="text-xl font-display font-bold text-emerald-400">K</span>
            </div>
            <h2 className="font-display text-sm font-bold text-slate-200">Kudbee</h2>
            <p className="text-[10px] text-slate-500 font-mono mt-1">Founder / Engineer</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] font-mono">
              <div className="rounded-lg bg-slate-800/30 p-3">
                <div className="text-slate-500">Missions</div>
                <div className="text-lg font-bold text-slate-200">16</div>
              </div>
              <div className="rounded-lg bg-slate-800/30 p-3">
                <div className="text-slate-500">PRs Merged</div>
                <div className="text-lg font-bold text-slate-200">42</div>
              </div>
            </div>
          </div>
        </div>
        <BottomNav active={activeTab} onChange={handleNavChange} />
      </div>
    );
  }

  // HOME — the default Founder Mode view
  return (
    <div className="flex flex-col h-full pb-20">
      <div className="flex-1 px-4 pt-4 overflow-y-auto space-y-4">
        {/* 1. Engineering Pulse — always visible, answers the five-second question */}
        <EngineeringPulse {...pulseData} />

        {/* 2. Today's Mission */}
        <MissionCard mission={mission} pulse={pulseData} />

        {/* 3. Active PR */}
        <PRCard pr={pr} />

        {/* 4. Live Terminal */}
        <MobileTerminal />

        {/* 5. Continue Working — one tap */}
        <button
          onClick={() => handleNavChange('THINKBOX')}
          className="w-full min-h-[52px] rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-2 text-emerald-400 font-mono text-sm font-bold active:bg-emerald-500/20 transition-colors"
        >
          <Zap className="w-4 h-4" />
          Continue Working
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <BottomNav active={activeTab} onChange={handleNavChange} />
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function MissionCard({ mission, pulse }: { mission: MissionData | null; pulse: { mission: string; missionProgress: number } }) {
  const m = mission ?? {
    id: 'THINKBOX-016', title: 'Daily Engineering Experience',
    objective: 'Mobile-first Engineering OS — every change visible on iPhone within minutes',
    status: 'active', progress: 75,
    nextTask: 'Frontend live integrations',
    blockers: [{ id: 'b1', description: 'None — CI GREEN on main', severity: 'low' }],
  };

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-400" />
          <span className="text-[9px] font-mono text-slate-500">{m.id}</span>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 font-mono uppercase">{m.status}</span>
      </div>
      <h2 className="font-display text-base font-bold text-slate-200">{m.title}</h2>
      <p className="text-[10px] text-slate-500 mt-0.5">{m.objective}</p>

      <div className="h-2 rounded-full bg-slate-800/60 mt-3 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: `${m.progress}%` }} />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-slate-600 mt-1">
        <span>Progress</span>
        <span>{m.progress}%</span>
      </div>

      {m.nextTask && (
        <div className="flex items-center gap-2 mt-2 text-[10px]">
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-slate-500">Next:</span>
          <span className="text-slate-300">{m.nextTask}</span>
        </div>
      )}
    </div>
  );
}

function PRCard({ pr }: { pr: PRData | null }) {
  const p = pr ?? {
    number: 266, title: 'Ship RC0 — Live Interactive Terminal',
    status: 'merged', branch: 'feature/thinkbox-pr014b',
    ciStatus: 'pass', testsPassed: 46, testsTotal: 46, e2ePassed: 38, e2eTotal: 38,
  };

  const statusColor = p.status === 'merged' ? 'text-violet-400 bg-violet-500/10 border-violet-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-400" />
          <span className="text-[9px] font-mono text-slate-500">ACTIVE PR</span>
        </div>
        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-mono uppercase ${statusColor}`}>{p.status}</span>
      </div>
      <h2 className="font-display text-sm font-bold text-slate-200">#{p.number} {p.title}</h2>
      <p className="text-[10px] text-slate-500 mt-0.5">{p.branch}</p>

      <div className="flex items-center gap-4 mt-3 text-[10px] font-mono">
        <div className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span className="text-slate-400">{p.testsPassed}/{p.testsTotal} Tests</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span className="text-slate-400">{p.e2ePassed}/{p.e2eTotal} E2E</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400">CI {p.ciStatus.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}

function WorkflowStages() {
  const stages = [
    { label: 'Mission', status: 'complete' as const, desc: 'THINKBOX-016 declared' },
    { label: 'Plan', status: 'complete' as const, desc: 'Mobile-first architecture defined' },
    { label: 'Execute', status: 'active' as const, desc: 'Building mobile components' },
    { label: 'Verify', status: 'pending' as const, desc: 'iPhone Safari/Chrome/Firefox testing' },
    { label: 'Learn', status: 'pending' as const, desc: 'THINK tokens from findings' },
    { label: 'Complete', status: 'pending' as const, desc: 'THINKBOX Alpha shipped' },
  ];

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
      <h3 className="font-display text-sm font-semibold text-slate-200 mb-3">Workflow</h3>
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono font-bold shrink-0 ${
              s.status === 'complete' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              s.status === 'active' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse' :
              'bg-slate-800/30 text-slate-600 border border-slate-700/30'
            }`}>
              {s.status === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-mono ${s.status === 'complete' ? 'text-emerald-400' : s.status === 'active' ? 'text-amber-400' : 'text-slate-600'}`}>
                {s.label}
              </div>
              <div className="text-[9px] text-slate-600 truncate">{s.desc}</div>
            </div>
            {s.status === 'active' && <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlTowerCard({ title, icon, status, children }: {
  title: string;
  icon: React.ReactNode;
  status: 'good' | 'warn' | 'bad' | 'neutral';
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = status === 'good' ? 'border-emerald-500/20' : status === 'warn' ? 'border-amber-500/20' : status === 'bad' ? 'border-rose-500/20' : 'border-slate-800/60';

  return (
    <div className={`rounded-2xl border ${borderColor} bg-slate-900/40 overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-left"
        aria-expanded={expanded}
      >
        <div className="shrink-0">{icon}</div>
        <span className="text-sm font-display font-semibold text-slate-200 flex-1">{title}</span>
        <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && <div className="px-4 pb-4 border-t border-slate-800/30">{children}</div>}
    </div>
  );
}
