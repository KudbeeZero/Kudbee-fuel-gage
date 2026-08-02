/**
 * THINKBOX PR-008 — Dashboard Health Overlay
 *
 * Developer mode overlay showing: render FPS, SSE status, API latency,
 * active subscriptions, memory usage, component render counts, event
 * throughput. Toggle with Developer Mode.
 */

import { useState, useEffect, useRef } from 'react';
import { Activity, Wifi, WifiOff, Clock, Zap, Eye, EyeOff, Layers, Cpu } from 'lucide-react';

interface HealthOverlayProps {
  fps?: number;
  sseStatus?: 'connected' | 'disconnected' | 'reconnecting';
  apiLatency?: number;
  eventCount?: number;
  renderCount?: number;
  memoryUsage?: number;
  subscriptions?: number;
}

export function DashboardHealthOverlay({
  fps = 60,
  sseStatus = 'disconnected',
  apiLatency = 0,
  eventCount = 0,
  renderCount = 0,
  memoryUsage,
  subscriptions = 0,
}: HealthOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [currentFps, setCurrentFps] = useState(fps);
  const fpsRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFps(fpsRef.current);
      fpsRef.current = 0;
      setFrameCount(c => c + 1);
    }, 1000);

    let lastTime = performance.now();
    const tick = () => {
      fpsRef.current++;
      lastTime = performance.now();
      requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeydown);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-2 right-2 z-50 p-1.5 rounded-lg bg-slate-900/80 border border-slate-700/50 text-slate-600 hover:text-slate-400 text-[9px] font-mono"
        title="Developer Mode (Ctrl+Shift+D)"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
    );
  }

  const latencyColor = apiLatency < 100 ? 'text-emerald-400' : apiLatency < 500 ? 'text-amber-400' : 'text-rose-400';
  const sseColor = sseStatus === 'connected' ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className="fixed bottom-2 right-2 z-50 rounded-xl border border-indigo-500/20 bg-slate-950/95 backdrop-blur shadow-2xl w-72 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 bg-indigo-500/5">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-indigo-400" />
          <span className="font-mono text-[10px] font-semibold text-slate-300">DEV OVERLAY</span>
        </div>
        <button onClick={() => setVisible(false)} className="p-0.5 text-slate-600 hover:text-slate-400">
          <EyeOff className="w-3 h-3" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-slate-900/60 p-2">
            <div className="flex items-center gap-1 text-[8px] text-slate-500 mb-0.5">
              <Cpu className="w-2.5 h-2.5" /> FPS
            </div>
            <div className="text-sm font-mono font-bold text-slate-300 tabular-nums">{currentFps}</div>
          </div>
          <div className="rounded bg-slate-900/60 p-2">
            <div className="flex items-center gap-1 text-[8px] text-slate-500 mb-0.5">
              <Wifi className="w-2.5 h-2.5" /> SSE
            </div>
            <div className={`text-xs font-mono font-bold ${sseColor}`}>{sseStatus}</div>
          </div>
          <div className="rounded bg-slate-900/60 p-2">
            <div className="flex items-center gap-1 text-[8px] text-slate-500 mb-0.5">
              <Clock className="w-2.5 h-2.5" /> API
            </div>
            <div className={`text-sm font-mono font-bold tabular-nums ${latencyColor}`}>{apiLatency}ms</div>
          </div>
          <div className="rounded bg-slate-900/60 p-2">
            <div className="flex items-center gap-1 text-[8px] text-slate-500 mb-0.5">
              <Zap className="w-2.5 h-2.5" /> Events
            </div>
            <div className="text-sm font-mono font-bold text-slate-300 tabular-nums">{eventCount}</div>
          </div>
        </div>

        <div className="space-y-1 text-[9px] text-slate-500">
          <div className="flex justify-between">
            <span className="flex items-center gap-1"><Layers className="w-2.5 h-2.5" /> Renders</span>
            <span className="font-mono">{renderCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Subscriptions</span>
            <span className="font-mono">{subscriptions}</span>
          </div>
          {memoryUsage !== undefined && (
            <div className="flex justify-between">
              <span>Memory</span>
              <span className="font-mono">{Math.round(memoryUsage / 1024 / 1024)}MB</span>
            </div>
          )}
        </div>

        <div className="pt-1 border-t border-slate-800/40">
          <div className="text-[8px] text-slate-600 text-center">Ctrl+Shift+D to toggle · THINKBOX PR-008</div>
        </div>
      </div>
    </div>
  );
}
