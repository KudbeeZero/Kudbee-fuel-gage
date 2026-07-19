import React, { memo, useState } from 'react';
import { Sliders, ChevronDown, ChevronUp } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getFormattedCost } from '../../utils/currency';

interface ProviderComparison {
  id: string;
  name: string;
  platform: string;
  cost: number;
}

interface CostAnalysisPanelProps {
  currency: 'USD' | 'EUR' | 'GBP';
  comparisons: ProviderComparison[];
  optimalProvider: ProviderComparison;
  expensiveProvider: ProviderComparison;
  weights: { Anthropic: number; DeepSeek: number; Google: number; OpenAI: number };
  setWeights: React.Dispatch<React.SetStateAction<{ Anthropic: number; DeepSeek: number; Google: number; OpenAI: number }>>;
  relWeights: { Anthropic: number; DeepSeek: number; Google: number; OpenAI: number };
  applyPreset: (preset: 'cost' | 'reasoning' | 'balanced') => void;
  pieData: { name: string; value: number; color: string }[];
  compositeCostIn: number;
  compositeCostOut: number;
  compositeSpeed: number;
  compositeQuality: number;
  className?: string;
}

export const CostAnalysisPanel = memo(function CostAnalysisPanel({
  currency,
  comparisons,
  optimalProvider,
  expensiveProvider,
  weights,
  setWeights,
  relWeights,
  applyPreset,
  pieData,
  compositeCostIn,
  compositeCostOut,
  compositeSpeed,
  compositeQuality,
  className = ''
}: CostAnalysisPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={`lg:col-span-5 flex flex-col gap-4 ${className}`}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-slate-200 hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h3 className="font-display font-semibold text-sm tracking-wide uppercase">Cost Analysis & Balancing</h3>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isExpanded && (
        <>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex-1 flex flex-col justify-between" id="playground-matrix">
            <div>
              <h3 className="font-display font-semibold text-slate-200 text-sm tracking-wide uppercase mb-4">Cross-Provider Analysis</h3>
              
              <div className="space-y-3">
                {comparisons.map((c) => {
                  const isOptimal = c.id === optimalProvider.id;
                  const isExpensive = c.id === expensiveProvider.id;
                  return (
                    <div key={c.id} className={`p-3 rounded-lg border transition-all ${
                      isOptimal 
                        ? 'bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_8px_rgba(52,211,153,0.05)]' 
                        : isExpensive 
                        ? 'bg-amber-950/10 border-amber-500/15'
                        : 'bg-slate-950/80 border-slate-800/60'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-200">{c.platform}</span>
                        {isOptimal && (
                          <span className="text-[8px] font-mono font-bold uppercase tracking-wider bg-emerald-500 text-slate-950 px-1.5 py-0.5 rounded shadow-[0_0_6px_rgba(52,211,153,0.4)]">OPTIMAL VALUE</span>
                        )}
                        {isExpensive && (
                          <span className="text-[8px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">HIGH COST</span>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] font-mono text-slate-500">{c.name}</span>
                        <span className="font-mono text-sm text-slate-100 font-bold">{getFormattedCost(c.cost, currency, 6)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800/60 flex justify-between text-xs font-mono text-slate-500">
              <span>Assumed Output ratio:</span>
              <span className="text-slate-300">~35% of Input</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden mt-2" id="playground-gateway-balancer">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-400" />
                <div>
                  <h2 className="font-display font-semibold text-slate-200 text-md">AI Gateway Multi-Model Router</h2>
                  <p className="text-xs text-slate-500 mt-1">Configure weights to dynamically proxy requests between active providers.</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={() => applyPreset('cost')}
                  className="px-2.5 py-1 rounded text-[10px] font-mono border border-emerald-900/40 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/30 transition-all cursor-pointer"
                >
                  PRESET: COST OPTIMAL
                </button>
                <button 
                  onClick={() => applyPreset('reasoning')}
                  className="px-2.5 py-1 rounded text-[10px] font-mono border border-purple-900/40 bg-purple-950/20 text-purple-400 hover:bg-purple-900/30 transition-all cursor-pointer"
                >
                  PRESET: MAX INTELLIGENCE
                </button>
                <button 
                  onClick={() => applyPreset('balanced')}
                  className="px-2.5 py-1 rounded text-[10px] font-mono border border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 transition-all cursor-pointer"
                >
                  PRESET: BALANCED
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Sliders Area */}
              <div className="lg:col-span-7 space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-orange-400 font-semibold">Claude 3.5 Sonnet (Anthropic)</span>
                    <span className="text-slate-300">{Math.round(relWeights.Anthropic)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={weights.Anthropic} 
                    onChange={(e) => setWeights(w => ({ ...w, Anthropic: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-orange-500 cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-blue-400 font-semibold">DeepSeek-R1 (DeepSeek)</span>
                    <span className="text-slate-300">{Math.round(relWeights.DeepSeek)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={weights.DeepSeek} 
                    onChange={(e) => setWeights(w => ({ ...w, DeepSeek: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-purple-400 font-semibold">Gemini 1.5 Pro (Google)</span>
                    <span className="text-slate-300">{Math.round(relWeights.Google)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={weights.Google} 
                    onChange={(e) => setWeights(w => ({ ...w, Google: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-purple-500 cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-pink-400 font-semibold">GPT-4o (OpenAI)</span>
                    <span className="text-slate-300">{Math.round(relWeights.OpenAI)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={weights.OpenAI} 
                    onChange={(e) => setWeights(w => ({ ...w, OpenAI: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-pink-500 cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none"
                  />
                </div>
              </div>

              {/* Composite Metrics & Visual Chart */}
              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                
                {/* Pie Chart Representation */}
                <div className="h-32 flex justify-center items-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={45}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">ROUTING</span>
                    <span className="font-mono text-xs text-slate-300 font-semibold">HYBRID</span>
                  </div>
                </div>

                {/* Aggregated Scores */}
                <div className="space-y-3 font-mono">
                  <div>
                    <span className="block text-[9px] text-slate-500 uppercase">Weighted Cost / 1M</span>
                    <span className="text-sm text-emerald-400 font-semibold">
                      {getFormattedCost(compositeCostIn, currency, 2)} <span className="text-slate-600">|</span> {getFormattedCost(compositeCostOut, currency, 2)}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[9px] text-slate-500 uppercase">Composite Velocity</span>
                    <span className="text-sm text-slate-300 font-semibold">{Math.round(compositeSpeed)} t/s</span>
                  </div>

                  <div>
                    <span className="block text-[9px] text-slate-500 uppercase">Composite Accuracy</span>
                    <span className="text-sm text-purple-400 font-semibold">{(compositeQuality).toFixed(2)}/10.0</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
});
