import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles
} from 'lucide-react';

// --- SUB-COMPONENTS FOR DASHBOARD VIEW ---

function TelemetryCard({ title, value, prefix = "", suffix = "", icon: Icon }: any) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden group">
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

function HealthRing({ provider, percent, offsetMins }: { provider: string, percent: number, offsetMins: number }) {
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
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 flex flex-col items-center relative overflow-hidden">
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

function InterceptorView() {
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
    <div className="space-y-6">
      
      {/* 1. OTel CONFIG GENERATOR */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-semibold text-slate-200 text-lg">Local OpenTelemetry Hook Configuration</h2>
            <p className="text-xs text-slate-500 mt-1">Run these commands in your CLI environment to route local AI executions to the telemetry pipeline.</p>
          </div>
          
          <button 
            onClick={handleCopy}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 border ${
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
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[400px]">
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
          
          {logs.map((log, idx) => (
            <div key={idx} className="space-y-1 py-1 border-b border-slate-950">
              <div className="flex items-center justify-between text-slate-500 text-[10px]">
                <span>{log.timestamp}</span>
                <span className="text-emerald-500/70 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">TRACE OK</span>
              </div>
              <pre className="text-emerald-400/90 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log, null, 2)}
              </pre>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>
      </div>

    </div>
  );
}

// --- NEW COMPONENT: PLAYGROUND VIEW ---

function PlaygroundView() {
  const [payloadText, setPayloadText] = useState(
    `// Sample prompt / code block pipeline telemetry simulation\nconst aiResponse = await anthropic.messages.create({\n  model: "claude-3-5-sonnet",\n  max_tokens: 1024,\n  messages: [{ role: "user", content: "Implement a highly parallel telemetry parser." }]\n});`
  );
  const [selectedModel, setSelectedModel] = useState('Claude 3.5 Sonnet');
  const [singleCap, setSingleCap] = useState(0.05); // Slider cap (ranges from $0.01 to $5.00)
  const [hourlyCapEnabled, setHourlyCapEnabled] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalculation, setLastCalculation] = useState<string | null>(null);

  // Token arithmetic: baseline metric of roughly 1 token per 4 characters
  const charCount = payloadText.length;
  const tokenCount = Math.ceil(charCount / 4);

  // Output token prediction: assume roughly 35% of input token count is returned
  const predictedOutputTokens = Math.ceil(tokenCount * 0.35);

  // Real market rates (Cost per 1M tokens)
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

  // Safety cap violation logic
  const isViolated = selectedCost > singleCap;

  const handleTriggerCalculation = () => {
    setIsCalculating(true);
    setTimeout(() => {
      setIsCalculating(false);
      setLastCalculation(new Date().toLocaleTimeString());
    }, 600);
  };

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: INTERACTIVE CALCULATOR */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col justify-between relative overflow-hidden">
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
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 focus:outline-none focus:border-emerald-500/40 resize-y transition-colors"
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
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex-1 flex flex-col justify-between">
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
                        <span className="font-mono text-sm text-slate-100 font-bold">${c.cost.toFixed(6)}</span>
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
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-6">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h2 className="font-display font-semibold text-slate-200 text-md">Telemetry Threshold Rules</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400">
              <span className="uppercase tracking-wider">Single Request Hard-Cap</span>
              <span className="text-emerald-400 font-bold">${singleCap.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="2.00"
              step="0.01"
              value={singleCap}
              onChange={(e) => setSingleCap(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg appearance-none"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-600">
              <span>$0.01</span>
              <span>$1.00</span>
              <span>$2.00</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800/60">
            <div>
              <span className="block text-xs font-semibold text-slate-200">Hourly Run-Rate Warning</span>
              <span className="block text-[10px] text-slate-500 mt-1">Warn if projected run-rate exceeds quota bounds.</span>
            </div>
            <button
              onClick={() => setHourlyCapEnabled(!hourlyCapEnabled)}
              className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative focus:outline-none ${
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
        }`}>
          {isViolated ? (
            <>
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 animate-bounce" />
              <div>
                <span className="font-semibold block text-sm">Hard-Cap Threshold Violation</span>
                <span className="text-[11px] text-amber-500/80 block mt-0.5">
                  The current telemetry calculation for {selectedModel} (${selectedCost.toFixed(6)}) violates your budget hard-cap limit of ${singleCap.toFixed(2)}. Modify prompt context or route to optimal provider.
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

// --- MAIN APPLICATION ENTRY WITH SIDEBAR ROUTING ---

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');

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
    { icon: Database, label: 'Models' },
    { icon: HeartPulse, label: 'Health Matrix' },
    { icon: History, label: 'History' },
    { icon: Bell, label: 'Alerts' },
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
      <aside className="w-64 border-r border-slate-800/60 bg-slate-950 flex flex-col shrink-0 hidden md:flex z-10">
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
            const isClickable = item.label === 'Dashboard' || item.label === 'Interceptor' || item.label === 'Playground';
            return (
              <button 
                key={idx} 
                onClick={() => {
                  if (isClickable) {
                    setActiveTab(item.label);
                  }
                }}
                disabled={!isClickable}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer' 
                    : isClickable 
                    ? 'text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent cursor-pointer'
                    : 'text-slate-600 border border-transparent cursor-not-allowed opacity-50'
                }`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : isClickable ? 'text-slate-500' : 'text-slate-700'}`} />
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
      <main className="flex-1 h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 relative">
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
              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('Dashboard')}
                  className={`flex-1 py-2 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'Dashboard' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  DASHBOARD
                </button>
                <button 
                  onClick={() => setActiveTab('Interceptor')}
                  className={`flex-1 py-2 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'Interceptor' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  INTERCEPTOR
                </button>
                <button 
                  onClick={() => setActiveTab('Playground')}
                  className={`flex-1 py-2 rounded text-xs font-mono border transition-all cursor-pointer ${activeTab === 'Playground' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-850 bg-slate-900 text-slate-400'}`}
                >
                  PLAYGROUND
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
                  value={stats.cost.toFixed(4)} 
                  prefix="$" 
                  icon={DollarSign}
                />
              </div>

              {/* CENTER ROW: MATRIX + HEALTH */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* MODEL COMPARISON MATRIX */}
                <div className="xl:col-span-8 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
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
                              <span className="text-slate-500">$</span>{m.costIn} <span className="text-slate-600 mx-1">|</span> <span className="text-slate-500">$</span>{m.costOut}
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

          {activeTab === 'Interceptor' && <InterceptorView />}
          
          {activeTab === 'Playground' && <PlaygroundView />}

          {/* AGGREGATE CORE SUMMARY FOOTER */}
          <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 md:p-6 flex flex-wrap md:flex-nowrap justify-between gap-4 md:gap-8 items-center shadow-lg">
            <div className="w-full md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total 24h Cost</div>
              <div className="font-mono text-2xl text-emerald-400">${(stats.cost * 0.04).toFixed(4)}</div>
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
              <div className="font-mono text-xl text-emerald-400/80">${(stats.cost * 1.25).toFixed(2)}</div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
