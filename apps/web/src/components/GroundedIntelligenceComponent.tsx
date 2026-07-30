import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  RefreshCw, 
  ExternalLink, 
  BookOpen, 
  Scale, 
  Zap, 
  Lightbulb, 
  ShieldAlert,
  Activity
} from 'lucide-react';
import { apiGet } from '../lib/apiClient';

interface Headline {
  title: string;
  summary: string;
  category: string;
  source: string;
}

interface Source {
  title: string;
  url: string;
}

export function GroundedIntelligenceComponent() {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchIntel = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{
        headlines?: Headline[];
        sources?: Source[];
        offline?: boolean;
      }>('/api/news/headlines');
      setHeadlines(data.headlines ?? []);
      setSources(data.sources ?? []);
      setOffline(!!data.offline);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch grounded intelligence.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel();
  }, []);

  // Set up periodic auto-refresh interval when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchIntel();
    }, 30000); // refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const categories = ['All', 'Research Breakthrough', 'Billing Regulation', 'API Law'];

  const filteredHeadlines = activeCategory === 'All' 
    ? headlines 
    : headlines.filter(h => h.category === activeCategory);

  const getCategoryStyles = (cat: string) => {
    switch (cat) {
      case 'Research Breakthrough':
        return {
          badge: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)]',
          icon: <Zap className="w-3.5 h-3.5 text-cyan-400" />
        };
      case 'Billing Regulation':
        return {
          badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.1)]',
          icon: <Scale className="w-3.5 h-3.5 text-amber-400" />
        };
      case 'API Law':
      default:
        return {
          badge: 'border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.1)]',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        };
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.07,
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12, scale: 0.98 },
    show: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* FILTER BUTTONS & CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/20 p-4 rounded-xl border border-slate-800/40">
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono tracking-wide transition-all ${
                activeCategory === cat 
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-semibold'
                  : 'border-slate-800/60 bg-slate-900/20 text-slate-400 hover:border-slate-700/80 hover:text-slate-200'
              } cursor-pointer`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 self-start sm:self-auto">
          {/* Auto Refresh Toggle */}
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-500 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500/20 peer-checked:after:bg-emerald-400"></div>
            <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 peer-checked:text-emerald-400">Auto (30s)</span>
          </label>

          <button 
            onClick={fetchIntel}
            disabled={loading}
            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 text-slate-950 rounded-lg text-xs font-mono font-bold tracking-wider uppercase transition-all duration-200 active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* HEADLINES PANEL */}
        <div className="lg:col-span-2 space-y-4">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-slate-900/10 border border-slate-800/30 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20 relative">
                  <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-ping opacity-25"></div>
                  <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Grounded Intelligence Stream Active</h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Grounded Search engines are analyzing global research publications and billing policies. Please wait...
                  </p>
                </div>
              </motion.div>
            ) : filteredHeadlines.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-slate-900/10 border border-slate-800/30 rounded-xl p-12 text-center"
              >
                <p className="text-xs text-slate-500">No active intelligence alerts discovered.</p>
              </motion.div>
            ) : (
              <motion.div 
                key="headlines-container"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-4"
              >
                {filteredHeadlines.map((headline, idx) => {
                  const style = getCategoryStyles(headline.category);
                  return (
                    <motion.div
                      key={`${headline.title}-${idx}`}
                      variants={itemVariants}
                      className="bg-slate-900/40 border border-slate-800/50 hover:border-slate-700/60 p-5 rounded-xl transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-emerald-500/[0.01] rounded-full blur-2xl group-hover:bg-emerald-500/[0.02] transition-all"></div>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider rounded border ${style.badge}`}>
                            {style.icon}
                            {headline.category}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            via {headline.source}
                          </span>
                        </div>
                      </div>

                      <h3 className="font-display font-bold text-slate-100 group-hover:text-emerald-400 transition-colors text-base tracking-tight mb-2">
                        {headline.title}
                      </h3>
                      
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        {headline.summary}
                      </p>

                      <div className="pt-3 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-emerald-500/60" />
                          Grounded via live search
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dynamic Grounding Citations */}
        <div className="space-y-6">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <BookOpen className="w-16 h-16 text-emerald-400" />
            </div>

            <h2 className="font-display font-semibold text-slate-200 text-sm tracking-wide mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              Dynamic Grounding Sources
            </h2>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed font-sans">
              These sources represent live indexed pages verified during deep search retrieval.
            </p>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {sources.length === 0 ? (
                <div className="text-center py-4 border border-dashed border-slate-800/60 rounded-lg text-xs text-slate-600 font-mono">
                  No active grounding sources loaded
                </div>
              ) : (
                sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-slate-800 bg-slate-950/40 hover:border-emerald-500/30 hover:bg-slate-900/40 transition-all group text-left cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-xs text-slate-300 group-hover:text-slate-100 truncate">
                        {src.title}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono truncate mt-0.5">
                        {src.url}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0 mt-0.5" />
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Scale className="w-16 h-16 text-emerald-400" />
            </div>

            <h2 className="font-display font-semibold text-slate-200 text-sm tracking-wide mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-emerald-400" />
              Regulatory Focus
            </h2>
            <div className="space-y-3 text-xs text-slate-400 leading-relaxed font-sans">
              <div className="flex gap-2 items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5"></span>
                <span>
                  <strong className="text-slate-300">Global Pricing Alignments:</strong> Real-time indexing identifies standard unit changes to calculate and predict billing overheads.
                </span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5"></span>
                <span>
                  <strong className="text-slate-300">Model Pipeline Safety:</strong> High-quality research inputs offer insight into secure data handling and pipeline design rules.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
