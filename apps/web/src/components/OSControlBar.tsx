import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, Pause, Play, Radio, Search, Zap, Server, Shield, Scale, Globe, Bell, Settings, LayoutDashboard, Calculator, History, Activity, Cpu, Sparkles, ArrowRight, Loader2, CheckCircle2, XCircle, Clock, Stethoscope } from 'lucide-react';
import { useCommandDispatcher, commandRunners, type DispatchedCommand } from '../store/commandDispatcher';
import { WorkspaceBar } from './WorkspaceBar';
import { apiGet } from '../lib/apiClient';

export type OSToggleState = {
  dbIngestion: boolean;
  pauseStream: boolean;
  manualPulse: boolean;
};

const STORAGE_KEY = 'kudbee.oscontrolbar.v1';

function loadToggles(): OSToggleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as OSToggleState;
  } catch {
    /* ignore */
  }
  return { dbIngestion: true, pauseStream: false, manualPulse: false };
}

function persistToggles(state: OSToggleState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

interface OSControlBarProps {
  isAuthenticated: boolean;
  onOpenPalette: () => void;
}

export function OSControlBar({ isAuthenticated, onOpenPalette }: OSControlBarProps) {
  const [toggles, setToggles] = useState<OSToggleState>(loadToggles);
  const [now, setNow] = useState(new Date());
  const commands = useCommandDispatcher((s) => s.commands);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const updateToggle = useCallback((key: keyof OSToggleState) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persistToggles(next);
      return next;
    });
  }, []);

  const lastCommand = commands[0];
  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPhone|iPad/i.test(navigator.platform);
  }, []);

  return (
    <div
      id="os-control-bar"
      className="fixed bottom-12 inset-x-0 z-30 px-3 pb-2 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-[1400px]">
        <div
          className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md backdrop-saturate-150"
        >
          <div className="flex items-center gap-1.5 pl-1 pr-2">
            <Radio className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">OS</span>
            <span className="font-mono text-[9px] text-slate-500">v1</span>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          <ToggleChip
            id="toggle-db-ingestion"
            active={toggles.dbIngestion}
            activeLabel="DB INGESTION"
            inactiveLabel="INGEST PAUSED"
            onClick={() => updateToggle('dbIngestion')}
            accent="emerald"
            icon={<Database className="h-3 w-3" />}
          />

          <ToggleChip
            id="toggle-pause-stream"
            active={!toggles.pauseStream}
            activeLabel="STREAM LIVE"
            inactiveLabel="STREAM PAUSED"
            onClick={() => updateToggle('pauseStream')}
            accent={toggles.pauseStream ? 'amber' : 'cyan'}
            icon={toggles.pauseStream ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          />

          <ToggleChip
            id="toggle-manual-pulse"
            active={toggles.manualPulse}
            activeLabel="PULSE ARMED"
            inactiveLabel="PULSE IDLE"
            onClick={() => updateToggle('manualPulse')}
            accent={toggles.manualPulse ? 'violet' : 'slate'}
            icon={<Zap className="h-3 w-3" />}
          />

          <div className="h-6 w-px bg-slate-800" />

          <button
            id="os-manual-pulse-btn"
            type="button"
            disabled={!toggles.manualPulse || !isAuthenticated}
            aria-label="Manual Pulse — trigger Crucible dispatch"
            onClick={() => {
              if (!toggles.manualPulse) return;
              void commandRunners.crucibleDispatch();
            }}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
              toggles.manualPulse
                ? 'border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
                : 'border-slate-800 bg-slate-950 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Zap className="h-3 w-3" />
            MANUAL PULSE
          </button>

          <button
            id="os-resync-vector-btn"
            type="button"
            aria-label="Resync Vector Store"
            onClick={() => void commandRunners.resyncVector()}
            className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20"
          >
            <Server className="h-3 w-3" />
            RESYNC
          </button>

          <div className="ml-auto flex items-center gap-2">
            <WorkspaceBar />
            <DispatchStatus command={lastCommand} />
            <button
              id="open-command-palette"
              type="button"
              onClick={onOpenPalette}
              className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[10px] text-slate-400 transition-all hover:border-emerald-500/40 hover:text-emerald-300"
              title="Open command palette"
              aria-label="Open command palette"
              aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            >
              <Search className="h-3 w-3" />
              <span>Search</span>
              <span className="ml-1 hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[9px] text-slate-500">
                {isMac ? '⌘' : 'Ctrl'}K
              </span>
            </button>
            <span className="hidden md:inline font-mono text-[9px] uppercase tracking-widest text-slate-500">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToggleChipProps {
  id: string;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  accent: 'emerald' | 'cyan' | 'amber' | 'violet' | 'slate';
  icon: React.ReactNode;
  onClick: () => void;
}

const ACCENT_MAP: Record<ToggleChipProps['accent'], { active: string; inactive: string }> = {
  emerald: {
    active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    inactive: 'border-slate-800 bg-slate-950 text-slate-500'
  },
  cyan: {
    active: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    inactive: 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  },
  amber: {
    active: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    inactive: 'border-slate-800 bg-slate-950 text-slate-500'
  },
  violet: {
    active: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
    inactive: 'border-slate-800 bg-slate-950 text-slate-500'
  },
  slate: {
    active: 'border-slate-700 bg-slate-800 text-slate-200',
    inactive: 'border-slate-800 bg-slate-950 text-slate-500'
  }
};

function ToggleChip({ id, active, activeLabel, inactiveLabel, accent, icon, onClick }: ToggleChipProps) {
  const styles = ACCENT_MAP[accent];
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
        active ? styles.active : styles.inactive
      }`}
      title={active ? 'Click to disable' : 'Click to enable'}
      aria-label={`${active ? activeLabel : inactiveLabel} — ${active ? 'Click to disable' : 'Click to enable'}`}
      aria-pressed={active}
    >
      {icon}
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

function DispatchStatus({ command }: { command: DispatchedCommand | undefined }) {
  if (!command) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-600">
        <Clock className="h-3 w-3" />
        DISPATCH IDLE
      </span>
    );
  }
  const config = {
    QUEUED: { color: 'text-slate-400', icon: <Clock className="h-3 w-3" /> },
    PROCESSING: { color: 'text-amber-400', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    SUCCESS: { color: 'text-emerald-400', icon: <CheckCircle2 className="h-3 w-3" /> },
    FAILED: { color: 'text-rose-400', icon: <XCircle className="h-3 w-3" /> }
  }[command.state];
  return (
    <span
      id="os-dispatch-status"
      role="status"
      aria-live="polite"
      aria-label={`Command status: ${command.label} — ${command.state}`}
      className={`hidden md:inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest ${config.color}`}
      title={command.detail || command.description}
    >
      {config.icon}
      {command.label}
      <span className="opacity-60">· {command.state}</span>
    </span>
  );
}

export interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'Navigate' | 'Dispatch' | 'Diagnostic';
  keywords?: string[];
  perform: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

const NAV_ITEMS: Array<{ label: string; icon: React.ComponentType<{ className?: string }>; keywords: string[] }> = [
  { label: 'Dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] },
  { label: 'Playground', icon: Calculator, keywords: ['calc', 'cost'] },
  { label: 'History', icon: History, keywords: ['logs', 'telemetry'] },
  { label: 'Gateway', icon: Globe, keywords: ['keys', 'providers'] },
  { label: 'Control Tower', icon: Radio, keywords: ['racks', 'plugins'] },
  { label: 'Interceptor', icon: Shield, keywords: ['firewall', 'triage'] },
  { label: 'Intelligence', icon: Activity, keywords: ['charts'] },
  { label: 'Governance', icon: Scale, keywords: ['approval'] },
  { label: 'Alerts', icon: Bell, keywords: ['alerts'] },
  { label: 'Settings', icon: Settings, keywords: ['config'] }
];

export function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<PaletteCommand[]>(() => {
    const navCommands: PaletteCommand[] = NAV_ITEMS.map((item) => ({
      id: `nav-${item.label}`,
      label: `Go to ${item.label}`,
      description: `Switch the active view to ${item.label}`,
      icon: item.icon,
      group: 'Navigate',
      keywords: [item.label.toLowerCase(), ...item.keywords],
      perform: () => {
        onNavigate(item.label);
        onClose();
      }
    }));

    const dispatchCommands: PaletteCommand[] = [
      {
        id: 'dispatch-hermes',
        label: 'Trigger HERMES Audit',
        description: 'Spawn a HERMES auditor sweep',
        icon: Sparkles,
        group: 'Dispatch',
        keywords: ['hermes', 'audit', 'review'],
        perform: () => {
          void commandRunners.hermesAudit();
          onClose();
        }
      },
      {
        id: 'dispatch-crucible',
        label: 'Run Crucible Cycle',
        description: 'Trigger an autonomous Crucible reasoning cycle',
        icon: Cpu,
        group: 'Dispatch',
        keywords: ['crucible', 'agent', 'cycle'],
        perform: () => {
          void commandRunners.crucibleDispatch();
          onClose();
        }
      },
      {
        id: 'dispatch-resync',
        label: 'Re-sync Vector Store',
        description: 'Reconcile the vector memory index',
        icon: Server,
        group: 'Dispatch',
        keywords: ['vector', 'memory', 'resync'],
        perform: () => {
          void commandRunners.resyncVector();
          onClose();
        }
      },
      {
        id: 'dispatch-purge',
        label: 'Purge Telemetry Ledger',
        description: 'Reset the telemetry_traces table',
        icon: Database,
        group: 'Dispatch',
        keywords: ['purge', 'reset', 'telemetry'],
        perform: () => {
          void commandRunners.telemetryPurge();
          onClose();
        }
      }
    ];

    const diagnosticCommands: PaletteCommand[] = [
      {
        id: 'diag-ping',
        label: 'Verify Backend Connectivity',
        description: 'Round-trip a /api/dashboard/summary ping',
        icon: Zap,
        group: 'Diagnostic',
        keywords: ['ping', 'connectivity', 'health'],
        perform: async () => {
          try {
            const data = await apiGet('/api/dashboard/summary');
            useCommandDispatcher.getState().enqueue({
              kind: 'PLAYGROUND_RUN',
              label: 'Diagnostic Ping',
              description: `Backend reachable — OK`
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            useCommandDispatcher.getState().enqueue({
              kind: 'PLAYGROUND_RUN',
              label: 'Diagnostic Ping',
              description: `Failed: ${message}`
            });
          }
          onClose();
        }
      },
      {
        id: 'diag-search',
        label: 'Search Telemetry',
        description: 'Open History and run universal search',
        icon: Search,
        group: 'Diagnostic',
        keywords: ['search', 'telemetry', 'logs', 'audit'],
        perform: () => {
          onNavigate('History');
          onClose();
        }
      },
      {
        id: 'diag-system',
        label: 'Run System Diagnostic',
        description: 'Comprehensive self-diagnostic probe',
        icon: Stethoscope,
        group: 'Diagnostic',
        keywords: ['diagnostic', 'system', 'health', 'probe'],
        perform: async () => {
          try {
            const data = await apiGet<{ status?: string }>('/api/system/diagnostics');
            useCommandDispatcher.getState().enqueue({
              kind: 'PLAYGROUND_RUN',
              label: 'System Diagnostic',
              description: `status: ${data?.status || 'ok'}`
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            useCommandDispatcher.getState().enqueue({
              kind: 'PLAYGROUND_RUN',
              label: 'System Diagnostic',
              description: `Failed: ${message}`
            });
          }
          onClose();
        }
      }
    ];

    return [...navCommands, ...dispatchCommands, ...diagnosticCommands];
  }, [onClose, onNavigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const haystack = `${c.label} ${c.description} ${c.keywords?.join(' ') ?? ''} ${c.group}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const id = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) void item.perform();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, filtered, onClose]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="command-palette-overlay"
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 backdrop-blur-sm px-4 pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            id="command-palette-panel"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                id="command-palette-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a command, view, or diagnostic…"
                className="flex-1 bg-transparent font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
                aria-label="Search commands, views, or diagnostics"
                role="combobox"
                aria-expanded={filtered.length > 0}
                aria-controls="command-palette-results"
              />
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-600">esc</span>
            </div>

            <div id="command-palette-results" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center font-mono text-xs text-slate-600">
                  No matches for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <PaletteGroup
                  commands={filtered}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/40 px-4 py-2 font-mono text-[9px] uppercase tracking-widest text-slate-600">
              <span>{filtered.length} commands</span>
              <span className="flex items-center gap-3">
                <span>↑↓ navigate</span>
                <span>↵ run</span>
                <span>esc close</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PaletteGroup({
  commands,
  activeIndex,
  setActiveIndex
}: {
  commands: PaletteCommand[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>();
    commands.forEach((c) => {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    });
    return Array.from(map.entries());
  }, [commands]);

  let runningIndex = -1;
  return (
    <div className="space-y-2">
      {groups.map(([group, items]) => (
        <div key={group}>
          <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-slate-600">
            {group}
          </div>
          <div className="space-y-0.5">
            {items.map((cmd) => {
              runningIndex += 1;
              const isActive = runningIndex === activeIndex;
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(runningIndex)}
                  onClick={() => void cmd.perform()}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    isActive
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border border-transparent text-slate-300 hover:bg-slate-900/60'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-300' : 'text-slate-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-semibold">{cmd.label}</div>
                    <div className="truncate font-mono text-[10px] text-slate-500">{cmd.description}</div>
                  </div>
                  <ArrowRight className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-300' : 'text-slate-600'}`} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
