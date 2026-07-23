import { useState, useEffect, useRef } from 'react';
import { Sliders, RefreshCw, Check, AlertTriangle, Zap, BarChart3 } from 'lucide-react';
import { PanelErrorBoundary } from '../PanelErrorBoundary';

interface AutoTuneProps {
  onApplied?: () => void;
}

interface TuneAnalysis {
  totalTraces: number;
  blocks: number;
  warns: number;
  blockRate: number;
  warnRate: number;
}

interface TuneRecommendations {
  token_budget_cap: { currentThreshold: number; recommendedThreshold: number; confidence: number; rationale: string };
  secret_leak_prevention: { currentEnabled: boolean; recommendedEnabled: boolean; confidence: number; rationale: string };
  pii_redaction: { currentSeverity: string; recommendedSeverity: string; confidence: number; rationale: string };
}

type TuneStage = 'idle' | 'analyzing' | 'tuning' | 'applying';

const STAGES: { key: TuneStage; label: string }[] = [
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'tuning', label: 'Tuning' },
  { key: 'applying', label: 'Applying' }
];

function AutoTuneButtonInner({ onApplied }: AutoTuneProps) {
  const [stage, setStage] = useState<TuneStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TuneAnalysis | null>(null);
  const [recommendations, setRecommendations] = useState<TuneRecommendations | null>(null);
  const [applied, setApplied] = useState(false);
  const _mountedRef = useRef(true);

  useEffect(() => {
    _mountedRef.current = true;
    return () => { _mountedRef.current = false; };
  }, []);

  const runAnalysis = async () => {
    setStage('analyzing');
    setError(null);
    setApplied(false);
    try {
      const res = await fetch('/api/governance/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackHours: 24 })
      });
      if (!_mountedRef.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Tune analysis failed (${res.status})`);
      }
      const data = await res.json();
      if (!_mountedRef.current) return;
      setAnalysis(data.analysis);
      setStage('tuning');
      setTimeout(() => {
        if (_mountedRef.current && stage === 'tuning') {
          setRecommendations(data.recommendations);
          setStage('idle');
        }
      }, 800);
    } catch (e) {
      if (!_mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Tune analysis failed');
      setStage('idle');
    }
  };

  const applyRecommendations = async () => {
    if (!recommendations) return;
    setStage('applying');
    setError(null);
    try {
      const res = await fetch('/api/governance/tune/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendations })
      });
      if (!_mountedRef.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Apply failed (${res.status})`);
      }
      if (!_mountedRef.current) return;
      setApplied(true);
      setStage('idle');
      onApplied?.();
    } catch (e) {
      if (!_mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Apply failed');
      setStage('idle');
    }
  };

  const activeStageIdx = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-3">
      {/* Progress Stages Indicator */}
      {stage !== 'idle' && (
        <div className="flex items-center gap-1.5">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <span
                className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
                  i === activeStageIdx
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 scale-105'
                    : i < activeStageIdx
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                      : 'border-slate-700 bg-slate-800/40 text-slate-500'
                }`}
              >
                {i < activeStageIdx ? (
                  <Check className="h-2.5 w-2.5" />
                ) : i === activeStageIdx ? (
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <BarChart3 className="h-2.5 w-2.5" />
                )}
                {s.label}
              </span>
              {i < STAGES.length - 1 && (
                <span className={`font-mono text-[8px] ${i < activeStageIdx ? 'text-emerald-500' : 'text-slate-600'}`}>→</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          id="firewall-autotune-btn"
          type="button"
          onClick={runAnalysis}
          disabled={stage === 'analyzing' || stage === 'applying'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-300 transition-all hover:bg-amber-500/20 disabled:opacity-40"
        >
          {stage === 'analyzing' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
          Auto-Tune Thresholds
        </button>
        {analysis && (
          <button
            id="firewall-autotune-apply-btn"
            type="button"
            onClick={applyRecommendations}
            disabled={stage === 'applying' || applied}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {applied ? <Check className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            {applied ? 'Applied' : stage === 'applying' ? 'Applying…' : 'Apply Recommendations'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-mono text-amber-300">{error}</span>
        </div>
      )}

      {analysis && recommendations && (
        <div className="space-y-2 text-[10px] font-mono">
          <div className="p-2 rounded border border-slate-800 bg-slate-950/50">
            <div className="text-slate-500 uppercase tracking-wider mb-1">Analysis (24h)</div>
            <div className="grid grid-cols-2 gap-1 text-slate-300">
              <span>Total traces:</span><span className="text-right">{analysis.totalTraces}</span>
              <span>Blocks:</span><span className="text-right text-rose-400">{analysis.blocks}</span>
              <span>Warns:</span><span className="text-right text-amber-400">{analysis.warns}</span>
              <span>Block rate:</span><span className="text-right">{analysis.blockRate}%</span>
            </div>
          </div>
          <div className="p-2 rounded border border-slate-800 bg-slate-950/50">
            <div className="text-slate-500 uppercase tracking-wider mb-1">Token Budget Cap</div>
            <div className="flex items-center justify-between text-slate-300">
              <span>{recommendations.token_budget_cap.currentThreshold.toLocaleString()}</span>
              <span>→</span>
              <span className="text-emerald-400">{recommendations.token_budget_cap.recommendedThreshold.toLocaleString()}</span>
            </div>
            <div className="text-[9px] text-slate-600 mt-1">Confidence: {recommendations.token_budget_cap.confidence.toFixed(0)}%</div>
          </div>
          <div className="p-2 rounded border border-slate-800 bg-slate-950/50">
            <div className="text-slate-500 uppercase tracking-wider mb-1">PII Redaction</div>
            <div className="flex items-center justify-between text-slate-300">
              <span>{recommendations.pii_redaction.currentSeverity}</span>
              <span>→</span>
              <span className="text-emerald-400">{recommendations.pii_redaction.recommendedSeverity}</span>
            </div>
            <div className="text-[9px] text-slate-600 mt-1">Confidence: {recommendations.pii_redaction.confidence.toFixed(0)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AutoTuneButton(props: AutoTuneProps) {
  return (
    <PanelErrorBoundary panel="AutoTune">
      <AutoTuneButtonInner {...props} />
    </PanelErrorBoundary>
  );
}
