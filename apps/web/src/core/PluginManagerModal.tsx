import { useEffect, useState } from 'react';
import { X, Search, Check, Zap } from 'lucide-react';
import { usePluginStore } from '../core/usePluginStore';

export function PluginManagerModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const { plugins, activePlugins, togglePlugin, isPluginEnabled } = usePluginStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'p' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!show) return null;

  const filtered = query.trim()
    ? plugins.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : plugins;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold text-slate-200">Plugin Manager</h2>
          <button type="button" onClick={onClose} className="rounded border border-slate-800 p-1 text-slate-400 hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-2 mb-4">
          <Search className="h-3 w-3 text-slate-500" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plugins…" className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
          {filtered.map((p) => {
            const enabled = isPluginEnabled(p.id);
            return (
              <div key={p.id} className={`rounded-lg border p-3 transition-colors ${enabled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold text-slate-200">{p.name}</span>
                  <button type="button" onClick={() => togglePlugin(p.id)} className={`rounded-full border p-1 transition-colors ${enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300'}`}>
                    {enabled ? <Check className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                  </button>
                </div>
                <div className="mt-1 font-mono text-[9px] text-slate-500">{p.description}</div>
                <div className="mt-1 font-mono text-[8px] text-slate-600">{p.category} · {p.id}</div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-center font-mono text-[9px] text-slate-600">⌘P to open · {plugins.length} plugins</p>
      </div>
    </div>
  );
}
