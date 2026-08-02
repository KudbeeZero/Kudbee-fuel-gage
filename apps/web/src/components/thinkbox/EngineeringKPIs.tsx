/**
 * OPS-013 — Engineering KPIs Dashboard
 */

import { Activity, TrendingUp, CheckCircle2 } from 'lucide-react';

interface KpiData {
  meanMissionDurationMs: number; prCycleTimeHrs: number; ciPassRate: number;
  testStability: number; typeScriptHealth: number; replaySuccess: number;
  recoverySuccess: number; learningAdoption: number; reviewCompletion: number;
  missionCompletion: number;
}

interface ScorecardData { date: string; total: number; grade: string; trend: number[]; architecture: number; quality: number; reliability: number; observability: number; learning: number; governance: number; performance: number; costEfficiency: number; developerExperience: number }

export function EngineeringKPIs({ kpi: external, scorecard: scExternal }: { kpi?: KpiData; scorecard?: ScorecardData; ready?: any }) {
  const kpi = external ?? { meanMissionDurationMs: 3600000, prCycleTimeHrs: 4, ciPassRate: 100, testStability: 100, typeScriptHealth: 85, replaySuccess: 100, recoverySuccess: 90, learningAdoption: 80, reviewCompletion: 100, missionCompletion: 92 };
  const sc = scExternal ?? { date: '', total: 88, grade: 'B', trend: [84, 85, 86, 87, 88], architecture: 90, quality: 95, reliability: 95, observability: 85, learning: 80, governance: 100, performance: 90, costEfficiency: 85, developerExperience: 96 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10"><Activity className="w-3.5 h-3.5 text-blue-400" /></div>
          <div><h3 className="font-display text-sm font-semibold text-slate-200">Engineering KPIs</h3><p className="text-[10px] text-slate-500">Score: {sc.total}/100 · {sc.grade}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[{ l: 'CI Pass', v: `${kpi.ciPassRate}%`, c: 'emerald' }, { l: 'Tests', v: `${kpi.testStability}%`, c: 'emerald' }, { l: 'TS Health', v: `${kpi.typeScriptHealth}%`, c: 'blue' },
          { l: 'Replay', v: `${kpi.replaySuccess}%`, c: 'cyan' }, { l: 'Recovery', v: `${kpi.recoverySuccess}%`, c: 'amber' }, { l: 'Learning', v: `${kpi.learningAdoption}%`, c: 'violet' },
          { l: 'Reviews', v: `${kpi.reviewCompletion}%`, c: 'indigo' }, { l: 'Missions', v: `${kpi.missionCompletion}%`, c: 'rose' }, { l: 'PR Cycle', v: `${kpi.prCycleTimeHrs}h`, c: 'slate' }].map(s => (
          <div key={s.l} className="rounded border border-slate-800/40 bg-slate-950/40 p-2 text-center">
            <div className="text-[8px] text-slate-500">{s.l}</div>
            <div className={`text-sm font-display font-bold text-${s.c}-400`}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
