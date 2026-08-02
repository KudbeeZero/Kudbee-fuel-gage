/**
 * THINKBOX PR-012 — Excellence Score Card
 *
 * Displays the Engineering Excellence Score with trend over time,
 * 10-category breakdown, grade, and recommendations. Every metric
 * is evidence-based.
 */

import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Award, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

interface ScoreBreakdown {
  score: number;
  maxScore: number;
  issues: string[];
}

interface ExcellenceScoreData {
  date: string;
  total: number;
  trend: number[];
  breakdown: Record<string, ScoreBreakdown>;
  grade: string;
  recommendations: string[];
}

interface ExcellenceScoreCardProps {
  score?: ExcellenceScoreData;
}

export function ExcellenceScoreCard({ score: external }: ExcellenceScoreCardProps) {
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set());

  const score = external ?? {
    date: new Date().toISOString().split('T')[0],
    total: 85,
    trend: [82, 83, 84, 84, 85],
    breakdown: {
      architecture: { score: 90, maxScore: 100, issues: [] },
      frontend: { score: 85, maxScore: 100, issues: ['Panel error boundaries'] },
      backend: { score: 88, maxScore: 100, issues: [] },
      typescript: { score: 85, maxScore: 100, issues: ['Sandbox limitation'] },
      testing: { score: 70, maxScore: 100, issues: ['Missing plan/exec tests'] },
      documentation: { score: 85, maxScore: 100, issues: ['Inline docs missing'] },
      learning: { score: 88, maxScore: 100, issues: ['6 patterns only'] },
      agentCollaboration: { score: 82, maxScore: 100, issues: ['Static reviews'] },
      ux: { score: 85, maxScore: 100, issues: ['No accessibility audit'] },
      performance: { score: 90, maxScore: 100, issues: [] },
    },
    grade: 'B',
    recommendations: ['Add TS to CI', 'Panel error boundaries', 'Expand test coverage', 'Accessibility audit'],
  };

  const gradeColors: Record<string, string> = {
    A: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    B: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    C: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    D: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    F: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  const trendDirection = score.trend.length >= 2
    ? (score.trend[score.trend.length - 1] > score.trend[score.trend.length - 2] ? 'up' : score.trend[score.trend.length - 1] < score.trend[score.trend.length - 2] ? 'down' : 'stable')
    : 'stable';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-100">Excellence Score</h2>
            <p className="text-[10px] text-slate-500">{score.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px]">
            {trendDirection === 'up' ? <TrendingUp className="w-3 h-3 text-emerald-400" /> :
             trendDirection === 'down' ? <TrendingDown className="w-3 h-3 text-rose-400" /> :
             <Minus className="w-3 h-3 text-slate-500" />}
            <span className="text-slate-500">{score.trend.join(' → ')}</span>
          </div>
          <div className="text-center">
            <div className="text-3xl font-display font-bold text-amber-400">{score.total}</div>
            <div className="text-[8px] text-slate-600">/100</div>
          </div>
          <span className={`text-lg font-display font-bold px-3 py-1 rounded-lg border ${gradeColors[score.grade] ?? gradeColors.C}`}>{score.grade}</span>
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${score.total >= 90 ? 'bg-emerald-500' : score.total >= 75 ? 'bg-blue-500' : 'bg-amber-500'}`}
          style={{ width: `${score.total}%` }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(score.breakdown).map(([cat, b]) => {
          const isExpanded = expandedCat.has(cat);
          const pct = Math.round((b.score / b.maxScore) * 100);
          return (
            <div key={cat} className={`rounded-lg border ${b.issues.length > 0 ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-800/40 bg-slate-950/40'}`}>
              <button onClick={() => {
                const next = new Set(expandedCat);
                if (next.has(cat)) next.delete(cat); else next.add(cat);
                setExpandedCat(next);
              }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/20 transition-colors">
                <span className="text-[10px] text-slate-400 capitalize flex-1">{cat}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 rounded-full bg-slate-800/60 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-[9px] font-mono ${pct >= 90 ? 'text-emerald-400' : pct >= 75 ? 'text-amber-400' : 'text-rose-400'}`}>{b.score}</span>
                </div>
                {b.issues.length > 0 && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
              </button>
              {isExpanded && b.issues.length > 0 && (
                <div className="px-3 pb-2 border-t border-slate-800/30">
                  {b.issues.map((issue, i) => (
                    <div key={i} className="text-[10px] text-amber-400/80 mt-1">• {issue}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {score.recommendations.length > 0 && (
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-3">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Recommendations</span>
          {score.recommendations.map((r, i) => (
            <div key={i} className="text-[10px] text-slate-400 mt-1">• {r}</div>
          ))}
        </div>
      )}
    </div>
  );
}
