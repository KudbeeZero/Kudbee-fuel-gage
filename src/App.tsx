import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Activity,
  Database,
  HeartPulse,
  History,
  Bell,
  Settings,
  TerminalSquare,
  Star,
  Zap,
  DollarSign,
  Cpu,
  ArrowRightLeft,
  Copy,
  Check,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Sparkles,
  Search,
  Download,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

// --- CURRENCY UTILITY ENGINE ---

export const CURRENCY_CONFIG = {
  USD: { symbol: '$', rate: 1.0, label: 'US Dollar (USD)' },
  EUR: { symbol: '€', rate: 0.92, label: 'Euro (EUR)' },
  GBP: { symbol: '£', rate: 0.78, label: 'British Pound (GBP)' }
};

export function getFormattedCost(usdAmount: number, currency: 'USD' | 'EUR' | 'GBP', decimals = 4) {
  const rates = CURRENCY_CONFIG;
  const config = rates[currency];
  const converted = usdAmount * config.rate;
  return `${config.symbol}${converted.toFixed(decimals)}`;
}

// --- SUB-COMPONENTS FOR DASHBOARD VIEW ---

function TelemetryCard({ title, value, prefix = "", suffix = "", icon: Icon }: any) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden group" id={`telemetry-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-emerald-500/70" />}
        <div className="text-slate-500 text-xs font-semibold uppercase tracking-widest">{title}</div>
      </div>
      <div className="font-mono text-3xl text-slate-100 flex items-baseline gap-1">
        {prefix && <span className="text-emerald-500/50 text-xl">{prefix}</span>}
        {value}
        {suffix && <span className="text-emerald-500/50 text-xl">{suffix}</span>}
      </div>
    </div>
  );
}

function HealthRing({ provider, percent, offsetMins }: { provider: string, percent: number, offsetMins: number, key?: any }) {
  const [timeLeft, setTimeLeft] = useState(offsetMins * 60 + Math.floor(Math.random() * 60));
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => t > 0 ? t - 1 : offsetMins * 60);
    }, 1000);
    return () => clearInterval(timer);
  }, [offsetMins]);

  const h = Math.floor(timeLeft / 3600).toString().padStart(2, '0');
  const m = Math.floor((timeLeft % 3600) / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 flex flex-col items-center relative overflow-hidden" id={`health-ring-${provider.toLowerCase()}`}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-emerald-500/20"></div>
      
      <div className="relative flex items-center justify-center mb-3">
        <svg className="-rotate-90 w-24 h-24">
          <circle cx="48" cy="48" r={radius} stroke="currentColor" strokeWidth="4" fill="none" className="text-slate-800" />
          <circle 
            cx="48" 
            cy="48" 
            r={radius} 
            stroke="currentColor" 
            strokeWidth="4" 
            fill="none" 
            className="text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.4)] transition-all duration-1000"
            strokeDasharray={circumference} 
            strokeDashoffset={strokeDashoffset} 
            strokeLinecap="round" 
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold text-slate-200">{percent}%</span>
        </div>
      </div>
      
      <div className="text-slate-300 font-medium text-sm mb-1">{provider}</div>
      <div className="font-mono text-[10px] text-slate-500 tracking-widest bg-slate-950 px-2 py-1 rounded border border-slate-800">
        {h}:{m}:{s}
      </div>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star 
          key={star} 
          className={`w-3.5 h-3.5 ${star <= Math.floor(rating) ? 'fill-emerald-400 text-emerald-400' : star === Math.ceil(rating) ? 'fill-emerald-400/30 text-emerald-400' : 'fill-slate-800 text-slate-800'}`} 
        />
      ))}
    </div>
  );
}

// --- SUB-COMPONENT: INTERCEPTOR VIEW ---

function InterceptorView({ currency }: { currency: 'USD' | 'EUR' | 'GBP' }) {
  const [copied, setCopied] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  
  const configCode = `export CLAUDE_CODE_ENABLE_TELEMETRY=1\nexport OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:8000"`;

  const initialLogs = [
    {
      timestamp: new Date(Date.now() - 15000).toISOString(),
      trace_id: "tr-7f2a1b9c8e",
      model: "claude-3-5-sonnet",
      tokens_in: 840,
      tokens_out: 320,
      cost: 0.00732,
      project: "kilo-fuel-gauge"
    },
    {
      timestamp: new Date(Date.now() - 10000).toISOString(),
      trace_id: "tr-2e4d5f6a7b",
      model: "deepseek-r1",
      tokens_in: 1250,
      tokens_out: 680,
      cost: 0.00218,
      project: "kilo-fuel-gauge"
    }
  ];

  const [logs, setLogs] = useState<any[]>(initialLogs);

  // Auto-scroll logic
  useEffect(() => {
    if (terminalEndRef.current && !isPaused) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  // Simulate incoming live telemetry stream
  useEffect(() => {
    if (isPaused) return;

    const modelsPool = [
      { name: "claude-3-5-sonnet", inputRate: 0.003, outputRate: 0.015 },
      { name: "deepseek-r1", inputRate: 0.00055, outputRate: 0.00219 },
      { name: "gemini-1.5-pro", inputRate: 0.00125, outputRate: 0.005 },
      { name: "gpt-4o", inputRate: 0.005, outputRate: 0.015 }
    ];

    const interval = setInterval(() => {
      const selectedModel = modelsPool[Math.floor(Math.random() * modelsPool.length)];
      const tokensIn = Math.floor(Math.random() * 900) + 100;
      const tokensOut = Math.floor(Math.random() * 400) + 50;
      const calculatedCost = ((tokensIn / 1000) * selectedModel.inputRate) + ((tokensOut / 1000) * selectedModel.outputRate);
      
      const newLog = {
        timestamp: new Date().toISOString(),
        trace_id: "tr-" + Math.random().toString(36).substring(2, 12),
        model: selectedModel.name,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost: Number(calculatedCost.toFixed(6)),
        project: "kilo-fuel-gauge"
      };

      setLogs(prev => [...prev, newLog].slice(-30)); // Keep last 30 logs for performance
    }, 2500);

    return () => clearInterval(interval);
  }, [isPaused]);

  const handleCopy = () => {
    navigator.clipboard.writeText(configCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6" id="interceptor-view-container">
      
      {/* 1. OTel CONFIG GENERATOR */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="otel-config-box">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-semibold text-slate-200 text-lg">Local OpenTelemetry Hook Configuration</h2>
            <p className="text-xs text-slate-500 mt-1">Run these commands in your CLI environment to route local AI executions to the telemetry pipeline.</p>
          </div>
          
          <button 
            id="copy-config-btn"
            onClick={handleCopy}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 border cursor-pointer ${
              copied 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>COPY TO CLIPBOARD</span>
              </>
            )}
          </button>
        </div>

        <div className="relative bg-slate-950/80 rounded-lg p-4 border border-slate-800/80 font-mono text-sm text-emerald-400/90 leading-relaxed overflow-x-auto select-all">
          <span className="text-slate-600"># Enable telemetry interceptor hook</span><br />
          <span className="text-slate-400">export </span>CLAUDE_CODE_ENABLE_TELEMETRY=1<br />
          <span className="text-slate-600"># Direct OTel collector target endpoint</span><br />
          <span className="text-slate-400">export </span>OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:8000"
        </div>
      </div>

      {/* 2. LIVE TERMINAL INGESTION STREAM */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[400px]" id="live-stream-box">
        <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </span>
            <h2 className="font-display font-semibold text-slate-200 text-sm tracking-wide uppercase">
              OTel Ingestion Stream Terminal {isPaused && <span className="text-amber-500 text-xs ml-2">[PAUSED]</span>}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button
              id="pause-stream-btn"
              onClick={() => setIsPaused(!isPaused)}
              className={`px-3 py-1 rounded text-xs font-mono font-medium transition-all border cursor-pointer ${
                isPaused 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 animate-pulse' 
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {isPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}
            </button>
            <span className="font-mono text-[10px] text-slate-500">LISTENING ON PORT :8000</span>
          </div>
        </div>

        {/* Mock Terminal Workspace */}
        <div className="flex-1 bg-black p-4 font-mono text-xs overflow-y-auto space-y-2 select-text scrollbar-thin scrollbar-thumb-slate-800">
          <div className="text-emerald-500/50">{"[system] Initializing Kudbee Fuel Gauge telemetry daemon..."}</div>
          <div className="text-emerald-500/50">{"[system] Pipeline collector online, routing stream logs..."}</div>
          {isPaused && (
            <div className="text-amber-500/80 bg-amber-950/20 px-2 py-1 rounded border border-amber-900/30 inline-block">
              ⚠️ LOG COLLECTION PAUSED. Reviewing existing traces.
            </div>
          )}
          
          {logs.map((log, idx) => {
            const formattedCostWithSymbol = getFormattedCost(log.cost, currency, 6);
            const traceObj = {
              ...log,
              cost: currency === 'USD' ? log.cost : `${formattedCostWithSymbol} (equiv)`
            };
            return (
              <div key={idx} className="space-y-1 py-1 border-b border-slate-950">
                <div className="flex items-center justify-between text-slate-500 text-[10px]">
                  <span>{log.timestamp}</span>
                  <span className="text-emerald-500/70 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">TRACE OK</span>
                </div>
                <pre className="text-emerald-400/90 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(traceObj, null, 2)}
                </pre>
              </div>
            );
          })}
          <div ref={terminalEndRef} />
        </div>
      </div>

    </div>
  );
}

// --- SUB-COMPONENT: PLAYGROUND VIEW ---

function PlaygroundView({ currency }: { currency: 'USD' | 'EUR' | 'GBP' }) {
  const [payloadText, setPayloadText] = useState(
    `// Sample prompt / code block pipeline telemetry simulation\nconst aiResponse = await anthropic.messages.create({\n  model: "claude-3-5-sonnet",\n  max_tokens: 1024,\n  messages: [{ role: "user", content: "Implement a highly parallel telemetry parser." }]\n});`
  );
  const [selectedModel, setSelectedModel] = useState('Claude 3.5 Sonnet');
  const [singleCap, setSingleCap] = useState(0.05); // Slider cap (ranges from $0.01 to $2.00 in USD baseline)
  const [hourlyCapEnabled, setHourlyCapEnabled] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalculation, setLastCalculation] = useState<string | null>(null);

  // Token arithmetic: baseline metric of roughly 1 token per 4 characters
  const charCount = payloadText.length;
  const tokenCount = Math.ceil(charCount / 4);

  // Output token prediction: assume roughly 35% of input token count is returned
  const predictedOutputTokens = Math.ceil(tokenCount * 0.35);

  // Real market rates (Cost per 1M tokens in USD)
  const rates = {
    'Anthropic': { in: 3.00, out: 15.00, name: 'Claude 3.5 Sonnet', platform: 'Anthropic API' },
    'DeepSeek': { in: 0.55, out: 2.19, name: 'DeepSeek-R1', platform: 'DeepSeek Cloud' },
    'Google': { in: 1.25, out: 5.00, name: 'Gemini 1.5 Pro', platform: 'Google AI Studio' },
    'OpenAI': { in: 5.00, out: 15.00, name: 'GPT-4o', platform: 'OpenAI Developer Platform' }
  };

  const calculateCost = (prov: keyof typeof rates) => {
    const rate = rates[prov];
    return ((tokenCount / 1000000) * rate.in) + ((predictedOutputTokens / 1000000) * rate.out);
  };

  // Prepare full data list
  const comparisons = (Object.keys(rates) as Array<keyof typeof rates>).map(k => {
    return {
      id: k,
      name: rates[k].name,
      platform: rates[k].platform,
      cost: calculateCost(k)
    };
  });

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
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/60">
                  <span className="block text-[10px] font-mono uppercase text-slate-500">Character Length</span>
                  <span className="font-mono text-xl text-slate-200">{charCount.toLocaleString()}</span>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/60 relative overflow-hidden">
                  <div className="absolute right-2 bottom-1 text-emerald-500/10"><Sparkles className="w-12 h-12" /></div>
                  <span className="block text-[10px] font-mono uppercase text-slate-500">Estimated Tokens</span>
                  <span className="font-mono text-xl text-emerald-400 font-bold">{tokenCount.toLocaleString()}</span>
                </div>
              </div>

              {/* Model selection dropdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Simulated Active Route</label>
                  <select
                    id="active-route-selector"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500/40"
                  >
                    <option>Claude 3.5 Sonnet</option>
                    <option>DeepSeek-R1</option>
                    <option>GPT-4o</option>
                    <option>Gemini 1.5 Pro</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    id="calculate-projection-btn"
                    onClick={handleTriggerCalculation}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer h-10 shadow-[0_0_12px_rgba(52,211,153,0.25)] hover:shadow-[0_0_16px_rgba(52,211,153,0.4)]"
                  >
                    <Activity className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
                    {isCalculating ? 'PARSING...' : 'Calculate Projection'}
                  </button>
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

        {/* RIGHT COLUMN: CROSS-PROVIDER COMPARISON MATRIX */}
        <div className="lg:col-span-5 flex flex-col gap-4">
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
        </div>

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

// --- SUB-COMPONENT: HISTORY VIEW ---

const HISTORICAL_TRACES_MOCK = [
  { timestamp: "2026-07-17T10:15:30Z", project: "frontier-core", model: "claude-3-5-sonnet", tokens_in: 85000, tokens_out: 42000, cost: 0.8850, timeframe: "24h" },
  { timestamp: "2026-07-17T09:42:11Z", project: "kudbee-fuel-gauge", model: "deepseek-r1", tokens_in: 120000, tokens_out: 95000, cost: 0.2740, timeframe: "24h" },
  { timestamp: "2026-07-17T08:05:19Z", project: "mesh-globe-3d", model: "gpt-4o", tokens_in: 45000, tokens_out: 32000, cost: 0.7050, timeframe: "24h" },
  { timestamp: "2026-07-16T22:12:00Z", project: "frontier-core", model: "gemini-1.5-pro", tokens_in: 15000, tokens_out: 8500, cost: 0.0612, timeframe: "24h" },
  { timestamp: "2026-07-16T15:30:45Z", project: "kudbee-fuel-gauge", model: "claude-3-5-sonnet", tokens_in: 30000, tokens_out: 12000, cost: 0.2700, timeframe: "24h" },
  { timestamp: "2026-07-15T11:20:00Z", project: "mesh-globe-3d", model: "deepseek-r1", tokens_in: 80000, tokens_out: 45000, cost: 0.1425, timeframe: "7d" },
  { timestamp: "2026-07-14T09:10:15Z", project: "frontier-core", model: "gpt-4o", tokens_in: 95000, tokens_out: 62000, cost: 1.4050, timeframe: "7d" },
  { timestamp: "2026-07-13T14:55:32Z", project: "kudbee-fuel-gauge", model: "gemini-1.5-pro", tokens_in: 60000, tokens_out: 35000, cost: 0.2500, timeframe: "7d" },
  { timestamp: "2026-07-12T16:40:10Z", project: "mesh-globe-3d", model: "claude-3-5-sonnet", tokens_in: 110000, tokens_out: 55000, cost: 1.1550, timeframe: "7d" },
  { timestamp: "2026-07-10T10:30:22Z", project: "frontier-core", model: "deepseek-r1", tokens_in: 250000, tokens_out: 180000, cost: 0.5317, timeframe: "7d" },
  { timestamp: "2026-07-08T11:15:00Z", project: "kudbee-fuel-gauge", model: "gpt-4o", tokens_in: 18000, tokens_out: 9500, cost: 0.2325, timeframe: "7d" },
  { timestamp: "2026-06-30T09:00:00Z", project: "mesh-globe-3d", model: "gemini-1.5-pro", tokens_in: 25000, tokens_out: 15000, cost: 0.1062, timeframe: "all" },
  { timestamp: "2026-06-25T14:20:11Z", project: "frontier-core", model: "claude-3-5-sonnet", tokens_in: 65000, tokens_out: 28000, cost: 0.6150, timeframe: "all" },
  { timestamp: "2026-06-18T16:05:40Z", project: "kudbee-fuel-gauge", model: "deepseek-r1", tokens_in: 150000, tokens_out: 110000, cost: 0.3234, timeframe: "all" },
  { timestamp: "2026-06-10T11:45:12Z", project: "mesh-globe-3d", model: "gpt-4o", tokens_in: 35000, tokens_out: 22000, cost: 0.5050, timeframe: "all" }
];

// --- TELEMETRY PERFORMANCE HELPERS ---

function getTtft(model: string): number {
  if (model.includes('sonnet')) return 185;
  if (model.includes('deepseek')) return 420;
  if (model.includes('gpt-4o')) return 145;
  if (model.includes('gemini')) return 210;
  return 250;
}

function getLatency(tokensOut: number, model: string): number {
  const ttft = getTtft(model);
  const multiplier = model.includes('deepseek') ? 15 : model.includes('sonnet') ? 18 : 12;
  return Math.round(ttft + (tokensOut / multiplier));
}

function getSpeed(tokensOut: number, model: string): number {
  const latency = getLatency(tokensOut, model);
  const ttft = getTtft(model);
  const timeSec = (latency - ttft) / 1000;
  if (timeSec <= 0) return 30;
  return Math.round(tokensOut / timeSec);
}

function getRegion(project: string): string {
  if (project.includes('frontier')) return 'us-east4 (N. Virginia)';
  if (project.includes('kudbee')) return 'us-west2 (Los Angeles)';
  return 'europe-west4 (Eemshaven)';
}

function getRawJson(log: any) {
  const cleanTimestamp = log.timestamp.replace(/[^0-9]/g, '').slice(-10);
  return {
    trace_id: `0af7651916cd43dd${cleanTimestamp}e7f8`,
    span_id: `b7ad${cleanTimestamp.slice(0, 8)}31`,
    name: "chat.completion",
    context: {
      project_name: log.project,
      environment: "production",
      telemetry_hook: "claude-code-interceptor"
    },
    attributes: {
      "gen_ai.system": log.model.includes('sonnet') ? 'anthropic' : log.model.includes('deepseek') ? 'deepseek' : log.model.includes('gpt') ? 'openai' : 'google',
      "gen_ai.model": log.model,
      "gen_ai.request.tokens": log.tokens_in,
      "gen_ai.response.tokens": log.tokens_out,
      "gen_ai.usage.cost_usd": log.cost,
      "http.status_code": 200,
      "server.address": log.model.includes('sonnet') ? "api.anthropic.com" : log.model.includes('deepseek') ? "api.deepseek.com" : log.model.includes('gpt') ? "api.openai.com" : "generativelanguage.googleapis.com"
    },
    timing: {
      "time_to_first_token_ms": getTtft(log.model),
      "total_duration_ms": getLatency(log.tokens_out, log.model),
      "queue_duration_ms": Math.floor(Math.random() * 20) + 5
    }
  };
}

function HistoryView({ currency }: { currency: 'USD' | 'EUR' | 'GBP' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | 'all'>('all');
  const [exporting, setExporting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  // Filter logic
  const filteredLogs = HISTORICAL_TRACES_MOCK.filter(log => {
    const matchesSearch = 
      log.project.toLowerCase().includes(searchQuery.toLowerCase()) || 
      log.model.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (timeframe === '24h') {
      return matchesSearch && log.timeframe === '24h';
    } else if (timeframe === '7d') {
      return matchesSearch && (log.timeframe === '24h' || log.timeframe === '7d');
    }
    return matchesSearch;
  });

  // Rollup logic
  const projectStats = filteredLogs.reduce((acc, log) => {
    if (!acc[log.project]) {
      acc[log.project] = { cost: 0, requests: 0 };
    }
    acc[log.project].cost += log.cost;
    acc[log.project].requests += 1;
    return acc;
  }, {} as Record<string, { cost: number; requests: number }>);

  const totalFilteredCost = Object.values(projectStats).reduce((sum, p) => sum + p.cost, 0) || 1;

  const targetProjects = ['frontier-core', 'kudbee-fuel-gauge', 'mesh-globe-3d'];
  const projectRollup = targetProjects.map(projName => {
    const stats = projectStats[projName] || { cost: 0, requests: 0 };
    const pct = totalFilteredCost > 0 ? (stats.cost / totalFilteredCost) * 100 : 0;
    return {
      name: projName,
      cost: stats.cost,
      requests: stats.requests,
      percent: pct
    };
  });

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      const headers = ["Timestamp", "Project Name", "Model", "Input Tokens", "Output Tokens", "Total Cost (USD)"];
      const rows = filteredLogs.map(l => [
        l.timestamp,
        l.project,
        l.model,
        l.tokens_in,
        l.tokens_out,
        l.cost
      ]);
      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(",")].concat(rows.map(e => e.join(","))).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `kudbee_telemetry_history_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExporting(false);
    }, 800);
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 14 } }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6" 
      id="history-view-container"
    >
      
      {/* 1. PROJECT METADATA ROLLUP */}
      <motion.div 
        variants={sectionVariants}
        className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" 
        id="history-rollup-box"
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-semibold text-slate-200 text-lg">Attribution by Project</h2>
            <p className="text-xs text-slate-500 mt-1">Proportional token spend and request distribution across active workspace repositories.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Multi-segment visual bar */}
          <div className="flex h-4 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            {projectRollup.map((proj, idx) => {
              const colors = ['bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.4)]', 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]', 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]'];
              if (proj.percent === 0) return null;
              return (
                <div 
                  key={proj.name} 
                  style={{ width: `${proj.percent}%` }} 
                  className={`${colors[idx % colors.length]} h-full transition-all duration-500`}
                  title={`${proj.name}: ${proj.percent.toFixed(1)}%`}
                />
              );
            })}
          </div>
          
          {/* Cards for each project */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {projectRollup.map((proj, idx) => {
              const borderColors = ['border-emerald-500/20 hover:border-emerald-500/40', 'border-teal-500/20 hover:border-teal-500/40', 'border-cyan-500/20 hover:border-cyan-500/40'];
              const textColors = ['text-emerald-400', 'text-teal-400', 'text-cyan-400'];
              const indicatorColors = ['bg-emerald-400', 'bg-teal-400', 'bg-cyan-400'];
              return (
                <motion.div 
                  whileHover={{ scale: 1.02, translateY: -2 }}
                  transition={{ type: "spring", stiffness: 150, damping: 12 }}
                  key={proj.name} 
                  className={`bg-slate-950/80 p-4 rounded-lg border ${borderColors[idx % borderColors.length]} transition-all duration-200 cursor-pointer`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${indicatorColors[idx % indicatorColors.length]}`}></span>
                    <span className="text-xs font-mono font-semibold text-slate-300">{proj.name}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-500 uppercase font-mono">Cost</span>
                    <span className={`font-mono text-sm font-bold ${textColors[idx % textColors.length]}`}>
                      {getFormattedCost(proj.cost, currency, 4)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline mt-1">
                    <span className="text-[10px] text-slate-500 uppercase font-mono">Requests</span>
                    <span className="font-mono text-xs text-slate-300">{proj.requests}</span>
                  </div>
                  <div className="flex justify-between items-baseline mt-1">
                    <span className="text-[10px] text-slate-500 uppercase font-mono">Budget Share</span>
                    <span className="font-mono text-xs text-slate-300">{proj.percent.toFixed(1)}%</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* 2. INTERACTIVE FILTERING & EXPORT CONTROL BAR */}
      <motion.div 
        variants={sectionVariants}
        className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap md:flex-nowrap items-center justify-between gap-4" 
        id="history-filter-box"
      >
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative w-full md:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-slate-500" />
            </span>
            <input
              type="text"
              id="history-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search project or model ID..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/40 font-mono transition-colors"
            />
          </div>

          {/* Timeframe selector dropdown */}
          <select
            id="history-timeframe-dropdown"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/40 font-mono"
          >
            <option value="all">Timeframe: All Time</option>
            <option value="7d">Timeframe: Last 7 Days</option>
            <option value="24h">Timeframe: Last 24h</option>
          </select>
        </div>

        {/* Export Button */}
        <button
          id="history-export-btn"
          onClick={handleExport}
          disabled={exporting || filteredLogs.length === 0}
          className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all duration-200 border cursor-pointer border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto shadow-[0_0_8px_rgba(52,211,153,0.15)] hover:shadow-[0_0_12px_rgba(52,211,153,0.3)]"
        >
          <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
          <span>{exporting ? 'GENERATING CSV...' : 'Export Logs to CSV'}</span>
        </button>
      </motion.div>

      {/* 3. HISTORICAL TRACES DATA GRID */}
      <motion.div 
        variants={sectionVariants}
        className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col" 
        id="history-grid-box"
      >
        <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h2 className="font-display font-semibold text-slate-200 text-sm tracking-wide uppercase">
              Historical Execution Traces ({filteredLogs.length} found)
            </h2>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase tracking-widest bg-slate-950/50">
                <th className="px-4 py-4 w-10 border-b border-slate-800"></th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Timestamp</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Project Name</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Model</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Input Tokens</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Output Tokens</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-800/50">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center font-mono text-slate-500">
                    No historical traces matched the current filtering criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const isHighCost = log.cost > 0.50;
                  const isExpanded = expandedRow === log.timestamp;
                  const traceId = `tr-${log.timestamp.replace(/[^0-9]/g, '').slice(-10)}`;

                  return (
                    <React.Fragment key={log.timestamp}>
                      <tr 
                        onClick={() => setExpandedRow(isExpanded ? null : log.timestamp)}
                        className={`cursor-pointer transition-all duration-300 ease-in-out select-none border-l-2 ${
                          isExpanded 
                            ? 'bg-gradient-to-r from-emerald-500/10 via-slate-800/30 to-transparent text-slate-100 border-emerald-500 shadow-[inset_1px_0_12px_rgba(52,211,153,0.1)]' 
                            : 'bg-transparent border-transparent hover:bg-slate-800/25 hover:border-emerald-500/40 hover:text-slate-200'
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0, scale: isExpanded ? 1.15 : 1 }}
                            transition={{ type: "spring", stiffness: 220, damping: 14 }}
                            className="inline-block"
                          >
                            <ChevronRight className={`w-4 h-4 ${isExpanded ? 'text-emerald-400' : 'text-slate-500'}`} />
                          </motion.div>
                        </td>
                        <td className="px-6 py-3 font-mono text-slate-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 font-mono text-slate-300 font-semibold">
                          {log.project}
                        </td>
                        <td className="px-6 py-3 font-mono text-slate-400">
                          {log.model}
                        </td>
                        <td className="px-6 py-3 font-mono text-slate-300">
                          {log.tokens_in.toLocaleString()}
                        </td>
                        <td className="px-6 py-3 font-mono text-slate-300">
                          {log.tokens_out.toLocaleString()}
                        </td>
                        <td className="px-6 py-3 text-right font-mono">
                          {isHighCost ? (
                            <span className="text-amber-400 font-bold flex items-center justify-end gap-1" title="Cost exceeds limit warning">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {getFormattedCost(log.cost, currency, 4)}
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-medium">
                              {getFormattedCost(log.cost, currency, 4)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <tr className="bg-slate-950/70 border-b border-slate-800/80" id={`expanded-detail-${idx}`}>
                            <td colSpan={7} className="p-0 overflow-hidden">
                              <motion.div
                                key={`expanded-div-${idx}`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                className="px-6 py-5"
                              >
                                <motion.div 
                                  initial="hidden"
                                  animate="visible"
                                  variants={{
                                    hidden: { opacity: 0 },
                                    visible: {
                                      opacity: 1,
                                      transition: {
                                        staggerChildren: 0.08
                                      }
                                    }
                                  }}
                                  className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-slate-300"
                                >
                                  
                                  {/* 1. TIMING METADATA / PERFORMANCE BLOCK */}
                                  <motion.div variants={itemVariants} className="lg:col-span-5 space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                                      <Activity className="w-4 h-4 text-emerald-400" />
                                      <h3 className="font-display font-semibold text-slate-200 text-sm">Expanded Trace Detail</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                      <motion.div 
                                        whileHover={{ scale: 1.04, borderColor: "rgba(52,211,153,0.35)", boxShadow: "0 0 12px rgba(52,211,153,0.12)" }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                        className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80 cursor-default transition-colors duration-200"
                                      >
                                        <span className="block text-[10px] text-slate-500 uppercase font-mono tracking-wider">Time to First Token</span>
                                        <span className="font-mono text-sm text-emerald-400 font-bold">{getTtft(log.model)} ms</span>
                                      </motion.div>
                                      
                                      <motion.div 
                                        whileHover={{ scale: 1.04, borderColor: "rgba(52,211,153,0.35)", boxShadow: "0 0 12px rgba(52,211,153,0.12)" }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                        className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80 cursor-default transition-colors duration-200"
                                      >
                                        <span className="block text-[10px] text-slate-500 uppercase font-mono tracking-wider">Total Latency</span>
                                        <span className="font-mono text-sm text-slate-200 font-bold">{getLatency(log.tokens_out, log.model)} ms</span>
                                      </motion.div>
                                      
                                      <motion.div 
                                        whileHover={{ scale: 1.04, borderColor: "rgba(52,211,153,0.35)", boxShadow: "0 0 12px rgba(52,211,153,0.12)" }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                        className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80 cursor-default transition-colors duration-200"
                                      >
                                        <span className="block text-[10px] text-slate-500 uppercase font-mono tracking-wider">Generation Speed</span>
                                        <span className="font-mono text-sm text-slate-200">
                                          {getSpeed(log.tokens_out, log.model)} t/s
                                        </span>
                                      </motion.div>
                                      
                                      <motion.div 
                                        whileHover={{ scale: 1.04, borderColor: "rgba(52,211,153,0.35)", boxShadow: "0 0 12px rgba(52,211,153,0.12)" }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                        className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80 cursor-default transition-colors duration-200"
                                      >
                                        <span className="block text-[10px] text-slate-500 uppercase font-mono tracking-wider">Routing Status</span>
                                        <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40 inline-block font-bold">
                                          200 OK
                                        </span>
                                      </motion.div>
                                    </div>
                                    
                                    <div className="space-y-1.5 text-xs text-slate-400 font-mono bg-slate-900/20 p-3 rounded-lg border border-slate-800/40">
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Trace ID:</span>
                                        <span className="text-slate-300">{traceId}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Service:</span>
                                        <span className="text-slate-300">otel-pipeline-collector</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Region:</span>
                                        <span className="text-slate-300">{getRegion(log.project)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">SDK Version:</span>
                                        <span className="text-slate-300">@opentelemetry/sdk-node@1.24.0</span>
                                      </div>
                                    </div>
                                  </motion.div>

                                  {/* 2. RAW JSON TRACE PAYLOAD BLOCK */}
                                  <motion.div variants={itemVariants} className="lg:col-span-7 flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2 mb-3">
                                        <div className="flex items-center gap-2">
                                          <Database className="w-4 h-4 text-emerald-400" />
                                          <h3 className="font-display font-semibold text-slate-200 text-sm">Semantic OTel Payload (Raw JSON)</h3>
                                        </div>
                                        
                                        <motion.button
                                          whileHover={{ scale: 1.05 }}
                                          whileTap={{ scale: 0.95 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const jsonStr = JSON.stringify(getRawJson(log), null, 2);
                                            navigator.clipboard.writeText(jsonStr);
                                            setCopiedTraceId(traceId);
                                            setTimeout(() => setCopiedTraceId(null), 1500);
                                          }}
                                          className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5 animate-none"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>{copiedTraceId === traceId ? 'COPIED!' : 'COPY JSON'}</span>
                                        </motion.button>
                                      </div>
                                      
                                      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 font-mono text-[11px] text-slate-300/90 leading-relaxed overflow-x-auto max-h-[190px] overflow-y-auto select-all scrollbar-thin scrollbar-thumb-slate-800">
                                        <pre className="text-emerald-400/80">{JSON.stringify(getRawJson(log), null, 2)}</pre>
                                      </div>
                                    </div>
                                  </motion.div>

                                </motion.div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

    </motion.div>
  );
}

// --- SUB-COMPONENT: SETTINGS VIEW ---

function SettingsView({ currency, setCurrency }: { currency: 'USD' | 'EUR' | 'GBP'; setCurrency: (c: 'USD' | 'EUR' | 'GBP') => void }) {
  const currencies: { id: 'USD' | 'EUR' | 'GBP'; label: string; symbol: string; desc: string }[] = [
    { id: 'USD', label: 'US Dollar', symbol: '$', desc: 'United States Dollar (Baseline baseline format)' },
    { id: 'EUR', label: 'Euro', symbol: '€', desc: 'European Union Euro (Exchange Rate: 1 USD = 0.92 EUR)' },
    { id: 'GBP', label: 'British Pound', symbol: '£', desc: 'United Kingdom Pound Sterling (Exchange Rate: 1 USD = 0.78 GBP)' }
  ];

  return (
    <div className="space-y-6" id="settings-view-container">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-emerald-400" />
          <h2 className="font-display font-semibold text-slate-200 text-lg">Applet Configuration</h2>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">Global Currency Selector</h3>
            <p className="text-xs text-slate-500 mb-4">
              Select the preferred currency format for all displayed token, trace, and projection cost metrics across the entire application workspace.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {currencies.map((curr) => {
                const isSelected = currency === curr.id;
                return (
                  <button
                    key={curr.id}
                    id={`currency-selector-${curr.id.toLowerCase()}`}
                    onClick={() => setCurrency(curr.id)}
                    className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 relative ${
                      isSelected
                        ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.1)]'
                        : 'bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="font-mono text-sm font-bold tracking-wide uppercase">{curr.label}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        {curr.id}
                      </span>
                    </div>
                    <div>
                      <span className="font-mono text-3xl font-extrabold text-slate-100 block mb-1">
                        {curr.symbol}
                      </span>
                      <span className="text-[10px] text-slate-500 block leading-tight">
                        {curr.desc}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-slate-950">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800/60">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Telemetry Pipeline Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/60">
                <span className="block text-xs font-semibold text-slate-300">Real-time Conversion Engine</span>
                <span className="block text-[11px] text-slate-500 mt-1">
                  Exchange values are dynamically synchronized based on standardized regional API rates. Conversion is performed at the display layer to maintain pure USD baseline telemetry integrity.
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/60">
                <span className="block text-xs font-semibold text-slate-300">Workspace Locale Storage</span>
                <span className="block text-[11px] text-slate-500 mt-1">
                  Active format preferences are stored in the active React telemetry context, propagating immediately to any mounted monitors, calculators, and matrix layouts.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN APPLICATION ENTRY WITH SIDEBAR ROUTING ---

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'GBP'>('USD');

  // Live Telemetry State for Header/Summary sync
  const [stats, setStats] = useState({
    inTokens: 1234567,
    outTokens: 3456789,
    cost: 45.2034
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(s => {
        const inBump = Math.floor(Math.random() * 45) + 5;
        const outBump = Math.floor(Math.random() * 120) + 15;
        const costBump = 0.0347 + (Math.random() * 0.01);
        return {
          inTokens: s.inTokens + inBump,
          outTokens: s.outTokens + outBump,
          cost: s.cost + costBump
        };
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Activity, label: 'Interceptor' },
    { icon: Calculator, label: 'Playground' },
    { icon: History, label: 'History' },
    { icon: Settings, label: 'Settings' }
  ];

  const models = [
    { name: "GPT-4o", org: "OpenAI", costIn: "5.00", costOut: "15.00", speed: 85, quality: 5, status: "ACTIVE" },
    { name: "Claude 3.5 Sonnet", org: "Anthropic", costIn: "3.00", costOut: "15.00", speed: 92, quality: 5, status: "ACTIVE" },
    { name: "Gemini 1.5 Pro", org: "Google", costIn: "1.25", costOut: "5.00", speed: 78, quality: 4.5, status: "ACTIVE" },
    { name: "Llama 3.1 70B", org: "Meta", costIn: "0.70", costOut: "0.90", speed: 95, quality: 4, status: "STANDBY" },
    { name: "Mistral Large 2", org: "Mistral", costIn: "3.00", costOut: "9.00", speed: 82, quality: 4.5, status: "STANDBY" }
  ];

  const quotas = [
    { provider: "OpenAI", percent: 79, offsetMins: 145 },
    { provider: "Anthropic", percent: 45, offsetMins: 212 },
    { provider: "Google", percent: 92, offsetMins: 45 },
    { provider: "Meta", percent: 61, offsetMins: 340 }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans flex overflow-hidden selection:bg-emerald-500/30">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-64 border-r border-slate-800/60 bg-slate-950 flex flex-col shrink-0 hidden md:flex z-10" id="main-sidebar">
        <div className="h-20 flex items-center px-6 border-b border-slate-800/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-emerald-500/20"></div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <TerminalSquare className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <span className="font-display font-bold text-lg tracking-tight text-slate-100 block leading-none">KUDBEE</span>
              <span className="font-mono text-[9px] text-emerald-500 uppercase tracking-widest block mt-1">Fuel Gauge v1.0</span>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item, idx) => {
            const isActive = activeTab === item.label;
            const isClickable = true; // All mapped tabs are fully clickable now!
            return (
              <button 
                key={idx} 
                id={`sidebar-nav-${item.label.toLowerCase()}`}
                onClick={() => {
                  if (isClickable) {
                    setActiveTab(item.label);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer' 
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent cursor-pointer'
                }`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                {item.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>}
              </button>
            );
          })}
        </nav>
        
        <div className="p-5 border-t border-slate-800/60 bg-slate-900/20">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <span className="text-[10px] font-mono text-emerald-500/80 uppercase tracking-widest">System Status: Nominal</span>
          </div>
        </div>
      </aside>

      {/* MAIN DASHBOARD CONTENT */}
      <main className="flex-1 h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 relative" id="main-content-panel">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] mix-blend-overlay pointer-events-none"></div>
        
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 relative z-0">
          
          <header className="mb-8 md:hidden">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TerminalSquare className="w-6 h-6 text-emerald-400" />
                  <span className="font-display font-bold text-lg text-slate-100">KUDBEE Fuel Gauge</span>
                </div>
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button 
                  onClick={() => setActiveTab('Dashboard')}
                  className={`flex-none py-2 px-3 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'Dashboard' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  DASHBOARD
                </button>
                <button 
                  onClick={() => setActiveTab('Interceptor')}
                  className={`flex-none py-2 px-3 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'Interceptor' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  INTERCEPTOR
                </button>
                <button 
                  onClick={() => setActiveTab('Playground')}
                  className={`flex-none py-2 px-3 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'Playground' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  PLAYGROUND
                </button>
                <button 
                  onClick={() => setActiveTab('History')}
                  className={`flex-none py-2 px-3 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'History' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  HISTORY
                </button>
                <button 
                  onClick={() => setActiveTab('Settings')}
                  className={`flex-none py-2 px-3 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'Settings' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  SETTINGS
                </button>
              </div>
            </div>
          </header>

          {/* ACTIVE VIEW ROUTER */}
          {activeTab === 'Dashboard' && (
            <>
              {/* TOP ROW: LIVE TELEMETRY CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TelemetryCard 
                  title="Input Tokens" 
                  value={stats.inTokens.toLocaleString()} 
                  icon={Cpu}
                />
                <TelemetryCard 
                  title="Output Tokens" 
                  value={stats.outTokens.toLocaleString()} 
                  icon={ArrowRightLeft}
                />
                <TelemetryCard 
                  title="Live Pipeline Cost" 
                  value={getFormattedCost(stats.cost, currency, 4)} 
                  icon={DollarSign}
                />
              </div>

              {/* CENTER ROW: MATRIX + HEALTH */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* MODEL COMPARISON MATRIX */}
                <div className="xl:col-span-8 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col overflow-hidden" id="dashboard-matrix">
                  <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40">
                    <h2 className="font-display font-semibold text-slate-200">Execution Matrix</h2>
                    <div className="flex items-center gap-2">
                       <Zap className="w-4 h-4 text-emerald-500/70" />
                       <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Live Routes</span>
                    </div>
                  </div>
                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="text-slate-500 text-[10px] uppercase tracking-widest bg-slate-950/50">
                          <th className="px-6 py-4 font-medium border-b border-slate-800">Model Framework</th>
                          <th className="px-6 py-4 font-medium border-b border-slate-800">Cost / 1M (In|Out)</th>
                          <th className="px-6 py-4 font-medium border-b border-slate-800">Speed Velocity</th>
                          <th className="px-6 py-4 font-medium border-b border-slate-800">Output Quality</th>
                          <th className="px-6 py-4 font-medium border-b border-slate-800 text-right">Route State</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-slate-800/50">
                        {models.map((m, i) => (
                          <tr key={i} className="hover:bg-slate-800/20 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-200">{m.name}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{m.org}</div>
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-300">
                              {getFormattedCost(parseFloat(m.costIn), currency, 2)} <span className="text-slate-600 mx-1">|</span> {getFormattedCost(parseFloat(m.costOut), currency, 2)}
                            </td>
                            <td className="px-6 py-4">
                              <div className="w-24 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                                <div className="absolute top-0 left-0 h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: `${m.speed}%` }}></div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <StarRating rating={m.quality} />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={`inline-flex items-center px-2 py-1 text-[9px] font-mono uppercase tracking-widest rounded border ${
                                m.status === 'ACTIVE' 
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.15)]' 
                                  : 'border-slate-700 bg-slate-800/50 text-slate-400'
                              }`}>
                                {m.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* HEALTH MATRIX QUOTA RING BLOCKS */}
                <div className="xl:col-span-4 grid grid-cols-2 gap-4">
                  {quotas.map((q, i) => (
                    <HealthRing key={i} provider={q.provider} percent={q.percent} offsetMins={q.offsetMins} />
                  ))}
                </div>
              </div>

              {/* BOTTOM ROW: HISTORICAL TIME-SERIES CONTAINER */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                
                <div className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mb-6 flex justify-between items-end">
                  <span>24-Hour Ingestion Trajectory</span>
                  <span className="text-emerald-500/70 border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 rounded">Live Sync</span>
                </div>
                
                <div className="relative h-40 w-full mt-4">
                  <svg viewBox="0 0 800 200" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <line x1="0" y1="50" x2="800" y2="50" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                    <line x1="0" y1="100" x2="800" y2="100" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                    <line x1="0" y1="150" x2="800" y2="150" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                    
                    <path 
                      d="M0,180 L80,160 L160,165 L240,110 L320,120 L400,60 L480,80 L560,95 L640,40 L720,45 L800,20" 
                      fill="none" 
                      stroke="#34d399" 
                      strokeWidth="2" 
                      className="drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" 
                    />
                    
                    <path 
                      d="M0,200 L0,180 L80,160 L160,165 L240,110 L320,120 L400,60 L480,80 L560,95 L640,40 L720,45 L800,20 L800,200 Z" 
                      fill="url(#emerald-gradient)" 
                      opacity="0.15" 
                    />
                    
                    <defs>
                      <linearGradient id="emerald-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>
                    
                    <circle cx="800" cy="20" r="4" fill="#10b981" />
                    <circle cx="800" cy="20" r="8" fill="#10b981" opacity="0.4" className="animate-ping" />
                  </svg>
                </div>
                
                <div className="flex justify-between text-[9px] font-mono text-slate-600 mt-2">
                  <span>-24h</span>
                  <span>-18h</span>
                  <span>-12h</span>
                  <span>-6h</span>
                  <span className="text-emerald-500/70">Now</span>
                </div>
              </div>
            </>
          )}

          {activeTab === 'Interceptor' && <InterceptorView currency={currency} />}
          
          {activeTab === 'Playground' && <PlaygroundView currency={currency} />}

          {activeTab === 'History' && <HistoryView currency={currency} />}

          {activeTab === 'Settings' && <SettingsView currency={currency} setCurrency={setCurrency} />}

          {/* AGGREGATE CORE SUMMARY FOOTER */}
          <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 md:p-6 flex flex-wrap md:flex-nowrap justify-between gap-4 md:gap-8 items-center shadow-lg" id="applet-summary-footer">
            <div className="w-full md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total 24h Cost</div>
              <div className="font-mono text-2xl text-emerald-400">{getFormattedCost(stats.cost * 0.04, currency, 4)}</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total Tokens</div>
              <div className="font-mono text-xl text-slate-200">{(stats.inTokens + stats.outTokens).toLocaleString()}</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total Requests</div>
              <div className="font-mono text-xl text-slate-200">1,482</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Active Models</div>
              <div className="font-mono text-xl text-slate-200">4</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto text-right md:text-left">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Est Monthly Cost</div>
              <div className="font-mono text-xl text-emerald-400/80">{getFormattedCost(stats.cost * 1.25, currency, 2)}</div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
