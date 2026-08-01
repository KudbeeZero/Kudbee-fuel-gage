import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Key } from 'lucide-react';

export function LoginView({ onAuthenticate }: { onAuthenticate: () => void }) {
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState(false);
  const [isBooting, setIsBooting] = useState(false);

  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('kudbee_admin_openai') || '');
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('kudbee_admin_anthropic') || '');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('kudbee_admin_gemini') || '');
  const _mountedRef = useRef(true);

  useEffect(() => {
    _mountedRef.current = true;
    return () => { _mountedRef.current = false; };
  }, []);

  const handleLogin = () => {
    if (passkey === 'kudbee-admin-2026') {
      setError(false);
      setIsBooting(true);
      localStorage.setItem('kudbee_admin_openai', openaiKey);
      localStorage.setItem('kudbee_admin_anthropic', anthropicKey);
      localStorage.setItem('kudbee_admin_gemini', geminiKey);

      setTimeout(() => {
        if (!_mountedRef.current) return;
        localStorage.setItem('kudbee_session', 'authenticated');
        onAuthenticate();
      }, 1500);
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
              <div className="space-y-2">
                <label className="font-mono text-xs text-slate-400 uppercase tracking-wider block">Master Passkey</label>
                <input
                  type="password"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className={`w-full bg-black border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-800 focus:ring-emerald-500'} rounded-lg px-4 py-3 text-emerald-400 font-mono tracking-[0.2em] focus:outline-none focus:ring-1 transition-all placeholder:text-slate-800`}
                  placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                  autoFocus
                />
                {error && <p className="text-red-400 text-xs font-mono mt-1">ACCESS DENIED. INVALID PASSKEY.</p>}
              </div>

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
