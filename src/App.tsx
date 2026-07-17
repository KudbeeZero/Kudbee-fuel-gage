import React, { useState, useEffect } from 'react';
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
  ArrowRightLeft
} from 'lucide-react';

// --- SUB-COMPONENTS ---

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

// --- MAIN APPLICATION COMPONENT ---

export default function Dashboard() {
  // Live Telemetry State
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
        // Cost increment of fractional pennies as requested
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
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: Activity, label: 'Interceptor' },
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
          {navItems.map((item, idx) => (
            <button 
              key={idx} 
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                item.active 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
              }`}
            >
              <item.icon className={`w-4 h-4 ${item.active ? 'text-emerald-400' : 'text-slate-500'}`} />
              {item.label}
              {item.active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>}
            </button>
          ))}
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

      {/* MAIN DASHBOARD GRID */}
      <main className="flex-1 h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] mix-blend-overlay pointer-events-none"></div>
        
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 relative z-0">
          
          <header className="mb-8 md:hidden">
            <div className="flex items-center gap-3">
              <TerminalSquare className="w-6 h-6 text-emerald-400" />
              <span className="font-display font-bold text-lg text-slate-100">KUDBEE Fuel Gauge</span>
            </div>
          </header>

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
                {/* Y-Axis Grid Lines */}
                <line x1="0" y1="50" x2="800" y2="50" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="150" x2="800" y2="150" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                
                {/* Data Geometry */}
                <path 
                  d="M0,180 L80,160 L160,165 L240,110 L320,120 L400,60 L480,80 L560,95 L640,40 L720,45 L800,20" 
                  fill="none" 
                  stroke="#34d399" 
                  strokeWidth="2" 
                  className="drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" 
                />
                
                {/* Area Gradient */}
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
                
                {/* Active Pulse Marker at the end of the line */}
                <circle cx="800" cy="20" r="4" fill="#10b981" />
                <circle cx="800" cy="20" r="8" fill="#10b981" opacity="0.4" className="animate-ping" />
              </svg>
            </div>
            
            {/* X-Axis labels */}
            <div className="flex justify-between text-[9px] font-mono text-slate-600 mt-2">
              <span>-24h</span>
              <span>-18h</span>
              <span>-12h</span>
              <span>-6h</span>
              <span className="text-emerald-500/70">Now</span>
            </div>
          </div>

          {/* AGGREGATE CORE SUMMARY FOOTER */}
          <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 md:p-6 flex flex-wrap md:flex-nowrap justify-between gap-4 md:gap-8 items-center shadow-lg">
            <div className="w-full md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total 24h Cost</div>
              <div className="font-mono text-2xl text-emerald-400">$1.84</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total Tokens</div>
              <div className="font-mono text-xl text-slate-200">1,234,567</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total Requests</div>
              <div className="font-mono text-xl text-slate-200">842</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Active Models</div>
              <div className="font-mono text-xl text-slate-200">3</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-slate-800"></div>
            
            <div className="w-1/2 md:w-auto text-right md:text-left">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Est Monthly Cost</div>
              <div className="font-mono text-xl text-emerald-400/80">$55.20</div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
