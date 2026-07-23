import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useOsSnapshot } from '../components/OsStreamProvider';
import { useEventStream } from '../hooks/useEventStream';
import { AgentTerminal } from '../components/studio/AgentTerminal';
import { WorkspaceRecoveryBoundary } from '../components/WorkspaceRecoveryBoundary';
import {
  Activity, AlertTriangle, Brain,
  Database, RefreshCw, Shield, Terminal
} from 'lucide-react';

interface StudioContextValue {
  eventStream: ReturnType<typeof useEventStream>;
  osSnapshot: ReturnType<typeof useOsSnapshot>['snapshot'];
  osConnected: boolean;
  terminalCommands: string[];
  pushTerminalEvent: (text: string) => void;
  refreshAll: () => void;
}

export function createStudioContext(): StudioContextValue | null {
  return null;
}

const STUDIO_TABS = [
  { id: 'governance', label: 'GOVERNANCE', icon: Shield, description: 'HITL approval gates & policy engine' },
  { id: 'tokens', label: 'TOKENS', icon: Brain, description: 'Think token lifecycle & vector trajectories' },
  { id: 'telemetry', label: 'TELEMETRY', icon: Activity, description: 'Live metrics, model matrix & circuit breaker' },
  { id: 'firewall', label: 'FIREWALL', icon: AlertTriangle, description: 'Interceptor guardrails & triage hold' }
] as const;

export type StudioTabId = typeof STUDIO_TABS[number]['id'];

interface StudioLayoutProps {
  activeTab: StudioTabId;
  onTabChange: (tab: StudioTabId) => void;
  children: ReactNode;
}

export function StudioLayout({ activeTab, onTabChange, children }: StudioLayoutProps) {
  const { snapshot: os, connected: osConnected } = useOsSnapshot();
  const eventStream = useEventStream();
  const [terminalCommands, setTerminalCommands] = useState<string[]>([]);
  const [terminalCollapsed, setTerminalCollapsed] = useState(true);

  const pushTerminalEvent = (text: string) => {
    setTerminalCommands((prev) => [...prev.slice(-49), text]);
  };

  const refreshAll = () => {
    pushTerminalEvent(`[studio] manual refresh triggered`);
  };

  return (
    <WorkspaceRecoveryBoundary panel="Studio Layout">
    <div className="flex h-full min-h-dvh bg-slate-950 text-slate-200">
      {/* VERTICAL SIDEBAR */}
      <nav className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/60 flex flex-col">
        {/* Studio brand header */}
        <div className="px-4 py-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <span className="font-display text-sm font-semibold text-slate-200 tracking-tight">STUDIO</span>
          </div>
          <div className="mt-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Hardware Lab</div>
        </div>

        {/* Tab navigation */}
        <div className="flex-1 py-2 space-y-0.5">
          {STUDIO_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-mono transition-all text-left group ${
                  isActive
                    ? 'bg-emerald-500/10 border-r-2 border-emerald-500 text-emerald-400'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border-r-2 border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <div>
                  <div className="font-semibold tracking-wider text-[11px]">{tab.label}</div>
                  <div className="text-[9px] text-slate-600 group-hover:text-slate-500 leading-tight">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Status footer */}
        <div className="px-3 py-3 border-t border-slate-800/60 space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={`relative flex h-1.5 w-1.5 ${osConnected && os.services.postgres.ok ? '' : 'opacity-50'}`}>
              <span className={`absolute inline-flex h-full w-full rounded-full ${osConnected && os.services.postgres.ok ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${osConnected && os.services.postgres.ok ? 'bg-emerald-500' : 'bg-slate-600'}`} />
            </span>
            <span className="text-slate-500">PG</span>
            <span className={osConnected && os.services.postgres.ok ? 'text-emerald-400' : 'text-slate-600'}>
              {osConnected && os.services.postgres.ok ? `${os.services.postgres.latencyMs ?? '—'}ms` : 'OFF'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={`relative flex h-1.5 w-1.5 ${osConnected && os.services.redis.ok ? '' : 'opacity-50'}`}>
              <span className={`absolute inline-flex h-full w-full rounded-full ${osConnected && os.services.redis.ok ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${osConnected && os.services.redis.ok ? 'bg-emerald-500' : 'bg-slate-600'}`} />
            </span>
            <span className="text-slate-500">RD</span>
            <span className={osConnected && os.services.redis.ok ? 'text-emerald-400' : 'text-slate-600'}>
              {osConnected && os.services.redis.ok ? `${os.services.redis.latencyMs ?? '—'}ms` : 'OFF'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <Database className="w-3 h-3 text-slate-500" />
            <span className="text-slate-500">SSE</span>
            <span className={eventStream.connected ? 'text-emerald-400' : 'text-rose-400'}>
              {eventStream.connected ? 'LIVE' : 'DOWN'}
            </span>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="shrink-0 border-b border-slate-800 bg-slate-900/40 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {STUDIO_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono font-semibold tracking-wider transition-all ${
                      isActive
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
            <button onClick={refreshAll} className="flex items-center gap-1 text-slate-600 hover:text-emerald-400 transition-colors">
              <RefreshCw className="w-3 h-3" />
              <span>REFRESH</span>
            </button>
            <span className="text-slate-700">|</span>
            <span>UPTIME: {os.uptime}s</span>
          </div>
        </header>

        {/* SCROLLABLE CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.div>
        </main>

        {/* AGENT TERMINAL — collapsible bottom console */}
        <AgentTerminal collapsed={terminalCollapsed} onToggleCollapse={() => setTerminalCollapsed((v) => !v)} />
      </div>
    </div>
    </WorkspaceRecoveryBoundary>
  );
}
