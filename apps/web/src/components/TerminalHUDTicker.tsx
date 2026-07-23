import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Zap, Scale, ShieldAlert, RefreshCw } from 'lucide-react';
import { apiGet } from '../lib/apiClient';

interface Headline {
  title: string;
  summary: string;
  category: string;
  source: string;
}

export function TerminalHUDTicker() {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorBlink, setCursorBlink] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchHeadlines = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const controller = abortControllerRef.current;

    try {
      setError(null);
      const data = await apiGet<{ headlines: Headline[] }>('/api/news/headlines', {
        signal: controller.signal
      });
      if (data.headlines && data.headlines.length > 0) {
        setHeadlines(data.headlines);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('Error loading ticker headlines:', err);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchHeadlines();
    const interval = setInterval(fetchHeadlines, 60000);
    return () => {
      clearInterval(interval);
      abortControllerRef.current?.abort();
    };
  }, [fetchHeadlines]);

  useEffect(() => {
    if (headlines.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % headlines.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [headlines]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCursorBlink((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  const getCategoryStyles = (category: string) => {
    const norm = category.toLowerCase();
    if (norm.includes('breakthrough') || norm.includes('research')) {
      return {
        text: 'text-emerald-400 font-semibold drop-shadow-[0_0_6px_rgba(52,211,153,0.3)]',
        badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        prefix: '[BREAKTHROUGH]'
      };
    } else if (norm.includes('billing') || norm.includes('price') || norm.includes('cost')) {
      return {
        text: 'text-amber-400 font-semibold drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]',
        badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        prefix: '[ALERT - BILLING]'
      };
    } else {
      return {
        text: 'text-rose-400 font-semibold drop-shadow-[0_0_6px_rgba(244,63,94,0.3)]',
        badge: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
        prefix: '[API LAW & COMPLIANCE]'
      };
    }
  };

  if (loading) {
    return (
      <div
        className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between text-xs font-mono text-slate-500"
        role="status"
        aria-label="Loading headlines ticker"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400/70 animate-pulse" />
          <span className="text-[11px] uppercase tracking-wider text-slate-400">SYS_HUD_TICKER: Loading live stream...</span>
          <span className={`${cursorBlink ? 'opacity-100' : 'opacity-0'} text-emerald-400`}>_</span>
        </div>
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />
      </div>
    );
  }

  const currentHeadline = headlines[currentIndex] || {
    title: error ? `SYS_ERROR: ${error}` : 'SYS_STATUS_OK: Command bridge telemetry operational.',
    category: error ? 'API Law & Compliance' : 'Research Breakthrough',
    source: error ? 'Network' : 'Local System Diagnostics'
  };

  const style = getCategoryStyles(currentHeadline.category);

  return (
    <div
      className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 sm:px-4 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 relative overflow-hidden group select-none"
      role="marquee"
      aria-live="off"
      aria-label="Intelligence headlines ticker"
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(16,185,129,0.02)_98%,rgba(16,185,129,0.02)_100%)] bg-[size:100%_4px] pointer-events-none"></div>
      
      <div className="flex items-start md:items-center gap-3 min-w-0 flex-1 w-full">
        <div className="p-1.5 bg-slate-900 rounded border border-slate-800 shrink-0 flex items-center justify-center">
          <Terminal className="w-4 h-4 text-emerald-500 animate-pulse" />
        </div>
        
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400 tracking-tight shrink-0">
          <span className="text-slate-500 uppercase tracking-widest text-[10px]">INTEL_STREAMS:</span>
        </div>

        <div className="min-w-0 flex-1 relative h-auto md:h-6 py-2 flex items-center overflow-hidden w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="flex flex-wrap items-center gap-2 text-xs font-mono w-full leading-relaxed"
            >
              <span className={`text-[10px] uppercase font-bold tracking-wider shrink-0 px-1.5 py-0.5 rounded border ${style.badge}`}>
                {style.prefix}
              </span>
              <span className="text-slate-500 text-[10px] shrink-0">
                ({currentHeadline.source})
              </span>
              <span className={`text-[11px] sm:text-xs leading-relaxed ${style.text}`}>
                {currentHeadline.title}
              </span>
              <span className={`${cursorBlink ? 'opacity-100' : 'opacity-0'} ${style.text} shrink-0`}>_</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end md:self-auto w-full md:w-auto justify-end border-t border-slate-900/60 md:border-t-0 pt-2 md:pt-0">
        <button 
          onClick={fetchHeadlines}
          className="p-1.5 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded text-slate-500 hover:text-emerald-400 transition-all cursor-pointer flex items-center justify-center"
          title="Manually force intel refresh"
          aria-label="Refresh headlines"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="text-[10px] font-mono text-slate-600 bg-slate-900/80 border border-slate-850 px-2 py-1 rounded">
          FPS: 60/SEC
        </div>
      </div>
    </div>
  );
}