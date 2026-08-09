import { useState } from 'react';
import { Puzzle, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import { usePluginStore } from '../../core/usePluginStore';

export function PluginManager() {
  const { plugins, activePlugins, togglePlugin, isPluginEnabled } = usePluginStore();
  const [filter, setFilter] = useState('');

  const filtered = plugins.filter((p) =>
    !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.category?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-zinc-100 font-mono">Plugins</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {plugins.filter((p) => isPluginEnabled(p.id)).length}/{plugins.length} active
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-3 h-3 text-slate-500" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter plugins..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-[10px] font-mono text-zinc-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Plugin list */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-[10px] text-slate-600 font-mono text-center py-4">
            {filter ? 'No plugins match your filter' : 'No plugins registered'}
          </div>
        ) : (
          filtered.map((plugin) => {
            const isActive = isPluginEnabled(plugin.id);
            return (
              <div
                key={plugin.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  isActive
                    ? 'border-indigo-800/30 bg-indigo-950/20'
                    : 'border-slate-800/30 bg-slate-950/30 opacity-60'
                }`}
              >
                <span className="text-base">{plugin.icon || '\u25A0'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-zinc-200 truncate">{plugin.name}</div>
                  {plugin.category && (
                    <div className="text-[8px] text-slate-500 font-mono">{plugin.category}</div>
                  )}
                </div>
                <button
                  onClick={() => togglePlugin(plugin.id)}
                  className="flex-shrink-0 p-1 rounded hover:bg-slate-700/50 transition-colors"
                  title={isActive ? 'Disable plugin' : 'Enable plugin'}
                >
                  {isActive ? (
                    <ToggleRight className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-slate-600" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-[9px] text-slate-600 font-mono border-t border-slate-800 pt-3">
        <span>Registry v{plugins.length > 0 ? '1.0' : '--'}</span>
        <span>{plugins.filter(() => true).length} registered</span>
      </div>
    </div>
  );
}

export default PluginManager;
