import React, { useState, useMemo, useCallback } from 'react';
import { Calculator, Activity, Zap, AlertTriangle, CheckCircle2, Sliders, Terminal, ChevronRight } from 'lucide-react';
import { MultiModelSelector } from './MultiModelSelector';
import { TokenEstimator } from './TokenEstimator';
import { CostAnalysisPanel } from './CostAnalysisPanel';
import { useTelemetryLogger } from '../../hooks/useTelemetryLogger';
import { useStreamEngine } from '../../hooks/useStreamEngine';
import { getFormattedCost } from '../../utils/currency';

interface PlaygroundViewProps {
  currency: 'USD' | 'EUR' | 'GBP';
  onNewLogTriggered?: () => void;
}

export function PlaygroundView({ currency, onNewLogTriggered }: PlaygroundViewProps) {
  const [payloadText, setPayloadText] = useState(
    `// Sample prompt / code block pipeline telemetry simulation\nconst aiResponse = await anthropic.messages.create({\n  model: "claude-3-5-sonnet",\n  max_tokens: 1024,\n  messages: [{ role: "user", content: "Implement a highly parallel telemetry parser." }]\n});`
  );
  const [selectedModel, setSelectedModel] = useState('Claude 3.5 Sonnet');
  const [singleCap, setSingleCap] = useState(0.05); // Slider cap (ranges from $0.01 to $2.00 in USD baseline)
  const [hourlyCapEnabled, setHourlyCapEnabled] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalculation, setLastCalculation] = useState<string | null>(null);

  // Load balancing gateway state
  const [weights, setWeights] = useState({
    Anthropic: 40,
    DeepSeek: 30,
    Google: 20,
    OpenAI: 10
  });

  const { isLogged, isLogging, handleInjectTrace } = useTelemetryLogger(onNewLogTriggered);
  const { isStreaming, streamOutput, startStream, cancelStream } = useStreamEngine();

  const totalWeight = weights.Anthropic + weights.DeepSeek + weights.Google + weights.OpenAI;
  const relWeights = useMemo(() => ({
    Anthropic: totalWeight > 0 ? (weights.Anthropic / totalWeight) * 100 : 25,
    DeepSeek: totalWeight > 0 ? (weights.DeepSeek / totalWeight) * 100 : 25,
    Google: totalWeight > 0 ? (weights.Google / totalWeight) * 100 : 25,
    OpenAI: totalWeight > 0 ? (weights.OpenAI / totalWeight) * 100 : 25
  }), [weights, totalWeight]);

  const modelSpecs = useMemo(() => ({
    Anthropic: { costIn: 3.00, costOut: 15.00, speed: 75, quality: 9.8, color: '#f97316' },
    DeepSeek: { costIn: 0.55, costOut: 2.19, speed: 120, quality: 9.5, color: '#3b82f6' },
    Google: { costIn: 1.25, costOut: 5.00, speed: 100, quality: 8.8, color: '#a855f7' },
    OpenAI: { costIn: 5.00, costOut: 15.00, speed: 80, quality: 9.2, color: '#ec4899' },
    Ternary: { costIn: 0.80, costOut: 3.00, speed: 110, quality: 9.0, color: '#10b981' }
  }), []);

  const compositeCostIn = (
    (relWeights.Anthropic * modelSpecs.Anthropic.costIn) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.costIn) +
    (relWeights.Google * modelSpecs.Google.costIn) +
    (relWeights.OpenAI * modelSpecs.OpenAI.costIn)
  ) / 100;

  const compositeCostOut = (
    (relWeights.Anthropic * modelSpecs.Anthropic.costOut) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.costOut) +
    (relWeights.Google * modelSpecs.Google.costOut) +
    (relWeights.OpenAI * modelSpecs.OpenAI.costOut)
  ) / 100;

  const compositeSpeed = (
    (relWeights.Anthropic * modelSpecs.Anthropic.speed) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.speed) +
    (relWeights.Google * modelSpecs.Google.speed) +
    (relWeights.OpenAI * modelSpecs.OpenAI.speed)
  ) / 100;

  const compositeQuality = (
    (relWeights.Anthropic * modelSpecs.Anthropic.quality) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.quality) +
    (relWeights.Google * modelSpecs.Google.quality) +
    (relWeights.OpenAI * modelSpecs.OpenAI.quality)
  ) / 100;

  const pieData = useMemo(() => [
    { name: 'Claude 3.5 Sonnet', value: Math.round(relWeights.Anthropic), color: '#f97316' },
    { name: 'DeepSeek-R1', value: Math.round(relWeights.DeepSeek), color: '#3b82f6' },
    { name: 'Gemini 1.5 Pro', value: Math.round(relWeights.Google), color: '#a855f7' },
    { name: 'GPT-4o', value: Math.round(relWeights.OpenAI), color: '#ec4899' }
  ].filter(d => d.value > 0), [relWeights]);

  const applyPreset = useCallback((preset: 'cost' | 'reasoning' | 'balanced') => {
    if (preset === 'cost') {
      setWeights({ Anthropic: 10, DeepSeek: 80, Google: 10, OpenAI: 0 });
    } else if (preset === 'reasoning') {
      setWeights({ Anthropic: 60, DeepSeek: 5, Google: 10, OpenAI: 25 });
    } else {
      setWeights({ Anthropic: 30, DeepSeek: 40, Google: 20, OpenAI: 10 });
    }
  }, []);

  // Token arithmetic: baseline metric of roughly 1 token per 4 characters
  const charCount = payloadText.length;
  const tokenCount = Math.ceil(charCount / 4);

  // Output token prediction: assume roughly 35% of input token count is returned
  const predictedOutputTokens = Math.ceil(tokenCount * 0.35);

  // Real market rates (Cost per 1M tokens in USD)
  const rates = useMemo(() => ({
    'Anthropic': { in: 3.00, out: 15.00, name: 'Claude 3.5 Sonnet', platform: 'Anthropic API' },
    'DeepSeek': { in: 0.55, out: 2.19, name: 'DeepSeek-R1', platform: 'DeepSeek Cloud' },
    'Google': { in: 1.25, out: 5.00, name: 'Gemini 1.5 Pro', platform: 'Google AI Studio' },
    'OpenAI': { in: 5.00, out: 15.00, name: 'GPT-4o', platform: 'OpenAI Developer Platform' },
    'Ternary': { in: 0.80, out: 3.00, name: 'Ternary Bonsai 27B', platform: 'Ternary Network' }
  }), []);

  const calculateCost = useCallback((prov: keyof typeof rates) => {
    const rate = rates[prov];
    return ((tokenCount / 1000000) * rate.in) + ((predictedOutputTokens / 1000000) * rate.out);
  }, [rates, tokenCount, predictedOutputTokens]);

  // Prepare full data list
  const comparisons = useMemo(() => (Object.keys(rates) as Array<keyof typeof rates>).map(k => {
    return {
      id: k,
      name: rates[k].name,
      platform: rates[k].platform,
      cost: calculateCost(k)
    };
  }), [rates, calculateCost]);

  // Find optimal (lowest) and most expensive
  let optimalProvider = comparisons[0];
  let expensiveProvider = comparisons[0];

  comparisons.forEach(c => {
    if (c.cost < optimalProvider.cost) optimalProvider = c;
    if (c.cost > expensiveProvider.cost) expensiveProvider = c;
  });

  // Calculate selected model projected cost
  const selectedModelId = comparisons.find(c => c.name === selectedModel)?.id as keyof typeof rates || 'Anthropic';
  const selectedCost = calculateCost(selectedModelId);

  // Safety cap violation logic (compare in USD baseline)
  const isViolated = selectedCost > singleCap;

  const handleTriggerCalculation = () => {
    setIsCalculating(true);
    setTimeout(() => {
      setIsCalculating(false);
      setLastCalculation(new Date().toLocaleTimeString());
    }, 600);
  };

  return (
    <div className="space-y-6" id="playground-view-container">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT COLUMN: INTERACTIVE CALCULATOR */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col justify-between relative overflow-hidden" id="playground-calculator">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
          
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-emerald-400" />
              <h2 className="font-display font-semibold text-slate-200 text-lg">Telemetry Cost Calculator</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Code / Prompt Payload Context</label>
                <textarea
                  id="playground-payload"
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 focus:outline-none focus:border-emerald-500/40 resize-y transition-colors animate-none"
                  placeholder="Paste raw traces or prompts here..."
                />
              </div>

              {/* Character & Token Metrics */}
              <TokenEstimator charCount={charCount} tokenCount={tokenCount} />

              {/* Model selection dropdown */}
              <MultiModelSelector selectedModel={selectedModel} setSelectedModel={setSelectedModel} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="flex items-end">
                  <button
                    id="calculate-projection-btn"
                    onClick={handleTriggerCalculation}
                    className="w-full bg-slate-950 hover:bg-slate-900 text-emerald-400 font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg border border-emerald-950 transition-colors flex items-center justify-center gap-2 cursor-pointer h-10"
                  >
                    <Activity className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
                    {isCalculating ? 'PARSING...' : 'Calculate Projection'}
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => handleInjectTrace(selectedModel, tokenCount, predictedOutputTokens)}
                    disabled={isLogging}
                    className={`w-full font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer h-10 shadow-[0_0_12px_rgba(52,211,153,0.15)] ${
                      isLogged 
                        ? 'bg-emerald-500 text-slate-950' 
                        : 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-400'
                    }`}
                  >
                    <Zap className={`w-4 h-4 ${isLogging ? 'animate-bounce' : ''}`} />
                    {isLogging ? 'LOGGING...' : isLogged ? '✓ LOGGED TO DB' : 'Direct-Inject to DB'}
                  </button>
                </div>
                
                <div className="flex items-end">
                  {isStreaming ? (
                    <button
                      onClick={cancelStream}
                      className="w-full font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer h-10 bg-red-950/40 text-red-400 border border-red-500/30 hover:bg-red-900/60"
                    >
                      CANCEL STREAM
                    </button>
                  ) : (
                    <button
                      onClick={() => startStream(payloadText, selectedModel)}
                      className="w-full font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer h-10 bg-blue-950/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500 hover:text-slate-950 hover:border-blue-400"
                    >
                      SIMULATE STREAM
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            </div>

          {lastCalculation && (
            <div className="mt-4 pt-3 border-t border-slate-800/40 text-[10px] font-mono text-slate-500 text-right">
              LAST CALCULATION SYNCED AT: {lastCalculation}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: RESPONSE TERMINAL */}
        <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col relative overflow-hidden" id="playground-response-terminal">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 bg-slate-900/40">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="font-display text-sm font-semibold text-slate-200">Response Terminal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-amber-400 animate-pulse' : 'bg-slate-700'}`} />
              <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
                {isStreaming ? 'STREAMING' : 'IDLE'}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {streamOutput ? (
              <div className="text-slate-300 whitespace-pre-wrap">
                <span className="text-emerald-400 font-bold block mb-2">$ kx run --model "{selectedModel}"</span>
                <span className="text-blue-400 font-bold block mb-2">[{selectedModel}]</span>
                {streamOutput}
                {isStreaming && <span className="inline-block w-1.5 h-3.5 bg-emerald-400 animate-pulse ml-1 align-middle" />}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-600">
                <Terminal className="w-10 h-10 opacity-30" />
                <div className="text-center">
                  <p className="text-slate-500 font-mono text-xs">Awaiting execution sequence...</p>
                  <p className="text-slate-700 font-mono text-[10px] mt-1.5">
                    Run <span className="text-emerald-500/70">SIMULATE STREAM</span> or <span className="text-emerald-500/70">DIRECT-INJECT</span> to populate the channel.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-700">
                  <ChevronRight className="w-3 h-3" />
                  kudbee://playground/standby
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-900/20 flex items-center justify-between text-[10px] font-mono text-slate-600">
            <span>MODEL: <span className="text-slate-400">{selectedModel}</span></span>
            <span>{streamOutput ? `${streamOutput.length} chars` : '0 chars'}</span>
          </div>
        </div>

        <CostAnalysisPanel
          currency={currency}
          comparisons={comparisons}
          optimalProvider={optimalProvider}
          expensiveProvider={expensiveProvider}
          weights={weights}
          setWeights={setWeights}
          relWeights={relWeights}
          applyPreset={applyPreset}
          pieData={pieData}
          compositeCostIn={compositeCostIn}
          compositeCostOut={compositeCostOut}
          compositeSpeed={compositeSpeed}
          compositeQuality={compositeQuality}
          className="lg:col-span-12"
        />

      </div>

      {/* 4. DYNAMIC THRESHOLD ALERTS LAYER */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="playground-thresholds">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-6">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h2 className="font-display font-semibold text-slate-200 text-md">Telemetry Threshold Rules</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400">
              <span className="uppercase tracking-wider">Single Request Hard-Cap</span>
              <span className="text-emerald-400 font-bold">{getFormattedCost(singleCap, currency, 2)}</span>
            </div>
            <input
              id="hard-cap-slider"
              type="range"
              min="0.01"
              max="2.00"
              step="0.01"
              value={singleCap}
              onChange={(e) => setSingleCap(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg appearance-none"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-600">
              <span>{getFormattedCost(0.01, currency, 2)}</span>
              <span>{getFormattedCost(1.00, currency, 2)}</span>
              <span>{getFormattedCost(2.00, currency, 2)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800/60">
            <div>
              <span className="block text-xs font-semibold text-slate-200">Hourly Run-Rate Warning</span>
              <span className="block text-[10px] text-slate-500 mt-1">Warn if projected run-rate exceeds quota bounds.</span>
            </div>
            <button
              id="hourly-cap-toggle"
              onClick={() => setHourlyCapEnabled(!hourlyCapEnabled)}
              className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative focus:outline-none cursor-pointer ${
                hourlyCapEnabled ? 'bg-emerald-500' : 'bg-slate-800'
              }`}
            >
              <div className={`w-4 h-4 bg-slate-950 rounded-full shadow transition-all duration-300 ${
                hourlyCapEnabled ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        {/* Dynamic visual alert banner */}
        <div className={`p-4 rounded-xl border transition-all duration-300 flex items-center gap-3 ${
          isViolated 
            ? 'bg-amber-950/20 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.05)]' 
            : 'bg-emerald-950/10 border-emerald-500/20 text-emerald-400'
        }`} id="threshold-alert-banner">
          {isViolated ? (
            <>
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 animate-bounce" />
              <div>
                <span className="font-semibold block text-sm">Hard-Cap Threshold Violation</span>
                <span className="text-[11px] text-amber-500/80 block mt-0.5">
                  The current telemetry calculation for {selectedModel} ({getFormattedCost(selectedCost, currency, 6)}) violates your budget hard-cap limit of {getFormattedCost(singleCap, currency, 2)}. Modify prompt context or route to optimal provider.
                </span>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold block text-sm">Budget Validation Passed</span>
                <span className="text-[11px] text-emerald-400/80 block mt-0.5">
                  All active telemetry parameters are within defined bounds. Simulated execution is secure.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
