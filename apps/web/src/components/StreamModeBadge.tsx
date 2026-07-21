import { Radio, Wifi, WifiOff, Pause, Play } from 'lucide-react';
import type { StreamMode } from '../hooks/useTelemetryStream';

interface StreamModeBadgeProps {
  mode: StreamMode;
  paused: boolean;
  onTogglePause: () => void;
  onReconnect: () => void;
}

export function StreamModeBadge({ mode, paused, onTogglePause, onReconnect }: StreamModeBadgeProps) {
  const effective = paused ? 'DISCONNECTED' : mode;
  const BAG = {
    SSE: {
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      label: 'STREAM · SSE',
      icon: <Radio className="h-3 w-3 animate-pulse" />
    },
    POLLING: {
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      label: 'STREAM · POLL',
      icon: <Wifi className="h-3 w-3" />
    },
    DISCONNECTED: {
      color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
      label: paused ? 'STREAM · PAUSED' : 'STREAM · OFFLINE',
      icon: <WifiOff className="h-3 w-3" />
    }
  };
  const config = (BAG as any)[effective] || { color: 'text-slate-400 border-slate-700 bg-slate-900', label: 'STREAM · UNKNOWN', icon: <WifiOff className="h-3 w-3" /> };

  return (
    <div className="flex items-center gap-1.5">
      <button
        id="stream-mode-badge"
        type="button"
        onClick={onReconnect}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${config.color}`}
        title="Reconnect stream"
      >
        {config.icon}
        {config.label}
      </button>
      <button
        id="stream-pause-toggle"
        type="button"
        onClick={onTogglePause}
        className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
        title={paused ? 'Resume stream' : 'Pause stream'}
      >
        {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        {paused ? 'RESUME' : 'PAUSE'}
      </button>
    </div>
  );
}
