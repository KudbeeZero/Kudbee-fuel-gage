import { useState, useEffect } from 'react';
import { Cpu, ArrowRightLeft, DollarSign } from 'lucide-react';

export function LiveInterceptor() {
  const [inputTokens, setInputTokens] = useState(14250);
  const [outputTokens, setOutputTokens] = useState(3840);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setInputTokens(prev => prev + Math.floor(Math.random() * 45) + 5);
      setOutputTokens(prev => prev + Math.floor(Math.random() * 120) + 15);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const cost = (inputTokens * 3 / 1000000) + (outputTokens * 15 / 1000000);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/20 via-emerald-400 to-emerald-500/20"></div>
      
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-lg font-semibold text-slate-200 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-emerald-400" />
          Live Interceptor
        </h2>
        <div className="flex items-center gap-2">
           <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
           </span>
           <span className="font-mono text-xs text-emerald-400 uppercase tracking-widest">Streaming</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-950 rounded-xl p-5 border border-slate-800/50">
           <div className="text-slate-500 text-sm mb-2 font-medium">Input Tokens</div>
           <div className="font-mono text-3xl text-slate-200">
             {inputTokens.toLocaleString()}
           </div>
        </div>
        
        <div className="bg-slate-950 rounded-xl p-5 border border-slate-800/50 relative">
           <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-slate-800 p-1 rounded-full hidden md:block">
             <ArrowRightLeft className="w-4 h-4 text-slate-400" />
           </div>
           <div className="text-slate-500 text-sm mb-2 font-medium">Output Tokens</div>
           <div className="font-mono text-3xl text-slate-200">
             {outputTokens.toLocaleString()}
           </div>
        </div>

        <div className="bg-emerald-950/20 rounded-xl p-5 border border-emerald-900/30">
           <div className="text-emerald-500/70 text-sm mb-2 font-medium flex items-center gap-1">
             <DollarSign className="w-4 h-4" /> Real-time Cost
           </div>
           <div className="font-mono text-3xl text-emerald-400">
             ${cost.toFixed(4)}
           </div>
        </div>
      </div>
    </div>
  );
}
