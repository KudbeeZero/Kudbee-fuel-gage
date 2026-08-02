/**
 * THINKBOX PR-011 — Today's Mission Dashboard
 *
 * The home screen. Answers immediately: what am I working on, what's blocked,
 * which agent owns what, what approvals are waiting, what changed since
 * yesterday, what should I do next.
 */

import { useState } from 'react';
import { Target, AlertTriangle, CheckCircle2, Clock, Users, Shield, ChevronRight, ArrowRight, Zap, RefreshCw } from 'lucide-react';

interface TodayData {
  activeMission: { id: string; title: string; objective: string; status: string; progress: number; assignedAgents: string[]; nextTask: string | null } | null;
  blockers: Array<{ id: string; description: string; severity: string; agent: string }>;
  pendingApprovals: Array<{ id: string; command: string; level: string; requestedAt: string }>;
  changesSinceYesterday: string[];
  whatsNext: string[];
}

interface TodaysMissionProps {
  data?: TodayData;
  onRefresh?: () => void;
}

export function TodaysMission({ data, onRefresh }: TodaysMissionProps) {
  const m = data ?? {
    activeMission: { id: 'THINKBOX-011', title: 'Alpha Operations & Dogfooding', objective: 'Make THINKBOX capable of building itself', status: 'active', progress: 42, assignedAgents: ['KILOH', 'FORGE', 'GATE', 'DTHINK', 'JOURNAL', 'BUS'], nextTask: 'Build Mission Inbox' },
    blockers: [{ id: 'b1', description: 'TypeScript check unavailable in cloud sandbox', severity: 'low', agent: 'GATE' }],
    pendingApprovals: [{ id: 'a1', command: 'Install web app dependencies', level: 'user', requestedAt: new Date().toISOString() }],
    changesSinceYesterday: ['PR-010 merged: integration, replay, diagnostics', 'THINKBOX-011 declared'],
    whatsNext: ['Complete Today\'s Mission dashboard', 'Populate Mission Inbox', 'Enable Session Continuity'],
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
            <Target className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-100">Today's Mission</h1>
            <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
        {onRefresh && <button onClick={onRefresh} className="p-2 rounded-lg border border-slate-700/30 text-slate-500 hover:text-slate-300"><RefreshCw className="w-3.5 h-3.5" /></button>}
      </div>

      {m.activeMission ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[9px] text-slate-500 font-mono">{m.activeMission.id}</span>
              <h2 className="font-display text-lg font-bold text-slate-200">{m.activeMission.title}</h2>
              <p className="text-xs text-slate-500 mt-1">{m.activeMission.objective}</p>
            </div>
            <span className="text-[9px] px-2 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 font-mono uppercase">{m.activeMission.status}</span>
          </div>

          <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden mb-3">
            <div className="h-full rounded-full bg-amber-500/60 transition-all" style={{ width: `${m.activeMission.progress}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-[10px]">
            <div className="flex items-center gap-2">
              <Users className="w-3 h-3 text-slate-500" />
              <span className="text-slate-500">Agents:</span>
              <span className="text-slate-300 font-mono">{m.activeMission.assignedAgents.join(', ')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-slate-500">Next:</span>
              <span className="text-slate-300">{m.activeMission.nextTask}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-8 text-center">
          <Target className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <h2 className="text-sm font-display text-slate-400 mb-2">No Active Mission</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">Open the Mission Inbox to find your next task, or plan a new mission from the Mission Planner.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /><h3 className="font-display text-sm font-semibold text-slate-200">Blockers</h3></div>
          {m.blockers.length === 0 ? (
            <p className="text-[10px] text-slate-600">No blockers — keep moving.</p>
          ) : (
            m.blockers.map(b => (
              <div key={b.id} className="flex items-center gap-2 text-[10px] py-1">
                <span className={`w-1.5 h-1.5 rounded-full ${b.severity === 'high' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                <span className="text-slate-300 flex-1">{b.description}</span>
                <span className="text-slate-600 font-mono">{b.agent}</span>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-2"><Shield className="w-3.5 h-3.5 text-violet-400" /><h3 className="font-display text-sm font-semibold text-slate-200">Approvals</h3></div>
          {m.pendingApprovals.length === 0 ? (
            <p className="text-[10px] text-slate-600">No pending approvals.</p>
          ) : (
            m.pendingApprovals.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-[10px] py-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-slate-300 flex-1 truncate">{a.command}</span>
                <span className="text-slate-600 font-mono">{a.level}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-2"><Clock className="w-3.5 h-3.5 text-slate-500" /><h3 className="font-display text-sm font-semibold text-slate-200">Since Yesterday</h3></div>
          {m.changesSinceYesterday.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] py-1">
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-slate-400">{c}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /><h3 className="font-display text-sm font-semibold text-slate-200">What's Next</h3></div>
          {m.whatsNext.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] py-1">
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[9px]">{i + 1}</span>
              <span className="text-slate-300">{w}</span>
              <ChevronRight className="w-3 h-3 text-slate-600 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
