import React, { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../store/uiStore';
import { useTerminalStore } from '../store/terminalStore';
import { ChevronDown, Trash2 } from 'lucide-react';
import { apiGet } from '../lib/apiClient';
import type { ConsoleLog } from '../store/terminalStore';

export function ConsoleDock() {
  const isConsoleExpanded = useUIStore((state) => state.isConsoleExpanded);
  const toggleConsole = useUIStore((state) => state.toggleConsole);
  const externalLogs = useTerminalStore((state) => state.externalLogs);

  const [renderedLogs, setRenderedLogs] = useState<ConsoleLog[]>([
    { id: 'initial-1', type: 'info', label: 'BOOT', message: 'Control Tower initialized. Neon Postgres pool (max 10), Upstash Redis connected.', time: new Date().toLocaleTimeString() },
    { id: 'initial-2', type: 'info', label: 'BOOT', message: 'SSE event stream online. HERMES auditor worker standing by.', time: new Date().toLocaleTimeString() },
    { id: 'initial-3', type: 'slate', label: 'SYSTEM', message: 'Agent Context Factory + Token Forge RAG ready. Node 22 ESM strict mode active.', time: new Date().toLocaleTimeString() }
  ]);
  const [isPaused, setIsPaused] = useState(false);

  const processedExternalIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!externalLogs || externalLogs.length === 0) return;
    const newLogs = externalLogs.filter((log) => !processedExternalIds.current.has(log.id));
    if (newLogs.length === 0) return;
    newLogs.forEach((log) => processedExternalIds.current.add(log.id));
    const mapped = newLogs.map((log) => ({
      ...log,
      id: `external-${log.id}`
    }));
    setRenderedLogs((prev) => [...mapped, ...prev].slice(0, 100));
  }, [externalLogs]);

  const lastHermesTsRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const pullHermes = async () => {
      if (isPaused) return;
      try {
        const logs = await apiGet<Array<{ ts: string; line: string }>>('/api/governance/hermes-logs');
        if (cancelled || !Array.isArray(logs)) return;
        for (const entry of logs) {
          if (!entry?.ts || entry.ts === lastHermesTsRef.current) continue;
          lastHermesTsRef.current = entry.ts;
          const newLog: ConsoleLog = {
            id: `hermes-${entry.ts}`,
            type: 'info',
            label: 'HERMES',
            message: entry.line,
            time: new Date(entry.ts).toLocaleTimeString()
          };
          setRenderedLogs((prev) => [newLog, ...prev].slice(0, 100));
        }
      } catch {
        /* backend offline — skip silently */
      }
    };
    void pullHermes();
    const id = setInterval(() => void pullHermes(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isPaused]);

  const lastHealthRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const pullHealth = async () => {
      if (isPaused) return;
      try {
        const health = await apiGet<{ status: string; dependencies: Record<string, string> }>('/health');
        if (cancelled || !health?.dependencies) return;
        const depEntries = Object.entries(health.dependencies)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        const healthLine = `Infra Health: ${depEntries}`;
        if (healthLine === lastHealthRef.current) return;
        lastHealthRef.current = healthLine;
        const newLog: ConsoleLog = {
          id: `health-${Date.now()}`,
          type: 'info',
          label: 'HEALTH',
          message: healthLine,
          time: new Date().toLocaleTimeString()
        };
        setRenderedLogs((prev) => [newLog, ...prev].slice(0, 100));
      } catch {
        /* backend offline — skip silently */
      }
    };
    void pullHealth();
    const id = setInterval(() => void pullHealth(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isPaused]);

  const clearLogs = () => {
    setRenderedLogs([]);
  };

  const currentLog = renderedLogs[0] || { label: 'SYS', message: 'Idle - awaiting pipeline synchronisation...' };

  return (
    <div 
      className="fixed bottom-0 inset-x-0 z-40 bg-slate-950 border-t border-slate-800 flex flex-col transition-all duration-300 ease-in-out pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.5)] font-mono text-xs text-slate-300"
      style={{ height: isConsoleExpanded ? '18rem' : 'calc(3rem + env(safe-area-inset-bottom))' }}
    >
      <div 
        onClick={toggleConsole}
        className="h-12 flex items-center justify-between px-6 border-b border-slate-900 bg-slate-950/40 cursor-pointer select-none shrink-0 active:scale-[0.99] transition-all duration-100"
      >
        {!isConsoleExpanded ? (
          <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex items-center gap-2 text-[11px] truncate text-slate-300 flex-1">
              <span className="text-emerald-400 shrink-0 select-none font-bold animate-pulse">&gt;</span>
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 select-none">
                {currentLog.label}
              </span>
              <span className="truncate text-slate-200">{currentLog.message}</span>
              <span className="w-1.5 h-3.5 bg-emerald-400 inline-block animate-terminal-blink shrink-0 ml-1"></span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold tracking-wider text-slate-200 uppercase">
              KUDBEE_LIVE_TELEMETRY_STREAM_MONITOR
            </span>
            <span className="hidden sm:inline text-[9px] text-slate-500 uppercase tracking-widest">
              [pipeline online - active]
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isConsoleExpanded && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`px-2 py-0.5 rounded border text-[9px] font-bold tracking-wider transition-all uppercase ${
                  isPaused 
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' 
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-300 hover:border-slate-700'
                }`}
                title={isPaused ? "Resume pollers" : "Pause pollers"}
              >
                {isPaused ? "RESUME" : "PAUSE"}
              </button>
              <button
                onClick={clearLogs}
                className="p-1 rounded border border-slate-800 bg-slate-900 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-all cursor-pointer"
                title="Clear logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 cursor-pointer" onClick={toggleConsole}>
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">
              {isConsoleExpanded ? 'COLLAPSE' : 'EXPAND'}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isConsoleExpanded ? 'rotate-0' : 'rotate-180'}`} />
          </div>
        </div>
      </div>

      <div 
        className={`flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent select-text ${
          isConsoleExpanded ? 'opacity-100 block' : 'opacity-0 hidden'
        }`}
      >
        {renderedLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 italic font-mono text-xs">
            Console stream cleared. Awaiting telemetry frames...
          </div>
        ) : (
          renderedLogs.map((event) => (
            <div 
              key={event.id} 
              className="flex items-start gap-3 p-1.5 hover:bg-slate-900/60 rounded transition-all group font-mono text-xs"
            >
              <span className="text-slate-500 shrink-0 font-bold select-none">&gt;</span>
              <div className="mt-0.5 shrink-0">
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border ${
                  event.type === 'info' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(52,211,153,0.1)]' :
                  event.type === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_8px_rgba(251,191,36,0.1)]' : 
                  event.type === 'error' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]' :
                  'bg-slate-800/50 text-slate-400 border-slate-700'
                }`}>
                  {event.label}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] leading-relaxed text-slate-300 group-hover:text-slate-100 transition-colors">
                  {event.message}
                </p>
              </div>
              <div className="shrink-0 text-[9px] text-slate-500 group-hover:text-slate-400 mt-0.5 select-none font-mono">
                {event.time}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
