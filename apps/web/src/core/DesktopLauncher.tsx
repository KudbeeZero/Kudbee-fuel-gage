import { usePluginStore } from '../core/usePluginStore';

export function DesktopLauncher() {
  const { plugins, activePlugins, setActive, activePluginId } = usePluginStore();
  const enabled = plugins.filter((p) => activePlugins.has(p.id));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 p-6">
      {enabled.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setActive(activePluginId === p.id ? null : p.id)}
          onMouseEnter={() => { /* preload chunk */ }}
          className={`group rounded-xl border p-4 text-center transition-all hover:scale-105 ${
            activePluginId === p.id
              ? 'border-emerald-500/40 bg-emerald-500/10 shadow-lg shadow-emerald-500/5'
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
          }`}
        >
          <div className="mx-auto mb-2 h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center font-mono text-lg font-bold text-slate-300 group-hover:text-emerald-300">
            {p.name[0]}
          </div>
          <div className="font-mono text-[10px] font-semibold text-slate-300 truncate">{p.name}</div>
          <div className="font-mono text-[8px] text-slate-500 mt-0.5">{p.category}</div>
        </button>
      ))}
      {enabled.length === 0 && (
        <div className="col-span-full text-center font-mono text-xs text-slate-600 py-12">
          No plugins enabled. Press ⌘P to open Plugin Manager.
        </div>
      )}
    </div>
  );
}
