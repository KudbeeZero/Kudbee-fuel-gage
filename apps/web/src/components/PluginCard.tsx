import { IKudbeePlugin } from '@kudbee/types';

interface PluginCardProps {
  plugin: IKudbeePlugin;
  accent: string;
  glow: string;
  children?: React.ReactNode;
}

export function PluginCard({ plugin, accent, glow, children }: PluginCardProps) {
  return (
    <article
      id={plugin.id}
      data-plugin={plugin.category}
      className={`group relative flex min-h-[180px] flex-col overflow-hidden rounded-2xl border bg-slate-900/60 p-5 transition-all hover:border-emerald-500/40 ${accent}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${glow} to-transparent`} />
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${glow.replace('bg-gradient', 'bg').split(' ')[0]}`} />
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-200">
            {plugin.title}
          </h3>
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${
            plugin.status === 'active'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
        >
          {plugin.status}
        </span>
      </header>
      <div className="mt-4 flex-1 text-xs text-slate-400">{children}</div>
      <footer className="mt-4 border-t border-slate-800/60 pt-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        {plugin.category} · col-span {plugin.gridSpan.colSpan}
        {plugin.gridSpan.rowSpan ? ` · row-span ${plugin.gridSpan.rowSpan}` : ''}
      </footer>
    </article>
  );
}
