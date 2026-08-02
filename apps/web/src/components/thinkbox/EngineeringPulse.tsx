/**
 * THINKBOX-016A — Engineering Pulse
 *
 * Persistent top card. Always visible on mobile. Shows:
 * Mission, Engineering Confidence, CI, Deployment, PR,
 * Agent Count, BUS, SSE, Terminal Status.
 * One tap opens details.
 */

import { useState } from 'react';
import {
  Activity, GitBranch, Rocket, Wifi, WifiOff,
  Terminal, ChevronDown, ChevronUp, Zap, Target,
} from 'lucide-react';

interface EngineeringPulseProps {
  mission: string;
  missionProgress: number;
  confidence: number;
  ciStatus: 'pass' | 'fail' | 'running' | 'unknown';
  deployStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  prNumber: number | null;
  prTitle: string;
  prStatus: 'open' | 'merged' | 'draft' | 'none';
  agentsOnline: number;
  agentsTotal: number;
  busConnected: boolean;
  sseConnected: boolean;
  terminalActive: boolean;
  latencyMs: number;
}

function PulseDot({ active, color = 'emerald' }: { active: boolean; color?: string }) {
  const c = active
    ? color === 'emerald' ? 'bg-emerald-400' : color === 'amber' ? 'bg-amber-400' : 'bg-rose-400'
    : 'bg-slate-600';
  return <span className={`w-2 h-2 rounded-full ${c} ${active ? 'animate-pulse' : ''}`} />;
}

function StatusChip({ label, value, status }: { label: string; value: string; status: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const colors = {
    good: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    warn: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    bad: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    neutral: 'text-slate-400 bg-slate-800/30 border-slate-700/30',
  };
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg border min-h-[44px] justify-center ${colors[status]}`}>
      <span className="text-[9px] font-mono uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-xs font-mono font-bold">{value}</span>
    </div>
  );
}

export function EngineeringPulse({
  mission, missionProgress, confidence, ciStatus, deployStatus,
  prNumber, prTitle, prStatus, agentsOnline, agentsTotal,
  busConnected, sseConnected, terminalActive, latencyMs,
}: EngineeringPulseProps) {
  const [expanded, setExpanded] = useState(false);

  const overallHealth = ciStatus === 'pass' && deployStatus === 'healthy' && busConnected ? 'good' : 'warn';
  const healthLabel = overallHealth === 'good' ? 'HEALTHY' : 'DEGRADED';
  const healthPct = overallHealth === 'good' ? 94 : 62;

  const ciChip = ciStatus === 'pass' ? { v: 'PASS', s: 'good' as const } : ciStatus === 'fail' ? { v: 'FAIL', s: 'bad' as const } : ciStatus === 'running' ? { v: 'RUN', s: 'warn' as const } : { v: '—', s: 'neutral' as const };
  const deployChip = deployStatus === 'healthy' ? { v: 'OK', s: 'good' as const } : deployStatus === 'degraded' ? { v: 'DEG', s: 'warn' as const } : deployStatus === 'down' ? { v: 'DOWN', s: 'bad' as const } : { v: '—', s: 'neutral' as const };
  const busChip = busConnected ? { v: 'LIVE', s: 'good' as const } : { v: 'OFF', s: 'bad' as const };
  const sseChip = sseConnected ? { v: 'LIVE', s: 'good' as const } : { v: 'OFF', s: 'bad' as const };
  const prChip = prStatus === 'merged' ? { v: 'MERGED', s: 'good' as const } : prStatus === 'open' ? { v: `#${prNumber}`, s: 'good' as const } : prStatus === 'draft' ? { v: 'DRAFT', s: 'warn' as const } : { v: '—', s: 'neutral' as const };
  const agentsChip = agentsOnline === agentsTotal ? { v: `${agentsOnline}/${agentsTotal}`, s: 'good' as const } : { v: `${agentsOnline}/${agentsTotal}`, s: 'warn' as const };

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {/* Collapsed view — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[44px]"
        aria-expanded={expanded}
      >
        {/* Health ring */}
        <div className="relative w-14 h-14 shrink-0">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-800" />
            <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4"
              className={overallHealth === 'good' ? 'text-emerald-400' : 'text-amber-400'}
              strokeDasharray={`${(healthPct / 100) * 150.8} 150.8`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-sm font-display font-bold ${overallHealth === 'good' ? 'text-emerald-400' : 'text-amber-400'}`}>{healthPct}%</span>
            <span className="text-[7px] font-mono text-slate-500 uppercase">{healthLabel}</span>
          </div>
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-mono text-slate-300 truncate">{mission}</span>
          </div>
          <div className="h-1 rounded-full bg-slate-800/60 mt-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: `${missionProgress}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-slate-500">
            <span className="flex items-center gap-1"><PulseDot active={busConnected} /> BUS</span>
            <span className="flex items-center gap-1"><PulseDot active={sseConnected} color={sseConnected ? 'emerald' : 'rose'} /> SSE</span>
            <span className="flex items-center gap-1"><Terminal className="w-2.5 h-2.5" /> {terminalActive ? 'ACTIVE' : 'IDLE'}</span>
          </div>
        </div>

        {/* Expand toggle */}
        <div className="shrink-0 text-slate-500">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded grid — tap to toggle */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-800/40">
          <div className="grid grid-cols-3 gap-2 mt-3">
            <StatusChip label="CI" value={ciChip.v} status={ciChip.s} />
            <StatusChip label="Deploy" value={deployChip.v} status={deployChip.s} />
            <StatusChip label="PR" value={prChip.v} status={prChip.s} />
            <StatusChip label="Agents" value={agentsChip.v} status={agentsChip.s} />
            <StatusChip label="BUS" value={busChip.v} status={busChip.s} />
            <StatusChip label="SSE" value={sseChip.v} status={sseChip.s} />
          </div>

          <div className="flex items-center justify-between mt-3 text-[9px] font-mono text-slate-600">
            <span>Confidence: {confidence}%</span>
            <span>Latency: {latencyMs > 0 ? `${latencyMs}ms` : '—'}</span>
            <span>{prNumber ? `PR #${prNumber}` : 'No active PR'}</span>
          </div>

          {prTitle && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate">{prTitle}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
