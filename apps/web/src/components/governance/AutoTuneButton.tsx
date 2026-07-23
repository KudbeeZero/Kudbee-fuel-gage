import { useState } from 'react';
import { Sliders, RefreshCw, Check, AlertTriangle, Zap } from 'lucide-react';
import { apiPost } from '../../lib/apiClient';

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

export function AutoTuneButton({ onApplied }: AutoTuneProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TuneAnalysis | null>(null);
  const [recommendations, setRecommendations] = useState<TuneRecommendations | null>(null);
  const [applied, setApplied] = useState(false);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    setApplied(false);
    try {
      const data = await apiPost('/api/governance/tune', { lookbackHours: 24 });
      setAnalysis(data.analysis);
      setRecommendations(data.recommendations);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tune analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const applyRecommendations = async () => {
    if (!recommendations) return;
    setApplying(true);
    setError(null);
    try {
      await apiPost('/api/governance/tune/apply', { recommendations });
      setApplied(true);
      onApplied?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          id="firewall-autotune-btn"
          type="button"
          onClick={runAnalysis}
          disabled={analyzing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-300 transition-all hover:bg-amber-500/20 disabled:opacity-40"
        >
          {analyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
          Auto-Tune Thresholds
        </button>
        {analysis && (
          <button
            id="firewall-autotune-apply-btn"
            type="button"
            onClick={applyRecommendations}
            disabled={applying || applied}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {applied ? <Check className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            {applied ? 'Applied' : applying ? 'Applying…' : 'Apply Recommendations'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-mono text-amber-300">{error}</span>
        </div>
      )}

      {analyzing && !analysis && (
        <div className="p-2 rounded border border-slate-800 bg-slate-950/50">
          <span className="text-[10px] font-mono text-slate-500 animate-pulse">
            Analyzing governance patterns...
          </span>
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
