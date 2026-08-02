/**
 * THINKBOX PR-012 — Engineering Review Panel
 *
 * Displays the daily engineering review: mission health, agent reviews
 * with domain-specific findings, recommendations, and metrics.
 * Aggregate of all 6 agents' daily reports.
 */

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Target, Users, Shield, Brain, FileText, Activity, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';

interface AgentReview {
  agent: string;
  status: string;
  domain: string;
  findings: string[];
  recommendations: string[];
  metrics: Record<string, number>;
}

interface DailyReview {
  date: string;
  missionHealth: { active: number; completed: number; blocked: number };
  agentReviews: AgentReview[];
  qualityScore: number;
  architectureScore: number;
  risks: string[];
  topRecommendations: string[];
}

interface ReviewPanelProps {
  review?: DailyReview;
  onRefresh?: () => void;
}

const agentIcons: Record<string, any> = {
  KILOH: Target, FORGE: Shield, DTHINK: Brain, GATE: CheckCircle2, JOURNAL: FileText, BUS: Activity,
};
const agentColors: Record<string, string> = {
  KILOH: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
  FORGE: 'text-violet-400 border-violet-500/20 bg-violet-500/5',
  DTHINK: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
  GATE: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
  JOURNAL: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
  BUS: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
};

export function EngineeringReviewPanel({ review: external, onRefresh }: ReviewPanelProps) {
  const [expandedAgent, setExpandedAgent] = useState<Set<string>>(new Set(['KILOH']));

  const review = external ?? {
    date: new Date().toISOString().split('T')[0],
    missionHealth: { active: 1, completed: 11, blocked: 0 },
    agentReviews: [
      { agent: 'KILOH', status: 'healthy', domain: 'Mission Health & Strategic Planning', findings: ['Mission THINKBOX-012 active', '11 PRs delivered, 21 tests', 'Alpha readiness: 92/100'], recommendations: ['Pursue Alpha hardening', 'Address panel error boundaries'], metrics: { 'active-missions': 1, 'completed': 11 } },
      { agent: 'FORGE', status: 'healthy', domain: 'Architecture & Implementation', findings: ['14 components, 8 engine modules', 'Engineering Graph canonical', 'WorkspaceViewModel is frontend contract'], recommendations: ['Consolidate types into shareable contracts', 'Add loading skeletons'], metrics: { 'components': 14, 'engines': 8 } },
      { agent: 'GATE', status: 'healthy', domain: 'Quality & Governance', findings: ['21/21 tests pass', 'Governance PASS — 20 policies', 'TypeScript gap in CI sandbox'], recommendations: ['Add TS to CI', 'Panel error boundaries', 'Expand test coverage'], metrics: { 'tests': 21, 'policies': 20 } },
      { agent: 'DTHINK', status: 'healthy', domain: 'Knowledge & Learning', findings: ['9 snippets, 165 recalls', '6 learning patterns', 'Agent profiles tracking confidence'], recommendations: ['Expand learning patterns', 'Cross-workspace learning'], metrics: { 'snippets': 9, 'recalls': 165 } },
      { agent: 'JOURNAL', status: 'healthy', domain: 'Documentation & Memory', findings: ['5 doc deliverables', 'Daily journal auto-generated', '5 technical debt items tracked'], recommendations: ['Archive PR docs', 'Inline code docs', 'API docs from types'], metrics: { 'docs': 5, 'debt': 5 } },
      { agent: 'BUS', status: 'healthy', domain: 'Events & Communication', findings: ['25 event types, singleton SSE', '5 recent BUS events', 'Replay: 9 subsystems'], recommendations: ['Event throughput monitoring', 'Alert on dropped events'], metrics: { 'events': 25, 'replay': 9 } },
    ],
    qualityScore: 92, architectureScore: 90,
    risks: ['TypeScript unavailable in cloud sandbox', 'Panel error boundaries only at tab level'],
    topRecommendations: ['Add TypeScript to CI', 'Panel error boundaries', 'Expand test coverage', 'Archive docs', 'Event monitoring'],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-100">Daily Engineering Review</h2>
            <p className="text-[10px] text-slate-500">{review.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-emerald-400">{review.qualityScore}</div>
            <div className="text-[8px] text-slate-600">Quality</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-violet-400">{review.architectureScore}</div>
            <div className="text-[8px] text-slate-600">Arch</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded bg-emerald-500/5 border border-emerald-500/20 p-2 text-center">
          <div className="text-lg font-display font-bold text-emerald-400">{review.missionHealth.active}</div>
          <div className="text-[8px] text-slate-500">Active</div>
        </div>
        <div className="rounded bg-blue-500/5 border border-blue-500/20 p-2 text-center">
          <div className="text-lg font-display font-bold text-blue-400">{review.missionHealth.completed}</div>
          <div className="text-[8px] text-slate-500">Completed</div>
        </div>
        <div className="rounded bg-slate-500/5 border border-slate-500/20 p-2 text-center">
          <div className="text-lg font-display font-bold text-slate-400">{review.missionHealth.blocked}</div>
          <div className="text-[8px] text-slate-500">Blocked</div>
        </div>
      </div>

      <div className="space-y-1">
        {review.agentReviews.map(ar => {
          const Icon = agentIcons[ar.agent] ?? Shield;
          const colors = agentColors[ar.agent] ?? agentColors.KILOH;
          const isExpanded = expandedAgent.has(ar.agent);
          return (
            <div key={ar.agent} className={`rounded-lg border ${isExpanded ? colors.split(' ').slice(1).join(' ') : 'border-slate-800/40 bg-slate-950/40'}`}>
              <button onClick={() => {
                const next = new Set(expandedAgent);
                if (next.has(ar.agent)) next.delete(ar.agent); else next.add(ar.agent);
                setExpandedAgent(next);
              }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/20 transition-colors">
                <Icon className={`w-4 h-4 ${colors.split(' ')[0]}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-300 font-mono font-bold">{ar.agent}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${ar.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  </div>
                  <div className="text-[9px] text-slate-600">{ar.domain}</div>
                </div>
                <div className="flex gap-1">
                  {Object.entries(ar.metrics).slice(0, 2).map(([k, v]) => (
                    <span key={k} className="text-[8px] bg-slate-800/50 px-1 rounded text-slate-500 font-mono">{k}:{v}</span>
                  ))}
                </div>
                {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
              </button>
              {isExpanded && (
                <div className="px-3 pb-2 border-t border-slate-800/30 space-y-1.5">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Findings</span>
                    {ar.findings.map((f, i) => <div key={i} className="text-[10px] text-slate-400 mt-0.5">• {f}</div>)}
                  </div>
                  <div>
                    <span className="text-[9px] text-emerald-400 uppercase tracking-wider">Recommendations</span>
                    {ar.recommendations.map((r, i) => <div key={i} className="text-[10px] text-emerald-400/80 mt-0.5">• {r}</div>)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {review.risks.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3 h-3 text-rose-400" /><span className="text-[10px] text-rose-400 font-mono uppercase">Risks</span></div>
          {review.risks.map((r, i) => <div key={i} className="text-[10px] text-rose-400/80">• {r}</div>)}
        </div>
      )}
    </div>
  );
}
