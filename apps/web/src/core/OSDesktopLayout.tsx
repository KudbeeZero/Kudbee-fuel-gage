import { ReactNode } from 'react';
import { PluginContainer } from './PluginContainer';
import { usePluginStore } from './usePluginStore';

export function OSDesktopLayout({ children }: { children?: ReactNode }) {
  const { plugins, activePluginId, setActive } = usePluginStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 py-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {plugins.slice(0, 8).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(activePluginId === p.id ? null : p.id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 font-mono text-[10px] font-semibold transition-colors ${
                activePluginId === p.id
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-600'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </header>
      <main className="p-4">
        {activePluginId && plugins.find((p) => p.id === activePluginId) && (
          <PluginContainer
            component={plugins.find((p) => p.id === activePluginId)!.component}
            panelName={plugins.find((p) => p.id === activePluginId)!.name}
          />
        )}
        {children}
      </main>
    </div>
  );
}
