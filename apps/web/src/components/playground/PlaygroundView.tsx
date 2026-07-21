import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Calculator, Activity, Zap, AlertTriangle, CheckCircle2, Sliders, Terminal, ChevronRight, Loader2, WifiOff, Database, Server, FileSearch, ChevronLeft, X, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MultiModelSelector } from './MultiModelSelector';
import { TokenEstimator } from './TokenEstimator';
import { CostAnalysisPanel } from './CostAnalysisPanel';
import { useTelemetryLogger } from '../../hooks/useTelemetryLogger';
import { usePlaygroundBackend, type PlaygroundResult } from '../../hooks/usePlaygroundBackend';
import { getFormattedCost } from '../../utils/currency';
import { useVectorSync, type RetrievedChunk } from '../../hooks/useVectorSync';
import { RagContextDrawer } from './RagContextDrawer';

const MODEL_PROVIDER_MAP: Record<string, string> = {
  'Claude 3.5 Sonnet': 'anthropic',
  'DeepSeek-R1': 'deepseek',
  'GPT-4o': 'openai',
  'Gemini 1.5 Pro': 'google',
  'Ternary Bonsai 27B': 'deepseek'
};

interface PlaygroundViewProps {
  currency: 'USD' | 'EUR' | 'GBP';
  onNewLogTriggered?: () => void;
}

export function PlaygroundView({ currency, onNewLogTriggered }: PlaygroundViewProps) {
  const [payloadText, setPayloadText] = useState(
    `// Sample prompt / code block pipeline payload\nconst aiResponse = await anthropic.messages.create({\n  model: "unknown",\n  max_tokens: 1024,\n  messages: [{ role: "user", content: "Implement a highly parallel telemetry parser." }]\n});`
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
  const { isRunning, error: backendError, run: runBackend, cancel: cancelBackend } = usePlaygroundBackend();
  const { status: vectorStatus, resyncing, resync: resyncVector, recall, recalling, chunks, recallError } = useVectorSync();
  const [lastResult, setLastResult] = useState<PlaygroundResult | null>(null);
  const [streamedContent, setStreamedContent] = useState('');
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [ragOpen, setRagOpen] = useState(false);
  const [lastPolicy, setLastPolicy] = useState<{ status: 'PASS' | 'WARN' | 'BLOCK'; results: PlaygroundResult['policyResults'] } | null>(null);

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    };
  }, []);

  const handleRunStream = useCallback(async () => {
    if (isRunning) {
      cancelBackend();
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current);
        streamTimerRef.current = null;
      }
      setIsTyping(false);
      return;
    }
    const provider = MODEL_PROVIDER_MAP[selectedModel] || 'anthropic';
    setStreamedContent('');
    setLastResult(null);
    setLastPolicy(null);
    const result = await runBackend({ prompt: payloadText, model: selectedModel, provider });
    if (!result) {
      setIsTyping(false);
      return;
    }
    setLastResult(result);
    setLastPolicy({ status: result.policyStatus, results: result.policyResults });
    setIsTyping(true);
    const words = result.content.split(/(\s+)/);
    let idx = 0;
    const tick = () => {
      if (idx >= words.length) {
        setIsTyping(false);
        return;
      }
      setStreamedContent((prev) => prev + words[idx]);
      idx += 1;
      streamTimerRef.current = setTimeout(tick, 18 + Math.random() * 30);
    };
    streamTimerRef.current = setTimeout(tick, 40);
    // Pull RAG context in parallel for the drawer.
    void recall(payloadText);
    if (onNewLogTriggered) onNewLogTriggered();
  }, [cancelBackend, isRunning, onNewLogTriggered, payloadText, recall, runBackend, selectedModel]);

  const openRag = useCallback(() => {
    setRagOpen(true);
    if (chunks.length === 0 && !recalling) {
      void recall(payloadText);
    }
  }, [chunks.length, payloadText, recall, recalling]);

  const displayOutput = isTyping || !lastResult ? streamedContent : (streamedContent || lastResult.content);

  const policyClasses = lastPolicy
    ? lastPolicy.status === 'BLOCK'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
      : lastPolicy.status === 'WARN'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : null;

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
  let optimalProvider = comparisons[0]!;
  let expensiveProvider = comparisons[0]!;

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
                  {isRunning ? (
                    <button
                      onClick={handleRunStream}
                      className="w-full font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer h-10 bg-red-950/40 text-red-400 border border-red-500/30 hover:bg-red-900/60"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      CANCEL
                    </button>
                  ) : (
                    <button
                      onClick={handleRunStream}
                      className="w-full font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer h-10 bg-blue-950/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500 hover:text-slate-950 hover:border-blue-400"
                    >
                      RUN STREAM
                    </button>
                  )}
                </div>
              </div>
              {backendError && (
                <div
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono text-rose-300 flex items-center gap-2"
                  id="playground-error-banner"
                >
                  <WifiOff className="w-3.5 h-3.5" />
                  Backend unreachable: {backendError}
                </div>
              )}

              {policyClasses && (
                <div
                  id="playground-policy-status"
                  className={`rounded-lg border px-3 py-2 text-[10px] font-mono flex items-center gap-2 ${policyClasses}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="font-bold uppercase tracking-widest">{lastPolicy?.status}</span>
                  <span className="opacity-80">
                    {lastPolicy?.results.filter((r) => r.status !== 'PASS').length || 0} rule(s) flagged
                  </span>
                </div>
              )}
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
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-400 animate-pulse' : isTyping ? 'bg-cyan-400 animate-pulse' : lastResult ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
                {isRunning ? 'PROCESSING' : isTyping ? 'STREAMING' : lastResult ? `${lastResult.route} · ${lastResult.latencyMs}ms` : 'IDLE'}
              </span>
              <button
                id="open-rag-drawer"
                type="button"
                onClick={openRag}
                className="ml-2 flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-cyan-300 hover:bg-cyan-500/20"
                title="Inspect RAG context"
              >
                <FileSearch className="w-3 h-3" />
                RAG
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {displayOutput ? (
              <div className="text-slate-300 whitespace-pre-wrap">
                <span className="text-emerald-400 font-bold block mb-2">$ kx run --model "{selectedModel}"</span>
                <span className="text-blue-400 font-bold block mb-2">
                  [{lastResult?.model ?? selectedModel} · {lastResult?.route ?? 'SLOW_BRAIN'}]
                </span>
                {displayOutput}
                {(isRunning || isTyping) && <span className="inline-block w-1.5 h-3.5 bg-emerald-400 animate-pulse ml-1 align-middle" />}
              </div>
            ) : isRunning ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                <p className="font-mono text-xs">Awaiting backend completion…</p>
                <p className="font-mono text-[10px] text-slate-700">
                  POST /v1/chat/completions
                </p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-600">
                <Terminal className="w-10 h-10 opacity-30" />
                <div className="text-center">
                  <p className="text-slate-500 font-mono text-xs">Awaiting execution sequence...</p>
                  <p className="text-slate-700 font-mono text-[10px] mt-1.5">
                    Run <span className="text-emerald-500/70">RUN STREAM</span> or <span className="text-emerald-500/70">DIRECT-INJECT</span> to populate the channel.
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
            {lastResult ? (
              <span className="flex items-center gap-3">
                <span className="text-emerald-400">{lastResult.tokensIn}+{lastResult.tokensOut}t</span>
                <span className="text-amber-400">{getFormattedCost(lastResult.cost, currency, 4)}</span>
                <span className="text-slate-400">{lastResult.latencyMs}ms</span>
              </span>
            ) : (
              <span>{displayOutput ? `${displayOutput.length} chars` : '0 chars'}</span>
            )}
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
                  All active telemetry parameters are within defined bounds.
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 5. VECTOR STORE / RAG CONTROL STRIP */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="playground-vector-strip">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="font-display font-semibold text-slate-200 text-md">Vector Store & RAG Pipeline</h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              id="vector-state-badge"
              className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${
                vectorStatus.state === 'SYNCED'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : vectorStatus.state === 'INDEXING'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : vectorStatus.state === 'FAILED'
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              [{vectorStatus.state}]
            </span>
            <button
              id="vector-resync-btn"
              type="button"
              onClick={() => void resyncVector()}
              disabled={resyncing}
              className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
            >
              <Server className={`h-3 w-3 ${resyncing ? 'animate-spin' : ''}`} />
              {resyncing ? 'Resyncing…' : 'Re-sync Vector Store'}
            </button>
            <button
              id="vector-open-rag-btn"
              type="button"
              onClick={openRag}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              <FileSearch className="h-3 w-3" />
              Inspect Chunks
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Total Chunks</div>
            <div className="mt-1 font-mono text-lg font-bold text-cyan-300">{vectorStatus.totalChunks}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Vectors Indexed</div>
            <div className="mt-1 font-mono text-lg font-bold text-cyan-300">{vectorStatus.totalVectors}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Recent Documents</div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-300">{vectorStatus.recentDocs.length}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Last Sync</div>
            <div className="mt-1 font-mono text-sm font-bold text-slate-300">
              {vectorStatus.lastSyncAt ? new Date(vectorStatus.lastSyncAt).toLocaleTimeString() : '—'}
            </div>
          </div>
        </div>

        {vectorStatus.recentDocs.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">Indexed Documents</div>
            <ul className="space-y-0.5 font-mono text-[10px]">
              {vectorStatus.recentDocs.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">›</span>
                  <span className="truncate">{d.id}</span>
                  <span className="ml-auto text-slate-500">{d.chunkCount} chunks</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <RagContextDrawer
        open={ragOpen}
        onClose={() => setRagOpen(false)}
        chunks={chunks}
        recalling={recalling}
        recallError={recallError}
        syncStatus={vectorStatus}
        prompt={payloadText}
      />
    </div>
  );
}
