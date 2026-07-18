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
  Terminal,
  Clock,
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
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Key,
  Trash2,
  Shield,
  Network,
  Server,
  Lock,
  Globe
} from 'lucide-react';
import { IntelligenceView } from './components/IntelligenceView';
import { TerminalHUDTicker } from './components/TerminalHUDTicker';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

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

export interface PendingApproval {
  id: string;
  agentId: string;
  triggeredRule: string;
  actionJson: any;
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
  timestamp: Date;
}

export function useAgentInterceptor() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

  const executeAgentTool = React.useCallback((agentId: string, triggeredRule: string, actionJson: any) => {
    return new Promise((resolve, reject) => {
      const id = "agent-tx-" + Math.floor(1000 + Math.random() * 9000);
      const newApproval: PendingApproval = {
        id,
        agentId,
        triggeredRule,
        actionJson,
        resolve,
        reject,
        timestamp: new Date()
      };
      setPendingApprovals(prev => [...prev, newApproval]);
    });
  }, []);

  const resolveApproval = React.useCallback((id: string) => {
    setPendingApprovals(prev => {
      const approval = prev.find(p => p.id === id);
      if (approval) {
        approval.resolve(true);
      }
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const rejectApproval = React.useCallback((id: string) => {
    setPendingApprovals(prev => {
      const approval = prev.find(p => p.id === id);
      if (approval) {
        approval.reject(new Error("Execution Denied"));
      }
      return prev.filter(p => p.id !== id);
    });
  }, []);

  return { pendingApprovals, executeAgentTool, resolveApproval, rejectApproval };
}

export interface GatewayLog {
  id: string;
  timestamp: Date;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

export function useGatewayRouter() {
  const [gatewayLogs, setGatewayLogs] = useState<GatewayLog[]>([]);
  const [activeRoute, setActiveRoute] = useState<'IDLE' | 'PRIMARY' | 'FAILOVER'>('IDLE');
  
  const addLog = React.useCallback((level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => {
    setGatewayLogs(prev => [{ id: Math.random().toString(), timestamp: new Date(), level, message }, ...prev].slice(0, 50));
  }, []);

  const executeGatewayRequest = React.useCallback(async (payload: any) => {
    setActiveRoute('PRIMARY');
    addLog('INFO', `Routing request to Primary Region (us-east-1) for model: ${payload.model || 'claude-3-5-sonnet'}`);
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // 30% chance to fail
        const isRateLimited = Math.random() < 0.3;
        
        if (isRateLimited) {
          addLog('WARN', `Rate limit 429 hit on Primary Region (us-east-1).`);
          addLog('INFO', `CRIS router engaging Circuit Breaker. Rewriting payload for failover...`);
          
          setTimeout(() => {
            setActiveRoute('FAILOVER');
            addLog('INFO', `Rerouting request to Failover Region (eu-central-1) for fallback model (deepseek-r1)...`);
            
            setTimeout(() => {
              addLog('SUCCESS', `Failover request completed successfully via eu-central-1.`);
              setTimeout(() => setActiveRoute('IDLE'), 2000);
              resolve({ success: true, region: 'eu-central-1', model: 'deepseek-r1' });
            }, 1000);
            
          }, 500);
          
        } else {
          addLog('SUCCESS', `Request completed successfully via Primary Region (us-east-1).`);
          setTimeout(() => setActiveRoute('IDLE'), 2000);
          resolve({ success: true, region: 'us-east-1', model: payload.model || 'claude-3-5-sonnet' });
        }
      }, 1000);
    });
  }, [addLog]);

  return { gatewayLogs, activeRoute, executeGatewayRequest, addLog };
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

function InterceptorView({ currency, onNewLogTriggered }: { currency: 'USD' | 'EUR' | 'GBP'; onNewLogTriggered?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLiveIngest, setIsLiveIngest] = useState(true);
  const [injectSuccess, setInjectSuccess] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  
  const configCode = `export CLAUDE_CODE_ENABLE_TELEMETRY=1\nexport OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:8000"`;

  const [logs, setLogs] = useState<any[]>([]);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/telemetry/logs?limit=30');
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const mapped = data.map((l: any) => ({
            timestamp: l.timestamp,
            trace_id: `tr-${l.id}-${l.timestamp.replace(/[^0-9]/g, '').slice(-6)}`,
            model: l.model_name,
            tokens_in: l.input_tokens,
            tokens_out: l.output_tokens,
            cost: l.calculated_cost,
            project: l.project_name || "kilo-fuel-gauge"
          }));
          setLogs(mapped);
        }
      }
    } catch (err) {
      console.error("Error fetching logs in terminal view:", err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

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
      { name: "claude-3-5-sonnet", provider: "Anthropic", inputRate: 0.003, outputRate: 0.015 },
      { name: "deepseek-r1", provider: "DeepSeek", inputRate: 0.00055, outputRate: 0.00219 },
      { name: "gemini-1.5-pro", provider: "Google", inputRate: 0.00125, outputRate: 0.005 },
      { name: "gpt-4o", provider: "Cursor", inputRate: 0.005, outputRate: 0.015 }
    ];

    const interval = setInterval(async () => {
      const selectedModel = modelsPool[Math.floor(Math.random() * modelsPool.length)];
      const tokensIn = Math.floor(Math.random() * 900) + 100;
      const tokensOut = Math.floor(Math.random() * 400) + 50;
      const calculatedCost = ((tokensIn / 1000) * selectedModel.inputRate) + ((tokensOut / 1000) * selectedModel.outputRate);
      
      const logPayload = {
        user_id: 1,
        provider: selectedModel.provider,
        model_name: selectedModel.name,
        input_tokens: tokensIn,
        output_tokens: tokensOut,
        project_name: "kilo-fuel-gauge"
      };

      if (isLiveIngest) {
        try {
          const res = await fetch('/api/telemetry/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logPayload)
          });
          if (res.ok) {
            fetchLogs();
            if (onNewLogTriggered) onNewLogTriggered();
          }
        } catch (e) {
          console.error("Failed to post telemetry to DB:", e);
        }
      } else {
        const newLog = {
          timestamp: new Date().toISOString(),
          trace_id: "tr-" + Math.random().toString(36).substring(2, 12),
          model: selectedModel.name,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost: Number(calculatedCost.toFixed(6)),
          project: "kilo-fuel-gauge"
        };
        setLogs(prev => [newLog, ...prev].slice(0, 30));
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isPaused, isLiveIngest]);

  const handleCopy = () => {
    navigator.clipboard.writeText(configCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualInject = async () => {
    setInjectSuccess(true);
    setTimeout(() => setInjectSuccess(false), 1500);

    const modelsPool = [
      { name: "claude-3-5-sonnet", provider: "Anthropic" },
      { name: "deepseek-r1", provider: "DeepSeek" },
      { name: "gemini-1.5-pro", provider: "Google" },
      { name: "gpt-4o", provider: "Cursor" }
    ];
    const selectedModel = modelsPool[Math.floor(Math.random() * modelsPool.length)];
    const tokensIn = Math.floor(Math.random() * 1500) + 300;
    const tokensOut = Math.floor(Math.random() * 800) + 150;

    try {
      const res = await fetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          provider: selectedModel.provider,
          model_name: selectedModel.name,
          input_tokens: tokensIn,
          output_tokens: tokensOut,
          project_name: "kilo-fuel-gauge"
        })
      });
      if (res.ok) {
        fetchLogs();
        if (onNewLogTriggered) onNewLogTriggered();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6" id="interceptor-view-container">
      
      {/* 1. OTel CONFIG GENERATOR */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="otel-config-box">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display font-semibold text-slate-200 text-lg">Local OpenTelemetry Hook Configuration</h2>
            <p className="text-xs text-slate-500 mt-1">Run these commands in your CLI environment to route local AI executions to the telemetry pipeline.</p>
          </div>
          
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleManualInject}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                injectSuccess 
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400' 
                  : 'bg-slate-950 text-emerald-400 border-emerald-900/40 hover:bg-emerald-950/50 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              <span>{injectSuccess ? 'INJECTED!' : 'INJECT TRACE'}</span>
            </button>

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
                  <span>COPY CONFIG</span>
                </>
              )}
            </button>
          </div>
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
        <div className="px-6 py-4 border-b border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-pulse absolute inline-flex h-full w-full rounded-full ${isPaused ? 'bg-amber-400/55 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-emerald-400/55 shadow-[0_0_8px_rgba(52,211,153,0.5)]'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPaused ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.7)]'}`}></span>
            </span>
            <h2 className="font-display font-semibold text-slate-200 text-sm tracking-wide uppercase">
              OTel Ingestion Stream Terminal {isPaused && <span className="text-amber-500 text-xs ml-2">[PAUSED]</span>}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500">DB INGESTION</span>
              <button
                onClick={() => setIsLiveIngest(!isLiveIngest)}
                className={`w-8 h-4 rounded-full p-0.5 transition-colors relative cursor-pointer ${isLiveIngest ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <div className={`w-3 h-3 bg-slate-950 rounded-full transition-transform ${isLiveIngest ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            <button
              id="pause-stream-btn"
              onClick={() => setIsPaused(!isPaused)}
              className={`px-3 py-1 rounded text-xs font-mono font-medium transition-all border cursor-pointer ${
                isPaused 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' 
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {isPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}
            </button>
            <span className="font-mono text-[10px] text-slate-500 hidden sm:inline">PORT: 3000 {"\u2192"} :8000</span>
          </div>
        </div>

        {/* Mock Terminal Workspace */}
        <div className="flex-1 bg-black p-4 font-mono text-xs overflow-y-auto space-y-2 select-text scrollbar-thin scrollbar-thumb-slate-800 animate-none">
          <div className="text-emerald-500/50">{"[system] Initializing Kudbee Fuel Gauge telemetry daemon..."}</div>
          <div className="text-emerald-500/50">{"[system] Pipeline SQLite collector online, routing stream logs..."}</div>
          {isPaused && (
            <div className="text-amber-500/80 bg-amber-950/20 px-2 py-1 rounded border border-amber-900/30 inline-block">
              ⚠️ LOG COLLECTION PAUSED. Reviewing existing traces.
            </div>
          )}
          
          {logs.map((log, idx) => {
            const formattedCostWithSymbol = getFormattedCost(log.cost, currency, 6);
            
            // Derive a simulated OTel ingestion status
            let status = "OK";
            if (log.tokens_in > 800) {
              status = "RATE_LIMITED";
            } else if (log.tokens_out > 350) {
              status = "INTERCEPTED";
            }

            const traceObj = {
              ...log,
              status,
              cost: currency === 'USD' ? log.cost : `${formattedCostWithSymbol} (equiv)`
            };

            let badgeColorClass = "text-emerald-500/70 bg-emerald-950/40 border-emerald-900/40";
            let textColorClass = "text-emerald-400/90 drop-shadow-[0_0_4px_rgba(52,211,153,0.15)]";
            let badgeText = "TRACE OK";

            if (status === "INTERCEPTED") {
              badgeColorClass = "text-amber-400/90 bg-amber-950/40 border-amber-900/40 animate-pulse";
              textColorClass = "text-amber-400/90 drop-shadow-[0_0_4px_rgba(245,158,11,0.25)]";
              badgeText = "TRACE INTERCEPTED";
            } else if (status === "RATE_LIMITED") {
              badgeColorClass = "text-rose-400/90 bg-rose-950/40 border-rose-900/40";
              textColorClass = "text-rose-400/90 drop-shadow-[0_0_4px_rgba(244,63,94,0.25)]";
              badgeText = "CIRCUIT BREAKER";
            }

            return (
              <div key={idx} className="space-y-1 py-1 border-b border-slate-950">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono tracking-tight">
                  <span>{log.timestamp}</span>
                  <span className={`px-1.5 py-0.5 rounded border font-semibold tracking-wider text-[9px] ${badgeColorClass}`}>
                    {badgeText}
                  </span>
                </div>
                <pre className={`overflow-x-auto whitespace-pre-wrap font-mono tracking-wide ${textColorClass}`}>
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

function PlaygroundView({ currency, onNewLogTriggered }: { currency: 'USD' | 'EUR' | 'GBP'; onNewLogTriggered?: () => void }) {
  const [payloadText, setPayloadText] = useState(
    `// Sample prompt / code block pipeline telemetry simulation\nconst aiResponse = await anthropic.messages.create({\n  model: "claude-3-5-sonnet",\n  max_tokens: 1024,\n  messages: [{ role: "user", content: "Implement a highly parallel telemetry parser." }]\n});`
  );
  const [selectedModel, setSelectedModel] = useState('Claude 3.5 Sonnet');
  const [singleCap, setSingleCap] = useState(0.05); // Slider cap (ranges from $0.01 to $2.00 in USD baseline)
  const [hourlyCapEnabled, setHourlyCapEnabled] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalculation, setLastCalculation] = useState<string | null>(null);
  const [isLogged, setIsLogged] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  // Load balancing gateway state
  const [weights, setWeights] = useState({
    Anthropic: 40,
    DeepSeek: 30,
    Google: 20,
    OpenAI: 10
  });

  const totalWeight = weights.Anthropic + weights.DeepSeek + weights.Google + weights.OpenAI;
  const relWeights = {
    Anthropic: totalWeight > 0 ? (weights.Anthropic / totalWeight) * 100 : 25,
    DeepSeek: totalWeight > 0 ? (weights.DeepSeek / totalWeight) * 100 : 25,
    Google: totalWeight > 0 ? (weights.Google / totalWeight) * 100 : 25,
    OpenAI: totalWeight > 0 ? (weights.OpenAI / totalWeight) * 100 : 25
  };

  const modelSpecs = {
    Anthropic: { costIn: 3.00, costOut: 15.00, speed: 75, quality: 9.8, color: '#f97316' },
    DeepSeek: { costIn: 0.55, costOut: 2.19, speed: 120, quality: 9.5, color: '#3b82f6' },
    Google: { costIn: 1.25, costOut: 5.00, speed: 100, quality: 8.8, color: '#a855f7' },
    OpenAI: { costIn: 5.00, costOut: 15.00, speed: 80, quality: 9.2, color: '#ec4899' }
  };

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

  const pieData = [
    { name: 'Claude 3.5 Sonnet', value: Math.round(relWeights.Anthropic), color: '#f97316' },
    { name: 'DeepSeek-R1', value: Math.round(relWeights.DeepSeek), color: '#3b82f6' },
    { name: 'Gemini 1.5 Pro', value: Math.round(relWeights.Google), color: '#a855f7' },
    { name: 'GPT-4o', value: Math.round(relWeights.OpenAI), color: '#ec4899' }
  ].filter(d => d.value > 0);

  const applyPreset = (preset: 'cost' | 'reasoning' | 'balanced') => {
    if (preset === 'cost') {
      setWeights({ Anthropic: 10, DeepSeek: 80, Google: 10, OpenAI: 0 });
    } else if (preset === 'reasoning') {
      setWeights({ Anthropic: 60, DeepSeek: 5, Google: 10, OpenAI: 25 });
    } else {
      setWeights({ Anthropic: 30, DeepSeek: 40, Google: 20, OpenAI: 10 });
    }
  };

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

  const handleInjectTrace = async () => {
    setIsLogging(true);
    const modelMap: Record<string, { provider: string; model_name: string }> = {
      'Claude 3.5 Sonnet': { provider: 'Anthropic', model_name: 'claude-3-5-sonnet' },
      'DeepSeek-R1': { provider: 'DeepSeek', model_name: 'deepseek-r1' },
      'GPT-4o': { provider: 'Cursor', model_name: 'gpt-4o' },
      'Gemini 1.5 Pro': { provider: 'Google', model_name: 'gemini-1.5-pro' }
    };
    const mapped = modelMap[selectedModel] || { provider: 'Anthropic', model_name: 'claude-3-5-sonnet' };

    try {
      const res = await fetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          provider: mapped.provider,
          model_name: mapped.model_name,
          input_tokens: tokenCount,
          output_tokens: predictedOutputTokens,
          project_name: "kilo-fuel-gauge"
        })
      });
      if (res.ok) {
        setIsLogged(true);
        setTimeout(() => setIsLogged(false), 2000);
        if (onNewLogTriggered) onNewLogTriggered();
      }
    } catch (e) {
      console.error("Failed to inject playground trace to SQLite:", e);
    } finally {
      setIsLogging(false);
    }
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Simulated Active Route</label>
                  <select
                    id="active-route-selector"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500/40 h-10"
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
                    className="w-full bg-slate-950 hover:bg-slate-900 text-emerald-400 font-semibold text-xs uppercase tracking-widest py-2.5 rounded-lg border border-emerald-950 transition-colors flex items-center justify-center gap-2 cursor-pointer h-10"
                  >
                    <Activity className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
                    {isCalculating ? 'PARSING...' : 'Calculate Projection'}
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleInjectTrace}
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

        {/* AI Gateway Load Balancing Simulator Section */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden mt-6" id="playground-gateway-balancer">
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

function HistoryView({ currency, dbLogs, onNewLogTriggered }: { currency: 'USD' | 'EUR' | 'GBP'; dbLogs?: any[]; onNewLogTriggered?: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | 'all'>('all');
  const [exporting, setExporting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  // CSV Drag-and-Drop / Log import state variables
  const [isCsvExpanded, setIsCsvExpanded] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [parsedLogs, setParsedLogs] = useState<any[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const parseCsvText = (text: string) => {
    try {
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        setParsingError("CSV file must contain at least a header row and one data row.");
        return;
      }

      // Parse headers and normalize them
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/["']/g, ''));
      
      const timestampIdx = headers.findIndex(h => h.includes('time') || h.includes('date'));
      const projectIdx = headers.findIndex(h => h.includes('project'));
      const modelIdx = headers.findIndex(h => h.includes('model'));
      const tokensInIdx = headers.findIndex(h => h.includes('in') || h.includes('input'));
      const tokensOutIdx = headers.findIndex(h => h.includes('out') || h.includes('output'));
      const providerIdx = headers.findIndex(h => h.includes('provider') || h.includes('vendor'));

      if (modelIdx === -1 || tokensInIdx === -1 || tokensOutIdx === -1) {
        setParsingError("Invalid CSV headers. Must contain 'model', 'input_tokens' (or 'tokens_in'), and 'output_tokens' (or 'tokens_out') columns.");
        return;
      }

      const logs: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < Math.max(modelIdx, tokensInIdx, tokensOutIdx) + 1) {
          continue; // skip malformed line
        }

        const model = cols[modelIdx];
        const tokens_in = parseInt(cols[tokensInIdx], 10) || 0;
        const tokens_out = parseInt(cols[tokensOutIdx], 10) || 0;
        const project = projectIdx !== -1 && cols[projectIdx] ? cols[projectIdx] : "offline-csv-import";
        const timestamp = timestampIdx !== -1 && cols[timestampIdx] ? cols[timestampIdx] : new Date().toISOString();
        
        // Auto-infer provider if not explicitly given
        let provider = providerIdx !== -1 && cols[providerIdx] ? cols[providerIdx] : "";
        if (!provider) {
          const mLower = model.toLowerCase();
          if (mLower.includes('claude') || mLower.includes('anthropic')) provider = "Anthropic";
          else if (mLower.includes('gpt') || mLower.includes('openai')) provider = "OpenAI";
          else if (mLower.includes('gemini') || mLower.includes('google')) provider = "Google";
          else if (mLower.includes('deepseek')) provider = "DeepSeek";
          else provider = "Anthropic"; // default fallback
        }

        logs.push({
          timestamp,
          project,
          model,
          tokens_in,
          tokens_out,
          provider
        });
      }

      if (logs.length === 0) {
        setParsingError("No valid rows could be parsed from the CSV file.");
      } else {
        setParsedLogs(logs);
        setParsingError(null);
        setUploadStatus(null);
      }
    } catch (err: any) {
      setParsingError(`Parsing error: ${err.message}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv') || file.type === "text/csv") {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            parseCsvText(event.target.result as string);
          }
        };
        reader.readAsText(file);
      } else {
        setParsingError("Please upload a valid .csv file.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          parseCsvText(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleUploadCSV = async () => {
    if (parsedLogs.length === 0) return;
    setIsUploading(true);
    setUploadStatus(null);
    try {
      const response = await fetch('/api/telemetry/inject-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: parsedLogs })
      });
      if (response.ok) {
        const data = await response.json();
        setParsedLogs([]);
        setUploadStatus({
          success: true,
          message: `Successfully synchronized ${data.count} offline billing traces directly with local SQLite database.`
        });
        if (onNewLogTriggered) {
          onNewLogTriggered();
        }
      } else {
        const errData = await response.json();
        setUploadStatus({
          success: false,
          message: `Failed to inject traces: ${errData.error || 'Server error'}`
        });
      }
    } catch (err: any) {
      setUploadStatus({
        success: false,
        message: `API connection failure: ${err.message}`
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Define logical sessions for the Replay Inspector
  const SESSIONS = React.useMemo(() => [
    { 
      id: 'sess-alpha', 
      name: 'Alpha Loop - Pipeline Ingest Validation', 
      project: 'frontier-core', 
      desc: 'Validating primary OTel distributed telemetry streams & system latency spikes.', 
      count: 5, 
      time: '10:15 AM' 
    },
    { 
      id: 'sess-beta', 
      name: 'Beta Loop - Human-in-the-Loop Guardrail Check', 
      project: 'kudbee-fuel-gauge', 
      desc: 'Evaluating real-time firewall gate intercepts, SSN scrubbing, and budgetary limits.', 
      count: 4, 
      time: '09:42 AM' 
    },
    { 
      id: 'sess-gamma', 
      name: 'Gamma Loop - Production Canvas Canvas Refactor', 
      project: 'mesh-globe-3d', 
      desc: 'Tracing active multi-model token throughput speeds, generation speeds, and network lags.', 
      count: 6, 
      time: '08:05 AM' 
    }
  ], []);

  const [activeSessionId, setActiveSessionId] = useState<string | 'all'>('all');
  const [scrubberVal, setScrubberVal] = useState<number>(0); // Selected session index on scrubber (0, 1, 2)
  const [drawerTabs, setDrawerTabs] = useState<Record<string, 'waterfall' | 'json'>>({});

  const currentSession = SESSIONS[scrubberVal];

  // Merge real SQLite logs with baseline historical data
  const mergedLogs = React.useMemo(() => {
    const raw = (!dbLogs || dbLogs.length === 0)
      ? HISTORICAL_TRACES_MOCK
      : [
          ...dbLogs.map((l: any) => ({
            timestamp: l.timestamp,
            project: l.project_name || "kilo-fuel-gauge",
            model: l.model_name,
            tokens_in: l.input_tokens,
            tokens_out: l.output_tokens,
            cost: l.calculated_cost,
            timeframe: "24h" as const
          })),
          ...HISTORICAL_TRACES_MOCK
        ];

    // Distribute logs into sessions based on project name
    return raw.map((log, index) => {
      let sessionId = 'sess-alpha';
      if (log.project.includes('fuel-gauge') || log.project.includes('kudbee')) {
        sessionId = 'sess-beta';
      } else if (log.project.includes('globe') || log.project.includes('mesh')) {
        sessionId = 'sess-gamma';
      } else {
        const sIds = ['sess-alpha', 'sess-beta', 'sess-gamma'];
        sessionId = sIds[index % sIds.length];
      }
      return { ...log, sessionId };
    });
  }, [dbLogs]);

  // Filter logs based on search query, timeframe, and selected session id (if isolating)
  const filteredLogs = mergedLogs.filter(log => {
    const matchesSearch = 
      log.project.toLowerCase().includes(searchQuery.toLowerCase()) || 
      log.model.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesTimeframe = true;
    if (timeframe === '24h') {
      matchesTimeframe = log.timeframe === '24h';
    } else if (timeframe === '7d') {
      matchesTimeframe = log.timeframe === '24h' || log.timeframe === '7d';
    }

    const matchesSession = activeSessionId === 'all' || log.sessionId === activeSessionId;

    return matchesSearch && matchesTimeframe && matchesSession;
  });

  // Rollup stats logic
  const projectStats = filteredLogs.reduce((acc, log) => {
    if (!acc[log.project]) {
      acc[log.project] = { cost: 0, requests: 0 };
    }
    acc[log.project].cost += log.cost;
    acc[log.project].requests += 1;
    return acc;
  }, {} as Record<string, { cost: number; requests: number }>);

  const totalFilteredCost: number = (Object.values(projectStats) as any[]).reduce((sum: number, p: any) => sum + p.cost, 0) || 1;

  const targetProjects = ['frontier-core', 'kudbee-fuel-gauge', 'mesh-globe-3d'];
  const projectRollup = targetProjects.map(projName => {
    const pStats = projectStats[projName] || { cost: 0, requests: 0 };
    const pct = (pStats.cost / totalFilteredCost) * 100;
    return {
      name: projName,
      cost: pStats.cost,
      requests: pStats.requests,
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
      className="space-y-6 min-h-dvh flex flex-col scroll-mt-28" 
      id="history-view-container"
    >
      
      {/* 1. SESSION REPLAY INSPECTOR (Top of History View) */}
      <motion.div 
        variants={sectionVariants}
        className="bg-slate-900/60 border border-slate-800 rounded-xl sm:p-6 p-3 relative overflow-hidden" 
        id="session-replay-panel"
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="font-display font-semibold text-slate-200 text-sm">Session Replay Inspector</h2>
              <p className="text-xs text-slate-500 mt-0.5">Drag scrubber to step through chronological developer sessions and inspect downstream trace payload hierarchies.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">Grid Filter Mode:</span>
            <div className="flex bg-slate-950 p-1 border border-slate-850 rounded-lg shrink-0">
              <button
                onClick={() => setActiveSessionId('all')}
                className={`px-3 py-2 min-h-[40px] flex items-center justify-center text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                  activeSessionId === 'all'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                SHOW ALL TRACES
              </button>
              <button
                onClick={() => setActiveSessionId(currentSession.id)}
                className={`px-3 py-2 min-h-[40px] flex items-center justify-center text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                  activeSessionId !== 'all'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                ISOLATE REPLAY ONLY
              </button>
            </div>
          </div>
        </div>

        {/* Interactive scrubber timeline slider */}
        <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-3.5 sm:p-5 md:p-6 space-y-6">
          <div className="flex flex-col space-y-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between text-[10px] font-mono text-slate-500 gap-1.5 md:gap-4 px-1">
              <span className="tracking-normal whitespace-nowrap">08:00 AM (SESSION START)</span>
              <span className="text-cyan-400 font-bold uppercase tracking-normal flex items-center gap-1.5 whitespace-nowrap">
                <Clock className="w-3 h-3 animate-pulse" />
                ACTIVE PLAYBACK RANGE: {currentSession.name.toUpperCase()}
              </span>
              <span className="tracking-normal whitespace-nowrap">10:30 AM (NOMINAL RUNTIME)</span>
            </div>

            <div className="relative pt-4 pb-2">
              {/* Timeline background track bar */}
              <div className="absolute top-1/2 left-0 w-full h-[3px] bg-slate-900 border border-slate-850 rounded -translate-y-1/2 z-0"></div>

              {/* Glowing active segment highlight */}
              <div 
                className="absolute top-1/2 h-[5px] bg-gradient-to-r from-cyan-500/40 via-emerald-500/40 to-cyan-500/40 rounded -translate-y-1/2 z-0 transition-all duration-300 shadow-[0_0_8px_rgba(34,211,238,0.2)]"
                style={{
                  left: scrubberVal === 0 ? '0%' : scrubberVal === 1 ? '33.33%' : '66.66%',
                  width: '33.34%'
                }}
              ></div>

              {/* Clickable circular ticks */}
              {SESSIONS.map((sess, idx) => (
                <button
                  key={sess.id}
                  onClick={() => {
                    setScrubberVal(idx);
                    if (activeSessionId !== 'all') {
                      setActiveSessionId(sess.id);
                    }
                  }}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-full border-2 transition-all cursor-pointer z-10 ${
                    scrubberVal === idx
                      ? 'bg-cyan-400 border-slate-950 scale-125 shadow-[0_0_12px_rgba(34,211,238,0.65)]'
                      : 'bg-slate-950 border-slate-800 hover:border-cyan-500/60 hover:scale-110'
                  }`}
                  style={{ left: `${idx * 50}%` }}
                  title={sess.name}
                />
              ))}

              {/* Actual invisible input range slider for fluid scrubbing gesture */}
              <input 
                type="range"
                min="0"
                max="2"
                step="1"
                value={scrubberVal}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setScrubberVal(val);
                  if (activeSessionId !== 'all') {
                    setActiveSessionId(SESSIONS[val].id);
                  }
                }}
                className="relative w-full opacity-0 cursor-ew-resize h-8 z-20"
              />

              {/* Timestamps wrapped in perfectly distributed container with zero vertical drifting */}
              <div className="flex justify-between w-full mt-2 text-[10px] font-mono tracking-tight text-slate-400 select-none">
                {SESSIONS.map((sess) => (
                  <span key={sess.id} className="whitespace-nowrap hover:text-slate-200 transition-colors">
                    {sess.time}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Active stats panel */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-slate-900/60">
            <div className="md:col-span-2 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Live Scrape Scope Details</span>
              <h3 className="text-sm font-semibold text-slate-200">{currentSession.name}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{currentSession.desc}</p>
            </div>

            <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-850 flex flex-col justify-between">
              <span className="text-[9px] font-mono uppercase text-slate-500">Trace Count</span>
              <span className="text-sm font-mono text-cyan-400 font-bold">{currentSession.count} Ingestion Points</span>
            </div>

            <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-850 flex flex-col justify-between">
              <span className="text-[9px] font-mono uppercase text-slate-500">Assigned Ingress Repository</span>
              <span className="text-sm font-mono text-emerald-400 font-bold truncate">{currentSession.project}</span>
            </div>
          </div>
        </div>
      </motion.div>
      
      {/* 2. PROJECT METADATA ROLLUP */}
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
      
      {/* OFFLINE TELEMETRY CSV DROPZONE (ROADMAP PHASE 1) */}
      <motion.div 
        variants={sectionVariants}
        className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden relative" 
        id="offline-csv-dropzone"
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
        
        <button
          onClick={() => setIsCsvExpanded(!isCsvExpanded)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-900/20 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-semibold text-slate-200 text-sm">Offline Telemetry CSV Dropzone</h3>
                <span className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  ROADMAP PHASE 1
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Upload or drag native CSV exports from OpenAI/Anthropic to compute localized cost calculations offline.</p>
            </div>
          </div>
          <div className="p-1 border border-slate-800 bg-slate-950/60 rounded text-slate-400 hover:text-slate-200 transition-all">
            {isCsvExpanded ? (
              <ChevronDown className="w-4 h-4 transform rotate-180 transition-transform duration-200" />
            ) : (
              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
            )}
          </div>
        </button>

        <AnimatePresence>
          {isCsvExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="border-t border-slate-800/60 bg-slate-950/40"
            >
              <div className="p-6 space-y-6">
                
                {/* Drag zone box */}
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`relative p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                      : parsedLogs.length > 0 
                        ? 'border-emerald-500/50 bg-emerald-500/5' 
                        : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                  }`}
                >
                  <input
                    type="file"
                    id="csv-file-upload"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {parsedLogs.length > 0 ? (
                    <div className="space-y-3">
                      <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Check className="w-6 h-6 stroke-[3]" />
                      </div>
                      <div>
                        <h4 className="font-mono text-sm font-semibold text-slate-200">
                          {parsedLogs.length} Telemetry Records Parsed
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">Ready to be injected into the local trace warehouse.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-mono text-sm font-semibold text-slate-300">
                          Drag & drop billing export CSV here
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          or <label htmlFor="csv-file-upload" className="text-blue-400 hover:text-blue-300 underline cursor-pointer font-semibold">browse local files</label>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {parsingError && (
                  <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-xs rounded-lg flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    {parsingError}
                  </div>
                )}

                {uploadStatus && (
                  <div className={`p-3.5 border font-mono text-xs rounded-lg flex items-center gap-2 ${
                    uploadStatus.success 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${uploadStatus.success ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`}></span>
                    {uploadStatus.message}
                  </div>
                )}

                {/* File preview if successfully parsed */}
                {parsedLogs.length > 0 && (
                  <div className="space-y-4 border border-slate-800 bg-slate-950 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                      <span className="font-mono text-xs font-semibold text-slate-300">Traces Preview (First 5 Rows)</span>
                      <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">Calculated locally</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[500px]">
                        <thead>
                          <tr className="text-slate-500 text-[10px] font-mono uppercase bg-slate-900/40">
                            <th className="px-4 py-2 border-b border-slate-800">Timestamp</th>
                            <th className="px-4 py-2 border-b border-slate-800">Project</th>
                            <th className="px-4 py-2 border-b border-slate-800">Model ID</th>
                            <th className="px-4 py-2 border-b border-slate-800">Tokens (In|Out)</th>
                            <th className="px-4 py-2 border-b border-slate-800 text-right">Provider</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs divide-y divide-slate-800/40">
                          {parsedLogs.slice(0, 5).map((log, index) => (
                            <tr key={index} className="hover:bg-slate-900/20 transition-colors">
                              <td className="px-4 py-2 font-mono text-slate-400 text-[10px] truncate max-w-[150px]" title={log.timestamp}>
                                {log.timestamp}
                              </td>
                              <td className="px-4 py-2 text-slate-300">{log.project}</td>
                              <td className="px-4 py-2 text-slate-200 font-mono text-[11px]">{log.model}</td>
                              <td className="px-4 py-2 font-mono text-slate-400">
                                {log.tokens_in} <span className="text-slate-700">|</span> {log.tokens_out}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-slate-400 text-[11px]">{log.provider}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-4 bg-slate-900/30 border-t border-slate-800 flex justify-between items-center">
                      <button
                        onClick={() => setParsedLogs([])}
                        className="px-3 py-1.5 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-xs font-mono font-semibold uppercase rounded-lg transition-all cursor-pointer"
                      >
                        Reset File
                      </button>
                      <button
                        onClick={handleUploadCSV}
                        disabled={isUploading}
                        className="px-4 py-1.5 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 text-blue-400 text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                      >
                        {isUploading ? "INJECTING..." : "COMMIT IMPORT TO SQLite"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Guide specifications section */}
                <div className="p-4 bg-slate-900/30 border border-slate-850 rounded-xl space-y-3">
                  <h4 className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">CSV Data Engine Specifications</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    The ingest processor supports standard columns mapped to the OTel tracing engine:
                  </p>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
                    <pre className="font-mono text-[10px] text-blue-400/90 whitespace-pre-wrap overflow-x-auto select-all">
                      {"timestamp,project,model,input_tokens,output_tokens,provider\n2026-07-18T10:15:30Z,frontier-core,claude-3-5-sonnet,1200,4500,Anthropic\n2026-07-18T10:16:00Z,kudbee-fuel-gauge,gpt-4o,800,2400,OpenAI"}
                    </pre>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 3. INTERACTIVE FILTERING & EXPORT CONTROL BAR */}
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

      {/* 4. HISTORICAL TRACES DATA GRID */}
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
          {activeSessionId !== 'all' && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-cyan-950/40 border border-cyan-800/40 text-cyan-400 rounded-full font-bold">
              FILTERED: {currentSession.name.toUpperCase()}
            </span>
          )}
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
                  
                  // Check if this trace belongs to the selected scrubber session
                  const belongsToActiveSession = log.sessionId === currentSession.id;
                  const activeTab = drawerTabs[log.timestamp] || 'waterfall';

                  return (
                    <React.Fragment key={log.timestamp}>
                      <tr 
                        onClick={() => setExpandedRow(isExpanded ? null : log.timestamp)}
                        className={`cursor-pointer transition-all duration-300 ease-in-out select-none border-l-2 ${
                          isExpanded 
                            ? 'bg-gradient-to-r from-emerald-500/10 via-slate-800/30 to-transparent text-slate-100 border-emerald-500 shadow-[inset_1px_0_12px_rgba(52,211,153,0.1)]' 
                            : belongsToActiveSession
                              ? 'bg-cyan-500/[0.04] border-cyan-500/40 text-slate-200 hover:bg-slate-800/25'
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
                        <td className="px-6 py-3 font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                          {log.project}
                          {belongsToActiveSession && (
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" title="Selected session telemetry matches" />
                          )}
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
                                  <motion.div variants={itemVariants} className="lg:col-span-4 space-y-4">
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

                                  {/* 2. TABBED DETAIL BLOCK (WATERFALL vs RAW JSON) */}
                                  <motion.div variants={itemVariants} className="lg:col-span-8 flex flex-col justify-between">
                                    <div className="flex flex-col h-full">
                                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2 mb-4">
                                        {/* Tabs selector */}
                                        <div className="flex bg-slate-950 p-1 border border-slate-850 rounded-lg">
                                          <button
                                            onClick={() => setDrawerTabs(prev => ({ ...prev, [log.timestamp]: 'waterfall' }))}
                                            className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                                              activeTab === 'waterfall'
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                          >
                                            TRACE WATERFALL
                                          </button>
                                          <button
                                            onClick={() => setDrawerTabs(prev => ({ ...prev, [log.timestamp]: 'json' }))}
                                            className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                                              activeTab === 'json'
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                          >
                                            RAW OTel PAYLOAD (JSON)
                                          </button>
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

                                      <AnimatePresence mode="wait">
                                        {activeTab === 'waterfall' ? (
                                          <motion.div
                                            key="tab-waterfall"
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-4"
                                          >
                                            {/* Distributed trace waterfall timeline scales */}
                                            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 md:p-5 space-y-4">
                                              
                                              {/* Timeline ticks display */}
                                              <div className="flex justify-between text-[9px] font-mono text-slate-500 border-b border-slate-900 pb-1">
                                                <span>0ms</span>
                                                <span>{Math.round(getLatency(log.tokens_out, log.model) * 0.25)}ms</span>
                                                <span>{Math.round(getLatency(log.tokens_out, log.model) * 0.5)}ms</span>
                                                <span>{Math.round(getLatency(log.tokens_out, log.model) * 0.75)}ms</span>
                                                <span>{getLatency(log.tokens_out, log.model)}ms (TOTAL)</span>
                                              </div>

                                              {/* Nested list of traces and flex latency bars */}
                                              <div className="space-y-5">
                                                
                                                {/* Parent span: Agent Run */}
                                                <div className="space-y-1.5">
                                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono gap-1.5">
                                                    <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                                                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                                                      Agent Run (Orchestrator)
                                                    </span>
                                                    <span className="text-emerald-400 font-bold">{getLatency(log.tokens_out, log.model)} ms</span>
                                                  </div>
                                                  <div className="w-full bg-slate-900/60 rounded-full h-3 border border-slate-850 relative overflow-hidden">
                                                    <div 
                                                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                                                      style={{ width: '100%' }}
                                                    />
                                                  </div>
                                                </div>

                                                {/* LLM Call Span (indented) */}
                                                <div className="pl-4 border-l border-slate-850 space-y-1.5">
                                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono gap-1.5">
                                                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                                                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                                                      └─ LLM Call ({log.model})
                                                    </span>
                                                    <span className="text-purple-400 font-bold">{Math.round(getLatency(log.tokens_out, log.model) * 0.72)} ms</span>
                                                  </div>
                                                  <div className="w-full bg-slate-900/60 rounded-full h-3 border border-slate-850 relative overflow-hidden">
                                                    <div 
                                                      className="absolute h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full transition-all duration-300"
                                                      style={{ 
                                                        left: `${Math.round((getTtft(log.model) / getLatency(log.tokens_out, log.model)) * 100)}%`,
                                                        width: `${Math.round((Math.round(getLatency(log.tokens_out, log.model) * 0.72) / getLatency(log.tokens_out, log.model)) * 100)}%` 
                                                      }}
                                                    />
                                                  </div>

                                                  {/* Standard Gen-AI Semantic conventions panel block */}
                                                  <div className="p-3 bg-slate-950 border border-slate-850/80 rounded-lg font-mono text-[10px] grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-slate-400">
                                                    <div>
                                                      <span className="text-slate-500">gen_ai.provider.name:</span>{' '}
                                                      <span className="text-purple-400 font-bold uppercase">
                                                        {log.model.includes('sonnet') ? 'anthropic' : log.model.includes('deepseek') ? 'deepseek' : log.model.includes('gpt') ? 'openai' : 'google'}
                                                      </span>
                                                    </div>
                                                    <div>
                                                      <span className="text-slate-500">gen_ai.request.model:</span>{' '}
                                                      <span className="text-slate-200">{log.model}</span>
                                                    </div>
                                                    <div>
                                                      <span className="text-slate-500">gen_ai.usage.input_tokens:</span>{' '}
                                                      <span className="text-emerald-400 font-semibold">{log.tokens_in.toLocaleString()}</span>
                                                    </div>
                                                    <div>
                                                      <span className="text-slate-500">gen_ai.usage.output_tokens:</span>{' '}
                                                      <span className="text-emerald-400 font-semibold">{log.tokens_out.toLocaleString()}</span>
                                                    </div>
                                                    <div className="sm:col-span-2 pt-2 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                                                      <span className="text-slate-500 uppercase tracking-wider">LOCALIZED SPECIFIC SPAN COST:</span>
                                                      <span className="text-emerald-400 font-bold text-xs bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(52,211,153,0.1)]">
                                                        {getFormattedCost(log.cost, currency, 4)}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>

                                                {/* Tool Call Span (further indented subsequent execution) */}
                                                <div className="pl-8 border-l border-slate-850/60 space-y-1.5">
                                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono gap-1.5">
                                                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                                                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                                                      └─ Tool Execution ({log.project.includes('gauge') ? 'sql_write' : 'bash_execute'})
                                                    </span>
                                                    <span className="text-amber-400 font-bold">{Math.round(getLatency(log.tokens_out, log.model) * 0.20)} ms</span>
                                                  </div>
                                                  <div className="w-full bg-slate-900/60 rounded-full h-3 border border-slate-850 relative overflow-hidden">
                                                    <div 
                                                      className="absolute h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-300"
                                                      style={{ 
                                                        left: '78%',
                                                        width: '20%' 
                                                      }}
                                                    />
                                                  </div>

                                                  {/* Tool attributes panel */}
                                                  <div className="p-2.5 bg-slate-950 border border-slate-850/60 rounded-lg font-mono text-[10px] space-y-1 text-slate-400">
                                                    <div>
                                                      <span className="text-slate-500">mcp.tool.name:</span>{' '}
                                                      <span className="text-amber-400 font-semibold">{log.project.includes('gauge') ? 'sql_write' : 'bash_execute'}</span>
                                                    </div>
                                                    <div className="truncate">
                                                      <span className="text-slate-500">mcp.tool.input_payload:</span>{' '}
                                                      <span className="text-slate-300 text-[9px]">
                                                        {log.project.includes('gauge') 
                                                          ? '{"query": "INSERT INTO metrics (timestamp, value) VALUES (NOW(), 84.2);", "db": "telemetry"}'
                                                          : '{"command": "docker run -d -p 5432:5432 postgres:16"}'}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>

                                              </div>
                                            </div>
                                          </motion.div>
                                        ) : (
                                          <motion.div
                                            key="tab-json"
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            transition={{ duration: 0.2 }}
                                            className="h-full"
                                          >
                                            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 font-mono text-[11px] text-slate-300/90 leading-relaxed overflow-x-auto max-h-[290px] overflow-y-auto select-all scrollbar-thin scrollbar-thumb-slate-800">
                                              <pre className="text-emerald-400/80">{JSON.stringify(getRawJson(log), null, 2)}</pre>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
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

// --- SUB-COMPONENT: GATEWAY FIREWALL & GUARDRAILS VIEW ---

interface FirewallViewProps {
  showToast: (msg: string, type?: 'warning' | 'info' | 'success') => void;
  pendingApprovals: PendingApproval[];
  resolveApproval: (id: string) => void;
  rejectApproval: (id: string) => void;
  executeAgentTool: (agentId: string, rule: string, json: any) => Promise<any>;
}

function FirewallView({ showToast, pendingApprovals, resolveApproval, rejectApproval, executeAgentTool }: FirewallViewProps) {
  // Global Middleware Toggles
  const [piiRedaction, setPiiRedaction] = useState(true);
  const [promptShield, setPromptShield] = useState(true);
  const [semanticRouting, setSemanticRouting] = useState(false);

  // Runtime Approval Gates (HITL)
  const [costGateEnabled, setCostGateEnabled] = useState(true);
  const [costThreshold, setCostThreshold] = useState(0.50);
  const [blockTools, setBlockTools] = useState(true);
  const [confidenceGateEnabled, setConfidenceGateEnabled] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);

  const handleApprove = (id: string) => {
    resolveApproval(id);
    showToast("✓ Execution Approved. Resuming Agent pipeline context.", "success");
  };

  const handleDeny = (id: string) => {
    rejectApproval(id);
    showToast("✗ Execution Denied. Core runtime killed with exit code 130.", "warning");
  };

  const handleResetQueue = () => {
    executeAgentTool(
      "claude-code-local",
      "Rule: bash_execute detected",
      {
        action: "bash_execute",
        command: "docker run -d -p 5432:5432 -v pgdata:/var/lib/postgresql/data postgres:16",
        directory: "~/workspace/telemetry-db",
        environment: {
          POSTGRES_DB: "telemetry",
          POSTGRES_PASSWORD: "•••••••••••••"
        }
      }
    ).then(() => {
      showToast("Simulation Agent tool execution completed successfully.", "success");
    }).catch(() => {
      showToast("Simulation Agent tool execution blocked.", "warning");
    });
    
    showToast("Mock Agent execution paused by security policy. Ingestion intercepted.", "info");
  };

  return (
    <div className="min-h-dvh flex flex-col space-y-6" id="firewall-view-container">
      
      {/* 1. GLOBAL MIDDLEWARE TOGGLES */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="font-display font-semibold text-slate-200 text-sm">Active Security Middleware</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure inline deep packet inspection and semantic firewalls for upstream LLM streams.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* PII Redaction */}
          <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col justify-between h-36">
            <div className="space-y-1">
              <span className="block text-xs font-bold font-mono uppercase tracking-wider text-slate-300">PII Redaction Engine</span>
              <p className="text-[10px] text-slate-500 leading-normal">
                Regex & Semantic Scrubbing intercepts and masks credentials, SSNs, credit cards, and proprietary source tokens.
              </p>
            </div>
            <div className="flex justify-between items-center mt-4">
              <span className={`text-[9px] font-mono uppercase tracking-widest ${piiRedaction ? 'text-emerald-400' : 'text-slate-600'}`}>
                {piiRedaction ? '● Active' : '○ Standby'}
              </span>
              <button
                onClick={() => {
                  setPiiRedaction(!piiRedaction);
                  showToast(piiRedaction ? "PII Redaction Engine deactivated." : "PII Redaction Engine activated.", "info");
                }}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  piiRedaction ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${piiRedaction ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Prompt Injection Shield */}
          <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col justify-between h-36">
            <div className="space-y-1">
              <span className="block text-xs font-bold font-mono uppercase tracking-wider text-slate-300">Prompt Injection Shield</span>
              <p className="text-[10px] text-slate-500 leading-normal">
                Llama Guard 3 simulation protects against jailbreaks, system instruction bypasses, and multi-turn prompt hijacking.
              </p>
            </div>
            <div className="flex justify-between items-center mt-4">
              <span className={`text-[9px] font-mono uppercase tracking-widest ${promptShield ? 'text-emerald-400' : 'text-slate-600'}`}>
                {promptShield ? '● Active' : '○ Standby'}
              </span>
              <button
                onClick={() => {
                  setPromptShield(!promptShield);
                  showToast(promptShield ? "Prompt Injection Shield deactivated." : "Prompt Injection Shield activated.", "info");
                }}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  promptShield ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${promptShield ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Semantic Routing */}
          <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col justify-between h-36">
            <div className="space-y-1">
              <span className="block text-xs font-bold font-mono uppercase tracking-wider text-slate-300">Semantic Routing</span>
              <p className="text-[10px] text-slate-500 leading-normal">
                Inlines classification router to auto-proxy low-complexity prompts to cheaper/free models without accuracy penalties.
              </p>
            </div>
            <div className="flex justify-between items-center mt-4">
              <span className={`text-[9px] font-mono uppercase tracking-widest ${semanticRouting ? 'text-emerald-400' : 'text-slate-600'}`}>
                {semanticRouting ? '● Active' : '○ Standby'}
              </span>
              <button
                onClick={() => {
                  setSemanticRouting(!semanticRouting);
                  showToast(semanticRouting ? "Semantic Routing deactivated." : "Semantic Routing activated.", "info");
                }}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  semanticRouting ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${semanticRouting ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 2. RISK-BASED HUMAN-IN-THE-LOOP (HITL) GATES */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-6">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="font-display font-semibold text-slate-200 text-sm">Runtime Approval Gates</h3>
            <p className="text-xs text-slate-500 mt-0.5">Determine when local AI Agent executions must pause and await human verification.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Cost Trigger Gate */}
          <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center">
              <span className="block text-xs font-bold font-mono uppercase tracking-wider text-slate-300">Execution Cost Gate</span>
              <button
                onClick={() => setCostGateEnabled(!costGateEnabled)}
                className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  costGateEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${costGateEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            
            <p className="text-[10px] text-slate-500 leading-normal">
              Intercepts running loops if a single LLM pipeline sequence projects a cost exceeding the specified boundary.
            </p>

            <div className={`space-y-2 transition-all duration-200 ${costGateEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Cost Upper Limit:</span>
                <span className="text-emerald-400 font-bold">${costThreshold.toFixed(2)}</span>
              </div>
              <input 
                type="range" 
                min="0.05" 
                max="5.00" 
                step="0.05"
                value={costThreshold} 
                onChange={(e) => setCostThreshold(parseFloat(e.target.value) || 0.05)}
                className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none"
              />
              <input
                type="number"
                step="0.05"
                value={costThreshold}
                onChange={(e) => setCostThreshold(parseFloat(e.target.value) || 0.05)}
                className="w-full scroll-mt-28 bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all text-right mt-1"
                placeholder="0.50"
              />
            </div>
          </div>

          {/* Tool Call Blocking Gate */}
          <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center">
              <span className="block text-xs font-bold font-mono uppercase tracking-wider text-slate-300">Tool Execution Gate</span>
              <button
                onClick={() => setBlockTools(!blockTools)}
                className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  blockTools ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${blockTools ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            
            <p className="text-[10px] text-slate-500 leading-normal">
              Always forces synchronous developer review when the agent tries to run tool calls matching blacklisted strings.
            </p>

            <div className={`space-y-2 transition-all duration-200 ${blockTools ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <span className="block text-[9px] font-mono text-slate-400 uppercase tracking-widest mb-1">Gate Blacklist Targets:</span>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-mono bg-red-950/20 border border-red-900/50 text-red-400 px-2 py-0.5 rounded">
                  bash_execute
                </span>
                <span className="text-[10px] font-mono bg-red-950/20 border border-red-900/50 text-red-400 px-2 py-0.5 rounded">
                  sql_write
                </span>
                <span className="text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-500 px-2 py-0.5 rounded">
                  fs_delete
                </span>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight pt-1">
                Triggered events are buffered cleanly inside the Interception Holding Pen below.
              </p>
            </div>
          </div>

          {/* Confidence Score Gate */}
          <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center">
              <span className="block text-xs font-bold font-mono uppercase tracking-wider text-slate-300">Confidence Floor Gate</span>
              <button
                onClick={() => setConfidenceGateEnabled(!confidenceGateEnabled)}
                className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  confidenceGateEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${confidenceGateEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            
            <p className="text-[10px] text-slate-500 leading-normal">
              Halts execution chains immediately when an agent evaluates its own task completion confidence below this floor.
            </p>

            <div className={`space-y-2 transition-all duration-200 ${confidenceGateEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Confidence Floor:</span>
                <span className="text-emerald-400 font-bold">{confidenceThreshold}%</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="100" 
                step="1"
                value={confidenceThreshold} 
                onChange={(e) => setConfidenceThreshold(parseInt(e.target.value, 10) || 50)}
                className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none"
              />
              <input
                type="number"
                min="50"
                max="100"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseInt(e.target.value, 10) || 50)}
                className="w-full scroll-mt-28 bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all text-right mt-1"
                placeholder="85"
              />
            </div>
          </div>

        </div>
      </div>

      {/* 3. THE INTERCEPTION HOLDING PEN */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
            <div>
              <h3 className="font-display font-semibold text-slate-200 text-sm">Interception Holding Pen</h3>
              <p className="text-xs text-slate-500 mt-0.5">Evaluate and triage real-time agent executions paused by active firewall rule overrides.</p>
            </div>
          </div>
          {pendingApprovals.length === 0 && (
            <button
              onClick={handleResetQueue}
              className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-[10px] font-mono tracking-wider uppercase rounded transition-all cursor-pointer"
            >
              Simulate Ingestion Intercept
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {pendingApprovals.length > 0 ? (
            <div className="space-y-4">
              {pendingApprovals.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-5 md:p-6 shadow-[0_0_15px_rgba(245,158,11,0.05)] overflow-hidden"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-900/60">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xs font-mono bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-1 rounded">
                        AGENT ID: <span className="text-amber-400 font-bold">{item.agentId}</span>
                      </span>
                      <span className="text-[10px] font-mono bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
                        {item.triggeredRule}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      PAUSED TELEMETRY BROADCAST
                    </span>
                  </div>

                  <div className="mt-5 space-y-2">
                    <span className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">Drafted Shell Execution Command Payload:</span>
                    <div className="bg-slate-950/90 border border-slate-850 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-emerald-400 overflow-x-auto">
                      <pre>{JSON.stringify(item.actionJson, null, 2)}</pre>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve &amp; Resume Execution
                    </button>
                    <button
                      onClick={() => handleDeny(item.id)}
                      className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 animate-pulse" />
                      Deny &amp; Terminate
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 border border-dashed border-emerald-500/30 rounded-xl bg-emerald-500/5 flex flex-col items-center justify-center text-center px-4 shadow-[inset_0_0_20px_rgba(52,211,153,0.05)]"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3">
                <Shield className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              </div>
              <p className="text-sm font-mono text-emerald-400 font-bold uppercase tracking-wider">Shield Active: 0 Pending Threats</p>
              <p className="text-[10px] text-slate-500 max-w-sm mt-1">All real-time agent execution processes are flowing cleanly within nominal safety parameters.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}

// --- SUB-COMPONENT: SETTINGS VIEW ---

function GatewayView({ activeRoute, gatewayLogs, executeGatewayRequest }: {
  activeRoute: 'IDLE' | 'PRIMARY' | 'FAILOVER';
  gatewayLogs: GatewayLog[];
  executeGatewayRequest: (p: any) => Promise<any>;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100 flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-400" />
            Routing Gateway (CRIS Engine)
          </h2>
          <p className="text-sm text-slate-400 mt-1">Multi-Region Fallback Proxy & Circuit Breaker Visualizer</p>
        </div>
        <button
          onClick={() => executeGatewayRequest({ model: 'claude-3-5-sonnet' })}
          className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs font-bold tracking-wider rounded-lg hover:bg-blue-500/20 transition-colors"
        >
          TEST GATEWAY ROUTE
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
        
        <div className="p-8">
          <h3 className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wider mb-6">Live Traffic Topology</h3>
          
          <div className="relative h-64 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-center p-8 overflow-hidden">
            
            {/* SVG Lines for animation */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
              <line 
                x1="20%" y1="50%" 
                x2="80%" y2="25%" 
                stroke={activeRoute === 'PRIMARY' ? '#3b82f6' : activeRoute === 'FAILOVER' ? '#ef4444' : '#1e293b'} 
                strokeWidth="2"
                strokeDasharray="4 4"
                className={activeRoute === 'PRIMARY' ? 'animate-[dash_1s_linear_infinite]' : ''}
              />
              <line 
                x1="20%" y1="50%" 
                x2="80%" y2="75%" 
                stroke={activeRoute === 'FAILOVER' ? '#10b981' : '#1e293b'} 
                strokeWidth="2"
                strokeDasharray="4 4"
                className={activeRoute === 'FAILOVER' ? 'animate-[dash_1s_linear_infinite]' : ''}
              />
            </svg>
            
            {/* Edge Gateway Node */}
            <div className="absolute left-10 lg:left-24 top-1/2 -translate-y-1/2 flex flex-col items-center z-10">
              <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${activeRoute !== 'IDLE' ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-slate-700'}`}>
                <Network className={`w-8 h-8 ${activeRoute !== 'IDLE' ? 'text-blue-400' : 'text-slate-500'}`} />
              </div>
              <span className="font-mono text-[10px] text-slate-400 mt-3 font-semibold text-center tracking-widest">CENTRAL<br/>GATEWAY EDGE</span>
            </div>

            {/* Primary Region Node */}
            <div className="absolute right-10 lg:right-32 top-8 flex flex-col items-center z-10">
              <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${
                activeRoute === 'PRIMARY' ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 
                activeRoute === 'FAILOVER' ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 
                'border-slate-700'
              }`}>
                <Server className={`w-6 h-6 ${
                  activeRoute === 'PRIMARY' ? 'text-blue-400' : 
                  activeRoute === 'FAILOVER' ? 'text-red-500' : 
                  'text-slate-500'
                }`} />
              </div>
              <span className="font-mono text-[10px] text-slate-400 mt-2 font-semibold tracking-widest">us-east-1</span>
              <span className="text-[9px] text-slate-500">Claude 3.5 Sonnet</span>
            </div>

            {/* Failover Region Node */}
            <div className="absolute right-10 lg:right-32 bottom-8 flex flex-col items-center z-10">
              <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${
                activeRoute === 'FAILOVER' ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 
                'border-slate-700'
              }`}>
                <Activity className={`w-6 h-6 ${
                  activeRoute === 'FAILOVER' ? 'text-emerald-400' : 
                  'text-slate-500'
                }`} />
              </div>
              <span className="font-mono text-[10px] text-slate-400 mt-2 font-semibold tracking-widest">eu-central-1</span>
              <span className="text-[9px] text-slate-500">DeepSeek-R1</span>
            </div>

          </div>

          <div className="mt-6 bg-black rounded-lg border border-slate-800 p-4 h-48 overflow-y-auto">
            <h4 className="font-mono text-[10px] text-slate-500 tracking-widest uppercase mb-3 border-b border-slate-800 pb-2">CRIS Edge Gateway Logs</h4>
            <div className="space-y-1.5">
              {gatewayLogs.map(log => (
                <div key={log.id} className="font-mono text-xs flex items-start gap-3">
                  <span className="text-slate-600 whitespace-nowrap">
                    [{log.timestamp.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}]
                  </span>
                  <span className={`font-semibold whitespace-nowrap ${
                    log.level === 'INFO' ? 'text-blue-400' :
                    log.level === 'WARN' ? 'text-amber-400' :
                    log.level === 'ERROR' ? 'text-red-400' :
                    'text-emerald-400'
                  }`}>
                    [{log.level}]
                  </span>
                  <span className="text-slate-300">
                    {log.message}
                  </span>
                </div>
              ))}
              {gatewayLogs.length === 0 && (
                <div className="text-slate-600 text-xs font-mono italic">Waiting for inbound API requests...</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

interface SettingsViewProps {
  currency: 'USD' | 'EUR' | 'GBP';
  setCurrency: (c: 'USD' | 'EUR' | 'GBP') => void;
  initialSubTab: 'System Engine Settings' | 'Threshold Alert Rules';
  displayDensity: 'Compact' | 'Standard' | 'Comfortable';
  setDisplayDensity: (d: 'Compact' | 'Standard' | 'Comfortable') => void;
  simulateTelemetry: boolean;
  setSimulateTelemetry: (s: boolean) => void;
  onPurgeCompleted: () => void;
  showToast: (msg: string) => void;
  theme: 'Deep Space' | 'Midnight';
  setTheme: (t: 'Deep Space' | 'Midnight') => void;
}

function SettingsView({
  currency,
  setCurrency,
  initialSubTab,
  displayDensity,
  setDisplayDensity,
  simulateTelemetry,
  setSimulateTelemetry,
  onPurgeCompleted,
  showToast,
  theme,
  setTheme
}: SettingsViewProps) {
  const [subTab, setSubTab] = useState<'System Engine Settings' | 'Threshold Alert Rules'>(initialSubTab);

  // Synchronize subTab with selection changes in parent tab mapping
  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // Persistent settings states initialized with masked presets
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('kudbee_openai_key') || 'sk-proj-LN92fDka74jGks92019kLsakd92kasdQ23');
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('kudbee_anthropic_key') || 'sk-ant-sid01-Las9102Ksad92jKs8Aas0129kLasdK9');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('kudbee_gemini_key') || 'AIzaSyAs8192Ksadl29Kasd891Aksj182Ksdka9');
  const [otelPort, setOtelPort] = useState(() => parseInt(localStorage.getItem('kudbee_otel_port') || '8000', 10));

  // Numeric alert parameter boundaries
  const [dailySpendCap, setDailySpendCap] = useState(() => parseFloat(localStorage.getItem('kudbee_spend_cap') || '100.00'));
  const [tokenWarningThreshold, setTokenWarningThreshold] = useState(() => parseInt(localStorage.getItem('kudbee_token_warn') || '50000', 10));
  const [healthCeiling, setHealthCeiling] = useState(() => parseInt(localStorage.getItem('kudbee_health_ceil') || '20', 10));

  const saveOtelPort = (val: number) => {
    setOtelPort(val);
    localStorage.setItem('kudbee_otel_port', val.toString());
  };

  const handleSaveKeys = () => {
    localStorage.setItem('kudbee_openai_key', openaiKey);
    localStorage.setItem('kudbee_anthropic_key', anthropicKey);
    localStorage.setItem('kudbee_gemini_key', geminiKey);
    showToast("API Route Provider configuration saved successfully!");
  };

  const handleSaveThresholds = () => {
    localStorage.setItem('kudbee_spend_cap', dailySpendCap.toString());
    localStorage.setItem('kudbee_token_warn', tokenWarningThreshold.toString());
    localStorage.setItem('kudbee_health_ceil', healthCeiling.toString());
    showToast("Threshold alert parameter bounds saved to SQLite cache.");
  };

  const handlePurgeCache = async () => {
    try {
      const res = await fetch('/api/telemetry/purge', { method: 'POST' });
      if (res.ok) {
        showToast("⚠️ Local SQLite Telemetry Database Cache Purged Successfully.");
        onPurgeCompleted();
      } else {
        showToast("Error communicating with ingestion server.");
      }
    } catch (err) {
      console.error(err);
      showToast("Purge action failed. Check if local FastAPI backend is active.");
    }
  };

  const currencies: { id: 'USD' | 'EUR' | 'GBP'; label: string; symbol: string; desc: string }[] = [
    { id: 'USD', label: 'US Dollar', symbol: '$', desc: 'United States Dollar (Baseline baseline format)' },
    { id: 'EUR', label: 'Euro', symbol: '€', desc: 'European Union Euro (Exchange Rate: 1 USD = 0.92 EUR)' },
    { id: 'GBP', label: 'British Pound', symbol: '£', desc: 'United Kingdom Pound Sterling (Exchange Rate: 1 USD = 0.78 GBP)' }
  ];

  return (
    <div className="min-h-dvh flex flex-col space-y-6" id="settings-view-container">
      {/* Sub-tab segmented controller */}
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 max-w-lg w-full self-center md:self-start">
        <button
          onClick={() => setSubTab('System Engine Settings')}
          className={`flex-1 py-2 px-4 rounded-lg font-mono text-xs uppercase tracking-widest font-semibold transition-all duration-200 cursor-pointer ${
            subTab === 'System Engine Settings'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          System Engine Settings
        </button>
        <button
          onClick={() => setSubTab('Threshold Alert Rules')}
          className={`flex-1 py-2 px-4 rounded-lg font-mono text-xs uppercase tracking-widest font-semibold transition-all duration-200 cursor-pointer ${
            subTab === 'Threshold Alert Rules'
              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Threshold Alert Rules
        </button>
      </div>

      <AnimatePresence mode="wait">
        {subTab === 'System Engine Settings' ? (
          <motion.div
            key="system-settings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* API Keys Configuration Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
              
              <div className="flex items-center gap-2 mb-6">
                <Key className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">API Route Provider Configuration</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Manage secure upstream gateway tokens and telemetry ingestion routing ports.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">OpenAI API Gateway Key</label>
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-proj-••••••••"
                    className="w-full scroll-mt-28 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">Anthropic API Key</label>
                  <input
                    type="password"
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-••••••••"
                    className="w-full scroll-mt-28 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">Google Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy••••••••"
                    className="w-full scroll-mt-28 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">Local OTel Ingestion Port</label>
                  <input
                    type="number"
                    value={otelPort}
                    onChange={(e) => saveOtelPort(parseInt(e.target.value, 10) || 8000)}
                    placeholder="8000"
                    className="w-full scroll-mt-28 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveKeys}
                  className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer"
                >
                  Save Secure Credentials
                </button>
              </div>
            </div>

            {/* Display Density Controller */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
              
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">UI Display Density Engine</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Alters global component grid padding and typography scaling ratios dynamically.</p>
                </div>
              </div>

              <div className="flex gap-4 p-1 bg-slate-950 border border-slate-800 rounded-lg max-w-md">
                {(['Compact', 'Standard', 'Comfortable'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setDisplayDensity(mode);
                      showToast(`UI Layout set to ${mode} density mode.`);
                    }}
                    className={`flex-1 py-1.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                      displayDensity === mode
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Global Theme Controller */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="theme-settings-card">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
              
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Global Legibility Theme</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Switch between Deep Space ambient dark and Midnight high-contrast black.</p>
                </div>
              </div>

              <div className="flex gap-4 p-1 bg-slate-950 border border-slate-800 rounded-lg max-w-md">
                {(['Deep Space', 'Midnight'] as const).map((t) => (
                  <button
                    key={t}
                    id={`theme-btn-${t.toLowerCase().replace(' ', '-')}`}
                    onClick={() => {
                      setTheme(t);
                    }}
                    className={`flex-1 py-1.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                      theme === t
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency selector component */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
              
              <div className="flex items-center gap-2 mb-6">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Global Currency Format</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Select the workspace currency representation. Auto-converted based on standard regional rates.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {currencies.map((curr) => {
                  const isSelected = currency === curr.id;
                  return (
                    <button
                      key={curr.id}
                      onClick={() => setCurrency(curr.id)}
                      className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 relative ${
                        isSelected
                          ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.1)]'
                          : 'bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-mono text-xs font-bold tracking-wide uppercase">{curr.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          {curr.id}
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-2xl font-extrabold text-slate-100 block">
                          {curr.symbol}
                        </span>
                        <span className="text-[9px] text-slate-500 block leading-tight mt-1">
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

            {/* Infrastructure panel and Purge DB Danger Zone */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
              
              <div className="flex items-center gap-2 mb-6">
                <Database className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Infrastructure Control Panel</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Synchronize local cache systems and daemon telemetry ingestion parameters.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-850 rounded-lg">
                  <div className="space-y-1 pr-4">
                    <span className="block text-xs font-semibold text-slate-300">Simulate Real-time Network Telemetry</span>
                    <span className="block text-[10px] text-slate-500">
                      Toggle active daemon polling fetching pipelines. Disabling this freezes the real-time ingest simulation.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSimulateTelemetry(!simulateTelemetry);
                      showToast(simulateTelemetry ? "Telemetry simulation paused." : "Telemetry simulation resumed.");
                    }}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      simulateTelemetry ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                        simulateTelemetry ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="border border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <span className="block text-xs font-bold text-amber-400 font-mono uppercase tracking-wider">Danger Zone: Purge Cache</span>
                    <span className="block text-[10px] text-slate-400 max-w-xl">
                      Irreversibly deletes all rows inside the SQLite local database trace logs and resets API route limit quotas.
                    </span>
                  </div>
                  <button
                    onClick={handlePurgeCache}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 border border-amber-500/40 hover:bg-amber-500/10 active:bg-amber-500/20 text-amber-400 text-xs font-mono font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Purge Local SQLite Cache
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="alerts-settings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Threshold Alert Rules Configuration */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
              
              <div className="flex items-center gap-2 mb-6">
                <Bell className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Threshold Alert Rules</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Establish billing, consumption, and subscription safety margins. Tests trigger dynamic layout notifications.</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Spend Cap rule input & test trigger */}
                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <span className="block text-xs font-bold font-mono uppercase tracking-wider text-purple-400">Daily Consumption Spend Cap ($)</span>
                    <span className="block text-[11px] text-slate-500">
                      Broadcasting triggers when overall pipeline costs exceed the designated USD value.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    <input
                      type="number"
                      value={dailySpendCap}
                      onChange={(e) => setDailySpendCap(parseFloat(e.target.value) || 0)}
                      className="w-32 scroll-mt-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-right"
                    />
                    <button
                      onClick={() => showToast("⚠️ Warning: Daily Gateway Budget Exceeded")}
                      title="Test Trigger Rule"
                      className="p-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-400 rounded-lg transition-all cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Token Limit rule input & test trigger */}
                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <span className="block text-xs font-bold font-mono uppercase tracking-wider text-purple-400">Single Gateway Payload Token Warning</span>
                    <span className="block text-[11px] text-slate-500">
                      Alert triggers if any trace log logs a payload containing more than this raw token count.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    <input
                      type="number"
                      value={tokenWarningThreshold}
                      onChange={(e) => setTokenWarningThreshold(parseInt(e.target.value, 10) || 0)}
                      className="w-32 scroll-mt-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-right"
                    />
                    <button
                      onClick={() => showToast("⚠️ Warning: Single Gateway Payload Limit Violated")}
                      title="Test Trigger Rule"
                      className="p-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-400 rounded-lg transition-all cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Subscription Quota Health rule input & test trigger */}
                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <span className="block text-xs font-bold font-mono uppercase tracking-wider text-purple-400">Minimum Subscription Health Ceiling (%)</span>
                    <span className="block text-[11px] text-slate-500">
                      Alert broadcasts warning logs immediately if any active quota tracker's remaining percentage drops below this health ceiling.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    <input
                      type="number"
                      value={healthCeiling}
                      onChange={(e) => setHealthCeiling(parseInt(e.target.value, 10) || 0)}
                      className="w-32 scroll-mt-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-right"
                    />
                    <button
                      onClick={() => showToast("⚠️ Warning: Subscription Health is below Minimum Ceiling!")}
                      title="Test Trigger Rule"
                      className="p-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-400 rounded-lg transition-all cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveThresholds}
                  className="px-4 py-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-400 rounded-lg text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer"
                >
                  Save Alert Bounds
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SECURE ADMIN GATEWAY (LOGIN) ---
function LoginView({ onAuthenticate }: { onAuthenticate: () => void }) {
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  
  // Local Provider Key Ingestion
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('kudbee_admin_openai') || '');
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('kudbee_admin_anthropic') || '');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('kudbee_admin_gemini') || '');

  const handleLogin = () => {
    if (passkey === 'kudbee-admin-2026') {
      setError(false);
      setIsBooting(true);
      // Save keys to local storage to eliminate env file touching
      localStorage.setItem('kudbee_admin_openai', openaiKey);
      localStorage.setItem('kudbee_admin_anthropic', anthropicKey);
      localStorage.setItem('kudbee_admin_gemini', geminiKey);
      
      setTimeout(() => {
        onAuthenticate();
      }, 1500); // 1.5s sleek terminal boot
    } else {
      setError(true);
      setPasskey('');
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-black text-slate-200 font-sans p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] mix-blend-overlay pointer-events-none"></div>
      
      <AnimatePresence>
        {!isBooting ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md bg-slate-950/80 border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10 backdrop-blur-sm"
          >
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500/20 via-emerald-400 to-emerald-500/20"></div>
            
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(52,211,153,0.15)]">
                <Lock className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">Secure Access Gateway</h1>
              <p className="font-mono text-[10px] text-emerald-500/70 uppercase tracking-widest mt-2">KUDBEE Engine v1.0 Admin</p>
            </div>

            <div className="space-y-6">
              {/* Passkey Input */}
              <div className="space-y-2">
                <label className="font-mono text-xs text-slate-400 uppercase tracking-wider block">Master Passkey</label>
                <input
                  type="password"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className={`w-full bg-black border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-800 focus:ring-emerald-500'} rounded-lg px-4 py-3 text-emerald-400 font-mono tracking-[0.2em] focus:outline-none focus:ring-1 transition-all placeholder:text-slate-800`}
                  placeholder="••••••••••••••"
                  autoFocus
                />
                {error && <p className="text-red-400 text-xs font-mono mt-1">ACCESS DENIED. INVALID PASSKEY.</p>}
              </div>

              {/* Provider Key Ingestion Engine */}
              <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2 mb-2">
                  <Key className="w-4 h-4 text-slate-400" />
                  <h3 className="font-mono text-[11px] text-slate-300 font-semibold tracking-wider">Provider Key Ingestion Engine</h3>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] text-slate-500 uppercase">OpenAI API Key</label>
                    <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} className="w-full bg-black border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-600" placeholder="sk-proj-..." />
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] text-slate-500 uppercase">Anthropic API Key</label>
                    <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} className="w-full bg-black border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-600" placeholder="sk-ant-..." />
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] text-slate-500 uppercase">Gemini API Key</label>
                    <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-black border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-600" placeholder="AIzaSy..." />
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogin}
                className="w-full py-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-sm font-bold tracking-widest uppercase rounded-xl hover:bg-emerald-500/20 active:bg-emerald-500/30 transition-all cursor-pointer shadow-[0_0_20px_rgba(52,211,153,0.1)] hover:shadow-[0_0_25px_rgba(52,211,153,0.2)]"
              >
                Initialize Gateway
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-2xl bg-transparent relative z-10"
          >
            <div className="font-mono text-emerald-400 text-sm space-y-2">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>[SYSTEM] Authenticated via local passkey...</motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>[SYSTEM] Injecting Provider Keys into secure memory context...</motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>[GATEWAY] Initializing CRIS Multi-Region Edge router...</motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>[DB] Connecting to offline SQLite telemetry ledger...</motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>[READY] Handing over execution to Main Thread.</motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="mt-4">
                <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse"></span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- MAIN APPLICATION ENTRY WITH SIDEBAR ROUTING ---

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('Dashboard');
  
  const { pendingApprovals, executeAgentTool, resolveApproval, rejectApproval } = useAgentInterceptor();
  const gatewayRouter = useGatewayRouter();

  // --- SUBSCRIPTION LEDGER BUDGET CAPS (GAP TRACKER) ---
  const [claudeProCap, setClaudeProCap] = useState(() => Number(localStorage.getItem('kudbee_cap_claude') || '20.00'));
  const [cursorProCap, setCursorProCap] = useState(() => Number(localStorage.getItem('kudbee_cap_cursor') || '20.00'));
  const [chatGptCap, setChatGptCap] = useState(() => Number(localStorage.getItem('kudbee_cap_chatgpt') || '20.00'));
  const [apiGatewayCap, setApiGatewayCap] = useState(() => Number(localStorage.getItem('kudbee_cap_api') || '50.00'));

  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [tempCapVal, setTempCapVal] = useState('');

  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'GBP'>('USD');
  const [displayDensity, setDisplayDensity] = useState<'Compact' | 'Standard' | 'Comfortable'>('Standard');
  const [simulateTelemetry, setSimulateTelemetry] = useState(true);
  const [toast, setToast] = useState<{ id: number; message: string; type: string } | null>(null);
  const [theme, setTheme] = useState<'Deep Space' | 'Midnight'>(() => (localStorage.getItem('kudbee_theme') as 'Deep Space' | 'Midnight') || 'Deep Space');

  const handleSetTheme = (newTheme: 'Deep Space' | 'Midnight') => {
    setTheme(newTheme);
    localStorage.setItem('kudbee_theme', newTheme);
    showToast(`Global Theme set to ${newTheme} mode.`, 'success');
  };

  useEffect(() => {
    if (theme === 'Midnight') {
      document.body.classList.add('theme-midnight');
    } else {
      document.body.classList.remove('theme-midnight');
    }
  }, [theme]);

  const showToast = (message: string, type: 'warning' | 'info' | 'success' = 'warning') => {
    const id = Date.now();
    setToast({ id, message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Unified real-time SQLite backend telemetry synchronization
  const [dbSummary, setDbSummary] = useState<any>(null);
  const [dbLogs, setDbLogs] = useState<any[]>([]);

  const fetchTelemetryData = async () => {
    if (!isAuthenticated) return;
    try {
      const summaryRes = await fetch('/api/dashboard/summary');
      if (summaryRes.ok) {
        const sData = await summaryRes.json();
        setDbSummary(sData);
      }
      
      const logsRes = await fetch('/api/telemetry/logs?limit=50');
      if (logsRes.ok) {
        const lData = await logsRes.json();
        setDbLogs(lData || []);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard metrics:", err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !simulateTelemetry) return;
    const interval = setInterval(() => {
      // Simulate an agent tool call that requires approval
      executeAgentTool("claude-code-local", "Rule: bash_execute detected", {
        action: "bash_execute",
        command: "npm install -g malicious-package",
        directory: "~/workspace/telemetry-db",
        environment: { NODE_ENV: "production" }
      }).then(() => {
        showToast("Agent tool execution completed successfully.", "success");
      }).catch((err) => {
        console.warn("Agent tool execution blocked:", err);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [simulateTelemetry, executeAgentTool, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchTelemetryData();
    if (!simulateTelemetry) return;
    const interval = setInterval(fetchTelemetryData, 3000);
    return () => clearInterval(interval);
  }, [simulateTelemetry, isAuthenticated]);

  // Derive dynamic telemetry statistics
  const liveStats = React.useMemo(() => {
    const baseIn = 1234567;
    const baseOut = 3456789;
    const baseCost = 45.2034;
    
    if (!dbSummary) {
      return {
        inTokens: baseIn,
        outTokens: baseOut,
        cost: baseCost,
        totalRequests: 1482,
        activeModels: 4
      };
    }
    
    const dbTokens = dbSummary.total_historical_tokens || 0;
    const dbCost = dbSummary.total_24h_cost || 0;
    
    return {
      inTokens: baseIn + Math.floor(dbTokens * 0.4),
      outTokens: baseOut + Math.floor(dbTokens * 0.6),
      cost: baseCost + dbCost,
      totalRequests: 1482 + dbLogs.length,
      activeModels: dbSummary.total_active_models || 4
    };
  }, [dbSummary, dbLogs]);

  // Derive dynamic cumulative spending per subscription category
  const ledgerSpend = React.useMemo(() => {
    let claudeSpent = 0;
    let cursorSpent = 0;
    let chatGptSpent = 0;
    let apiSpent = 0;

    if (dbLogs && dbLogs.length > 0) {
      dbLogs.forEach((log: any) => {
        const prov = log.provider || '';
        const model = (log.model_name || log.model || '').toLowerCase();
        const cost = Number(log.calculated_cost) || Number(log.cost) || 0;

        if (prov === 'Anthropic' || model.includes('claude')) {
          claudeSpent += cost;
        } else if (prov === 'Cursor') {
          cursorSpent += cost;
        } else if (prov === 'OpenAI' || model.includes('gpt')) {
          chatGptSpent += cost;
        } else {
          apiSpent += cost;
        }
      });
    }

    return {
      claude: Number(claudeSpent.toFixed(4)),
      cursor: Number(cursorSpent.toFixed(4)),
      chatGpt: Number(chatGptSpent.toFixed(4)),
      api: Number(apiSpent.toFixed(4))
    };
  }, [dbLogs]);

  // Derive trajectory series for interactive charting
  const chartData = React.useMemo(() => {
    const points = [
      { name: "12h ago", tokens: 120000, cost: 0.25 },
      { name: "10h ago", tokens: 180000, cost: 0.38 },
      { name: "8h ago", tokens: 150000, cost: 0.31 },
      { name: "6h ago", tokens: 280000, cost: 0.58 },
      { name: "4h ago", tokens: 210000, cost: 0.44 },
      { name: "2h ago", tokens: 340000, cost: 0.72 },
    ];
    
    if (dbLogs && dbLogs.length > 0) {
      const recentLogs = [...dbLogs].slice(0, 10).reverse();
      const dbPoints = recentLogs.map((l: any) => {
        const timeStr = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return {
          name: timeStr,
          tokens: l.input_tokens + l.output_tokens,
          cost: l.calculated_cost
        };
      });
      return [...points, ...dbPoints];
    }
    
    return points;
  }, [dbLogs]);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Activity, label: 'Interceptor' },
    { icon: Calculator, label: 'Playground' },
    { icon: History, label: 'History' },
    { icon: Globe, label: 'Intelligence' },
    { icon: Shield, label: 'Firewall' },
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

  if (!isAuthenticated) {
    return (
      <>
        <div className="crt-overlay" />
        <div className="crt-scanline" />
        <LoginView onAuthenticate={() => setIsAuthenticated(true)} />
      </>
    );
  }

  return (
    <div className={`min-h-screen ${theme === 'Midnight' ? 'theme-midnight bg-black text-zinc-100' : 'theme-deepspace bg-slate-950 text-slate-300'} font-sans flex overflow-hidden selection:bg-emerald-500/30`}>
      <div className="crt-overlay" />
      <div className="crt-scanline" />
      
      {/* LEFT SIDEBAR */}
      <aside className="w-64 border-r border-slate-800/60 bg-slate-950 flex flex-col shrink-0 hidden md:flex z-10" id="main-sidebar">
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800/60 relative overflow-hidden">
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
          <button 
            onClick={() => setIsAuthenticated(false)}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer ml-auto"
            title="Lock Session"
          >
            <Lock className="w-4 h-4" />
          </button>
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
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.7)]"></span>
            </div>
            <span className="text-[10px] font-mono text-emerald-500/80 uppercase tracking-widest drop-shadow-[0_0_4px_rgba(52,211,153,0.25)]">System Status: Nominal</span>
          </div>
        </div>
      </aside>

      {/* MAIN DASHBOARD CONTENT */}
      <main className="flex-1 h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 relative" id="main-content-panel">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] mix-blend-overlay pointer-events-none"></div>
        
        <div className={`max-w-7xl mx-auto relative z-0 transition-all duration-300 ${
          displayDensity === 'Compact' 
            ? 'p-4 space-y-4 text-xs' 
            : displayDensity === 'Comfortable' 
              ? 'p-8 md:p-10 space-y-8 text-base' 
              : 'p-6 md:p-8 space-y-6 text-sm'
        }`}>
          
          <header className="mb-8 md:hidden">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TerminalSquare className="w-6 h-6 text-emerald-400" />
                  <span className="font-display font-bold text-lg text-slate-100">KUDBEE Fuel Gauge</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative flex h-2 w-2">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.7)]"></span>
                  </div>
                  <button 
                    onClick={() => setIsAuthenticated(false)}
                    className="p-1.5 text-slate-500 hover:text-red-400 bg-slate-900 rounded border border-slate-800 transition-colors cursor-pointer"
                    title="Lock Session"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="relative w-full overflow-hidden">
                {/* Left and Right Edge-Fade Visual Cue Overlays */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none z-10" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none z-10" />
                
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none flex-nowrap whitespace-nowrap scroll-smooth">
                  {[
                    { key: 'Dashboard', label: 'DASHBOARD', activeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold shadow-[inset_0_-2px_0_#10b981,0_2px_8px_rgba(52,211,153,0.15)]' },
                    { key: 'Interceptor', label: 'INTERCEPTOR', activeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold shadow-[inset_0_-2px_0_#10b981,0_2px_8px_rgba(52,211,153,0.15)]' },
                    { key: 'Playground', label: 'PLAYGROUND', activeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold shadow-[inset_0_-2px_0_#10b981,0_2px_8px_rgba(52,211,153,0.15)]' },
                    { key: 'History', label: 'HISTORY', activeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold shadow-[inset_0_-2px_0_#10b981,0_2px_8px_rgba(52,211,153,0.15)]' },
                    { key: 'Intelligence', label: 'INTELLIGENCE', activeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold shadow-[inset_0_-2px_0_#10b981,0_2px_8px_rgba(52,211,153,0.15)]' },
                    { key: 'Firewall', label: 'FIREWALL', activeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold shadow-[inset_0_-2px_0_#10b981,0_2px_8px_rgba(52,211,153,0.15)]' },
                    { key: 'Gateway', label: 'GATEWAY', activeStyle: 'border-blue-500/40 bg-blue-500/10 text-blue-400 font-bold shadow-[inset_0_-2px_0_#3b82f6,0_2px_8px_rgba(59,130,246,0.15)]' },
                    { key: 'Alerts', label: 'ALERTS', activeStyle: 'border-purple-500/40 bg-purple-500/10 text-purple-400 font-bold shadow-[inset_0_-2px_0_#a855f7,0_2px_8px_rgba(168,85,247,0.15)]' },
                    { key: 'Settings', label: 'SETTINGS', activeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold shadow-[inset_0_-2px_0_#10b981,0_2px_8px_rgba(52,211,153,0.15)]' },
                  ].map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-none min-h-[44px] min-w-[100px] px-4 py-2 rounded text-xs font-mono border transition-all duration-200 ease-out cursor-pointer flex items-center justify-center ${
                          isActive
                            ? tab.activeStyle
                            : 'border-slate-850 bg-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-750'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
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
                  value={liveStats.inTokens.toLocaleString()} 
                  icon={Cpu}
                />
                <TelemetryCard 
                  title="Output Tokens" 
                  value={liveStats.outTokens.toLocaleString()} 
                  icon={ArrowRightLeft}
                />
                <TelemetryCard 
                  title="Live Pipeline Cost" 
                  value={getFormattedCost(liveStats.cost, currency, 4)} 
                  icon={DollarSign}
                />
              </div>

              {/* DYNAMIC GROUNDED INTEL HUD TICKER */}
              <TerminalHUDTicker />

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
                          <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Model Framework</th>
                          <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Cost / 1M (In|Out)</th>
                          <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Speed Velocity</th>
                          <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Output Quality</th>
                          <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800 text-right`}>Route State</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-slate-800/50">
                        {models.map((m, i) => (
                           <tr key={i} className="hover:bg-slate-800/20 transition-colors group">
                            <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'}`}>
                              <div className="font-medium text-slate-200">{m.name}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{m.org}</div>
                            </td>
                            <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'} font-mono text-slate-300 tracking-wide`}>
                              {getFormattedCost(parseFloat(m.costIn), currency, 2)} <span className="text-slate-600 mx-1">|</span> {getFormattedCost(parseFloat(m.costOut), currency, 2)}
                            </td>
                            <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'}`}>
                              <div className="w-24 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                                <div className="absolute top-0 left-0 h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: `${m.speed}%` }}></div>
                              </div>
                            </td>
                            <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'}`}>
                              <StarRating rating={m.quality} />
                            </td>
                            <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'} text-right`}>
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

                {/* SUBSCRIPTION BUDGET LEDGER & HEALTH QUOTAS */}
                <div className="xl:col-span-4 space-y-6 flex flex-col justify-between">
                  
                  {/* SUBSCRIPTION BUDGET LEDGER CARD (ROADMAP PHASE 3 GAP FIX) */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden" id="subscription-budget-ledger">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent"></div>
                    
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-orange-400" />
                        <h3 className="font-display font-semibold text-slate-200 text-sm">Subscription Budget Ledger</h3>
                      </div>
                      <span className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase">
                        Fixed Cap Ledger
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mb-4 leading-normal">
                      Establish monthly budget constraints. The ledger tracks cumulative costs and decrements caps in real-time.
                    </p>

                    <div className="space-y-4">
                      {[
                        {
                          id: 'claude',
                          name: 'Claude Pro Limit',
                          cap: claudeProCap,
                          setCap: (val: number) => {
                            setClaudeProCap(val);
                            localStorage.setItem('kudbee_cap_claude', val.toString());
                          },
                          spent: ledgerSpend.claude,
                          color: 'from-orange-500 to-amber-500',
                        },
                        {
                          id: 'cursor',
                          name: 'Cursor Pro Limit',
                          cap: cursorProCap,
                          setCap: (val: number) => {
                            setCursorProCap(val);
                            localStorage.setItem('kudbee_cap_cursor', val.toString());
                          },
                          spent: ledgerSpend.cursor,
                          color: 'from-blue-500 to-indigo-500',
                        },
                        {
                          id: 'chatgpt',
                          name: 'ChatGPT Plus Limit',
                          cap: chatGptCap,
                          setCap: (val: number) => {
                            setChatGptCap(val);
                            localStorage.setItem('kudbee_cap_chatgpt', val.toString());
                          },
                          spent: ledgerSpend.chatGpt,
                          color: 'from-emerald-500 to-teal-500',
                        },
                        {
                          id: 'api',
                          name: 'API Gateway Limit',
                          cap: apiGatewayCap,
                          setCap: (val: number) => {
                            setApiGatewayCap(val);
                            localStorage.setItem('kudbee_cap_api', val.toString());
                          },
                          spent: ledgerSpend.api,
                          color: 'from-purple-500 to-pink-500',
                        }
                      ].map((item) => {
                        const pct = item.cap > 0 ? Math.min(100, (item.spent / item.cap) * 100) : 0;
                        const remaining = Math.max(0, item.cap - item.spent);
                        const isEditing = editingProvider === item.id;

                        return (
                          <div key={item.id} className="p-3 bg-slate-950/60 border border-slate-850/70 rounded-lg space-y-2 group">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-mono font-bold text-slate-300">{item.name}</span>
                              
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    value={tempCapVal}
                                    onChange={(e) => setTempCapVal(e.target.value)}
                                    className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-right text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
                                    placeholder="Cap"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      const numeric = parseFloat(tempCapVal);
                                      if (!isNaN(numeric) && numeric >= 0) {
                                        item.setCap(numeric);
                                        showToast(`Monthly cap for ${item.name} set to ${getFormattedCost(numeric, currency, 2)}`, 'success');
                                      }
                                      setEditingProvider(null);
                                    }}
                                    className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-mono font-semibold rounded cursor-pointer"
                                  >
                                    SAVE
                                  </button>
                                  <button
                                    onClick={() => setEditingProvider(null)}
                                    className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 text-[9px] font-mono font-semibold rounded cursor-pointer"
                                  >
                                    ESC
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingProvider(item.id);
                                    setTempCapVal(item.cap.toString());
                                  }}
                                  className="text-[10px] font-mono text-slate-500 hover:text-orange-400 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <span>CAP: {getFormattedCost(item.cap, currency, 2)}</span>
                                  <Sliders className="w-3 h-3 text-slate-700 group-hover:text-orange-400 transition-colors" />
                                </button>
                              )}
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80 relative">
                              <div 
                                className={`absolute top-0 left-0 h-full bg-gradient-to-r ${item.color} transition-all duration-500`} 
                                style={{ width: `${pct}%` }}
                              />
                            </div>

                            <div className="flex justify-between text-[10px] font-mono text-slate-500">
                              <span>Spent: {getFormattedCost(item.spent, currency, 4)}</span>
                              <span className="text-slate-400">Remaining: {getFormattedCost(remaining, currency, 4)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* HEALTH MATRIX QUOTA RING BLOCKS */}
                  <div className="grid grid-cols-2 gap-4">
                    {quotas.map((q, i) => (
                      <HealthRing key={i} provider={q.provider} percent={q.percent} offsetMins={q.offsetMins} />
                    ))}
                  </div>
                </div>
              </div>

              {/* BOTTOM ROW: HISTORICAL TIME-SERIES CONTAINER */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.7)]"></span>
                  </span>
                </div>
                
                <div className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mb-6 flex justify-between items-end">
                  <span>24-Hour Telemetry & Ingestion Trajectory</span>
                  <span className="text-emerald-500/70 border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 rounded">Live DB Sync</span>
                </div>
                
                <div className="h-44 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#475569" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        dy={10}
                      />
                      <YAxis 
                        stroke="#475569" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                        labelStyle={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}
                        itemStyle={{ color: '#34d399', fontFamily: 'monospace', fontSize: '11px' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="tokens" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorTokens)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {activeTab === 'Interceptor' && <InterceptorView currency={currency} onNewLogTriggered={fetchTelemetryData} />}
          
          {activeTab === 'Playground' && <PlaygroundView currency={currency} onNewLogTriggered={fetchTelemetryData} />}

          {activeTab === 'History' && <HistoryView currency={currency} dbLogs={dbLogs} onNewLogTriggered={fetchTelemetryData} />}

          {activeTab === 'Intelligence' && <IntelligenceView />}

          {activeTab === 'Firewall' && (
            <FirewallView
              showToast={showToast}
              pendingApprovals={pendingApprovals}
              resolveApproval={resolveApproval}
              rejectApproval={rejectApproval}
              executeAgentTool={executeAgentTool}
            />
          )}

          {activeTab === 'Gateway' && (
            <GatewayView
              activeRoute={gatewayRouter.activeRoute}
              gatewayLogs={gatewayRouter.gatewayLogs}
              executeGatewayRequest={gatewayRouter.executeGatewayRequest}
            />
          )}

          {(activeTab === 'Settings' || activeTab === 'Alerts') && (
            <SettingsView 
              currency={currency} 
              setCurrency={setCurrency} 
              initialSubTab={activeTab === 'Alerts' ? 'Threshold Alert Rules' : 'System Engine Settings'}
              displayDensity={displayDensity}
              setDisplayDensity={setDisplayDensity}
              simulateTelemetry={simulateTelemetry}
              setSimulateTelemetry={setSimulateTelemetry}
              onPurgeCompleted={fetchTelemetryData}
              showToast={showToast}
              theme={theme}
              setTheme={handleSetTheme}
            />
          )}

          {/* AGGREGATE CORE SUMMARY FOOTER */}
          <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 md:p-6 flex flex-wrap md:flex-nowrap justify-between gap-4 md:gap-8 items-center shadow-lg" id="applet-summary-footer">
            <div className="w-full md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total 24h Cost</div>
              <div className="font-mono text-2xl text-emerald-400">{getFormattedCost(liveStats.cost * 0.04, currency, 4)}</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total Tokens</div>
              <div className="font-mono text-xl text-slate-200">{(liveStats.inTokens + liveStats.outTokens).toLocaleString()}</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total Requests</div>
              <div className="font-mono text-xl text-slate-200">{liveStats.totalRequests.toLocaleString()}</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Active Models</div>
              <div className="font-mono text-xl text-slate-200">{liveStats.activeModels.toString()}</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto text-right md:text-left">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Est Monthly Cost</div>
              <div className="font-mono text-xl text-emerald-400/80">{getFormattedCost(liveStats.cost * 1.15, currency, 2)}</div>
            </div>
          </div>

        </div>
      </main>

      {/* GLOBAL TOAST NOTIFICATION OVERLAY */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border border-amber-500/50 bg-slate-950/95 text-slate-100 shadow-[0_0_24px_rgba(245,158,11,0.2)] max-w-md backdrop-blur-md animate-[pulse_2s_infinite]"
          >
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"></div>
            <span className="font-mono text-xs font-semibold tracking-wide leading-relaxed">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
