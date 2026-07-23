import { IKudbeePlugin } from '@kudbee/types';

interface PluginCardProps {
  plugin: IKudbeePlugin;
  accent: string;
  glow: string;
  children?: React.ReactNode;
}

function isFaultState(status: string | undefined): boolean {
  return status === 'offline' || status === 'degraded';
}
function statusLED(status: string | undefined): string {
  if (status === 'active') return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse';
  if (isFaultState(status)) return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]';
  return 'bg-amber-400';
}

export function PluginCard({ plugin, accent, glow, children }: PluginCardProps) {
  const isFault = isFaultState(plugin.status);
  const faultGlow = isFault ? 'shadow-[0_0_15px_rgba(244,63,94,0.15)] border-rose-500/40' : '';

  return (
    <article
      id={plugin.id}
      data-plugin={plugin.category}
      className={`group relative flex min-h-[180px] min-w-0 flex-col overflow-hidden rounded-lg border-2 bg-slate-900/80 p-4 transition-all duration-300 hover:border-slate-600 ${accent} ${faultGlow}`}
      style={{ borderTopColor: '#334155', borderBottomColor: '#334155', boxShadow: isFault ? '0 0 20px rgba(244,63,94,0.12), inset 0 0 0 1px rgba(244,63,94,0.08)' : 'inset 0 0 0 1px rgba(148,163,184,0.04)' }}
    >
      {/* Rack-mount top rail with screw dots */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-slate-600 via-slate-500 to-slate-600 flex items-center justify-center gap-6">
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span className="w-1 h-1 rounded-full bg-slate-700" />
      </div>

      {/* Rack-mount bottom rail */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-slate-600 via-slate-500 to-slate-600 flex items-center justify-center gap-6">
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span className="w-1 h-1 rounded-full bg-slate-700" />
      </div>

      {/* Top glow line */}
      <div className={`pointer-events-none absolute inset-x-0 top-[3px] h-px bg-gradient-to-r from-transparent ${glow} to-transparent`} />

      {/* Header with rack ears */}
      <header className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status LED (rack-mount style) */}
          <span className={`h-2.5 w-2.5 rounded-full ${statusLED(plugin.status)}`} />
          {/* I/O connector indicator lights */}
          <span className="flex gap-[2px]">
            <span className={`h-1.5 w-1.5 rounded-full ${plugin.status === 'active' ? 'bg-emerald-300' : 'bg-slate-700'}`} />
            <span className={`h-1.5 w-1.5 rounded-full ${plugin.status === 'active' ? 'bg-cyan-300' : 'bg-slate-700'}`} />
          </span>
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-slate-300">
            {plugin.title}
          </h3>
        </div>
        {/* Channel number badge */}
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${
          plugin.status === 'active'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : isFaultState(plugin.status)
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        }`}>
          {isFault ? 'FAULT' : plugin.status?.toUpperCase() || 'IDLE'}
        </span>
      </header>

      {/* Main content */}
      <div className="mt-3 flex-1 text-xs text-slate-400">{children}</div>

      {/* Bottom I/O strip */}
      <footer className="mt-3 flex items-center justify-between border-t border-slate-800/60 pt-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          CH {plugin.gridSpan?.colSpan ?? '4'} · {plugin.category}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          {isFault ? 'SIGNAL LOST' : 'LINK OK'}
        </span>
      </footer>
    </article>
  );
}

export default PluginCard;
