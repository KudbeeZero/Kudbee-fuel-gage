import { useState, useEffect } from 'react';
import { Cpu, ArrowRightLeft, DollarSign, BadgeCheck, XCircle } from 'lucide-react';
import { apiPost } from '../lib/apiClient';

interface LiveInterceptorProps {
  onResolved?: () => void;
}

export function LiveInterceptor({ onResolved }: LiveInterceptorProps) {
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [verifying, setVerifying] = useState<number | null>(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setInputTokens(prev => prev + Math.floor(Math.random() * 45) + 5);
      setOutputTokens(prev => prev + Math.floor(Math.random() * 120) + 15);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const cost = (inputTokens * 3 / 1000000) + (outputTokens * 15 / 1000000);

  const handleVerify = async (id: number) => {
    setVerifying(id);
    try {
      await apiPost<{ success: boolean }>('/api/governance/resolve', { id: String(id), decision: 'APPROVE' });
      onResolved?.();
    } catch {
      // keep item for retry
    } finally {
      setVerifying(null);
    }
  };

  const handleReject = async (id: number) => {
    setVerifying(id);
    try {
      await apiPost<{ success: boolean }>('/api/governance/resolve', { id: String(id), decision: 'REJECT' });
      onResolved?.();
    } catch {
      // keep item for retry
    } finally {
      setVerifying(null);
    }
  };

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
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400/40 opacity-75 shadow-[0_0_8px_rgba(52,211,153,0.4)]"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.6)]"></span>
           </span>
           <span className="font-mono text-xs text-emerald-400 uppercase tracking-widest">Streaming</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-950 rounded-xl p-5 border border-slate-800/50">
           <div className="text-slate-500 text-sm mb-2 font-medium">Input Tokens</div>
           <div className="font-mono text-3xl text-slate-200 tracking-tight">
             {inputTokens.toLocaleString()}
           </div>
        </div>
        
        <div className="bg-slate-950 rounded-xl p-5 border border-slate-800/50 relative">
           <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-slate-800 p-1 rounded-full hidden md:block">
             <ArrowRightLeft className="w-4 h-4 text-slate-400" />
           </div>
           <div className="text-slate-500 text-sm mb-2 font-medium">Output Tokens</div>
           <div className="font-mono text-3xl text-slate-200 tracking-tight">
             {outputTokens.toLocaleString()}
           </div>
        </div>

        <div className="bg-emerald-950/20 rounded-xl p-5 border border-emerald-900/30">
           <div className="text-emerald-500/70 text-sm mb-2 font-medium flex items-center gap-1">
             <DollarSign className="w-4 h-4" /> Real-time Cost
           </div>
           <div className="font-mono text-3xl text-emerald-400 tracking-tight">
             ${cost.toFixed(4)}
           </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => handleVerify(1)}
          disabled={verifying === 1}
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-mono font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50"
        >
          <BadgeCheck className={`h-4 w-4 ${verifying === 1 ? 'animate-spin' : ''}`} />
          {verifying === 1 ? 'Approving…' : 'Verify / Approve'}
        </button>
        <button
          type="button"
          onClick={() => handleReject(1)}
          disabled={verifying === 1}
          className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-mono font-semibold text-rose-300 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
        >
          <XCircle className={`h-4 w-4 ${verifying === 1 ? 'animate-spin' : ''}`} />
          {verifying === 1 ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
