import { IKudbeePlugin } from '@kudbee/types';
import { Lock } from 'lucide-react';
import { useState, Component, type ReactNode } from 'react';

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

export function PluginOfflineCard({
  pluginId,
  category,
  reason
}: {
  pluginId: string;
  category: string;
  reason?: string;
}) {
  return (
    <article
      id={`plugin-offline-${pluginId}`}
      className="group relative flex min-h-[180px] min-w-0 flex-col overflow-hidden rounded-lg border-2 border-slate-800 bg-slate-900/40 p-4"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-slate-600 via-slate-500 to-slate-600 flex items-center justify-center gap-6">
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span className="w-1 h-1 rounded-full bg-slate-700" />
      </div>
      <header className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
            {pluginId || 'UNKNOWN'}
          </h3>
        </div>
        <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-300">
          OFFLINE
        </span>
      </header>
      <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
        <Lock className="h-8 w-8 text-slate-600 mb-2" />
        <span className="font-mono text-[10px] text-slate-500">
          Plugin Unverified
        </span>
        <span className="mt-1 font-mono text-[9px] text-slate-600">
          {reason || `Identifier ${pluginId} not found in registry`}
        </span>
        <span className="mt-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-slate-600">
          {category}
        </span>
      </div>
      <footer className="mt-3 border-t border-slate-800/60 pt-2 font-mono text-[9px] uppercase tracking-widest text-slate-600">
        CH UNKNOWN · SIGNAL LOST
      </footer>
    </article>
  );
}

export function PluginCard({ plugin, accent, glow, children }: PluginCardProps) {
  const [renderError, setRenderError] = useState(false);

  if (renderError) {
    return (
      <PluginOfflineCard
        pluginId={plugin.id}
        category={plugin.category}
        reason="Render error — component failed to mount"
      />
    );
  }

  return (
    <PluginErrorHandler pluginId={plugin.id} onError={() => setRenderError(true)}>
      <PluginCardInner plugin={plugin} accent={accent} glow={glow}>
        {children}
      </PluginCardInner>
    </PluginErrorHandler>
  );
}

function PluginCardInner({ plugin, accent, glow, children }: PluginCardProps) {
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

interface PluginErrorHandlerProps {
  pluginId: string;
  children: ReactNode;
  onError: () => void;
}

class PluginErrorHandler extends Component<PluginErrorHandlerProps, { hasError: boolean }> {
  constructor(props: PluginErrorHandlerProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(e: unknown) {
    console.error(`[PluginErrorHandler] ${this.props.pluginId} render error:`, e);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default PluginCard;
