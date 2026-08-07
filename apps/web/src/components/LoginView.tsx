import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock } from 'lucide-react';
import { apiPost } from '../lib/apiClient';

export function LoginView({ onAuthenticate }: { onAuthenticate: () => void }) {
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const _mountedRef = useRef(true);

  useEffect(() => {
    _mountedRef.current = true;
    return () => { _mountedRef.current = false; };
  }, []);

  const handleLogin = async () => {
    try {
      const result = await apiPost<{ authenticated: boolean; session?: { token: string; expiresAt: number } }>(
        '/api/admin/verify-pass',
        { passkey }
      );
      if (!result.authenticated || !result.session) {
        setError(true);
        setPasskey('');
        return;
      }
      // Session token is HMAC-signed by the server (SESSION_SECRET); keep it
      // in sessionStorage (cleared on tab close) rather than localStorage.
      sessionStorage.setItem('kudbee_session', result.session.token);
      sessionStorage.setItem('kudbee_session_exp', String(result.session.expiresAt));
      setError(false);
      setIsBooting(true);
      setTimeout(() => {
        if (!_mountedRef.current) return;
        onAuthenticate();
      }, 1500);
    } catch {
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

              <button
                onClick={handleLogin}
                className="w-full py-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-sm font-bold tracking-widest uppercase rounded-xl hover:bg-emerald-500/20 active:bg-emerald-500/30 transition-all cursor-pointer shadow-[0_0_20px_rgba(52,211,153,0.1)] hover:shadow-[0_0_25px_rgba(52,211,153,0.2)]"
              >
                Authenticate
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>[SYSTEM] Authenticated via server-verified session...</motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>[SYSTEM] Loading Control Tower state...</motion.div>
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
