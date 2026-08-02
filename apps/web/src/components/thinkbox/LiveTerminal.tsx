/**
 * THINKBOX PR-004 — Live Interactive Terminal
 *
 * The primary communication surface between user and Engineering OS.
 * Supports live logs, agent messages, BUS events, user commands,
 * command history, search, filtering, and timeline integration.
 *
 * Simulation mode by default — commands are previewed, not executed.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal, Play, Eye, EyeOff, Search, ChevronDown, ChevronRight,
  XCircle, CheckCircle2, AlertTriangle, Clock, RefreshCw,
  Filter, ArrowDown, Zap, Loader2,
} from 'lucide-react';

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'event' | 'agent' | 'error' | 'system' | 'log';
  content: string;
  timestamp: string;
  agent?: string;
  severity?: 'info' | 'warn' | 'error' | 'success';
}

interface LiveTerminalProps {
  workspaceId?: string;
  simulation?: boolean;
  onToggleSimulation?: () => void;
  connected?: boolean;
  lines?: TerminalLine[];
  onCommand?: (command: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function SeverityBadge({ severity }: { severity?: string }) {
  const colors: Record<string, string> = {
    error: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    warn: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    info: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };
  if (!severity) return null;
  return (
    <span className={`text-[8px] px-1 py-0.5 rounded border font-mono ${colors[severity] ?? colors.info}`}>
      {severity.toUpperCase()}
    </span>
  );
}

export function LiveTerminal({
  workspaceId,
  simulation = true,
  onToggleSimulation,
  connected = true,
  lines: externalLines,
  onCommand,
  collapsed = false,
  onToggleCollapse,
}: LiveTerminalProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultLines: TerminalLine[] = [
    { id: 'init-1', type: 'system', content: 'THINKBOX Terminal v4.0 — Live Workspace Orchestration', timestamp: new Date().toISOString() },
    { id: 'init-2', type: 'system', content: `Workspace: ${workspaceId ?? 'not connected'}`, timestamp: new Date().toISOString() },
    { id: 'init-3', type: 'system', content: `Mode: ${simulation ? 'SIMULATION (dry-run)' : 'LIVE'}`, timestamp: new Date().toISOString() },
    { id: 'init-4', type: 'system', content: `Connection: ${connected ? 'LIVE' : 'DISCONNECTED'}`, timestamp: new Date().toISOString() },
    { id: 'init-5', type: 'system', content: 'Agents: KILOH, FORGE, DTHINK, GATE, JOURNAL, BUS — ONLINE', timestamp: new Date().toISOString() },
    { id: 'init-6', type: 'system', content: 'Type /help for commands, /events to see BUS stream', timestamp: new Date().toISOString() },
  ];

  const [lines, setLines] = useState<TerminalLine[]>(externalLines ?? defaultLines);

  useEffect(() => {
    if (externalLines) setLines(externalLines);
  }, [externalLines]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const addLine = useCallback((line: TerminalLine) => {
    setLines(prev => [...prev, { ...line, id: `${line.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]);
  }, []);

  const handleCommand = (raw: string) => {
    if (!raw.trim()) return;

    addLine({ type: 'command', content: raw, timestamp: new Date().toISOString() });

    if (raw.startsWith('/')) {
      const [cmd, ...args] = raw.slice(1).split(/\s+/);
      switch (cmd.toLowerCase()) {
        case 'help':
          addLine({ type: 'output', content: 'Commands: /help, /status, /agents, /events, /timeline, /sim [on|off], /clear, /search <query>, /about', timestamp: new Date().toISOString() });
          break;
        case 'status':
          addLine({ type: 'output', content: `Workspace: ${workspaceId ?? 'none'} | Simulation: ${simulation ? 'ON' : 'OFF'} | Connected: ${connected ? 'YES' : 'NO'}`, timestamp: new Date().toISOString() });
          break;
        case 'agents':
          addLine({ type: 'output', content: 'KILOH: orchestrating | FORGE: provisioning | DTHINK: learning | GATE: verifying | JOURNAL: recording | BUS: streaming', timestamp: new Date().toISOString() });
          break;
        case 'events':
          addLine({ type: 'output', content: 'Subscribing to BUS events... (filter in Control Tower > Events)', timestamp: new Date().toISOString() });
          break;
        case 'sim':
          if (args[0] === 'off' && simulation) { onToggleSimulation?.(); addLine({ type: 'system', content: 'Simulation DISABLED — commands will execute', timestamp: new Date().toISOString(), severity: 'warn' }); }
          else if (args[0] === 'on' && !simulation) { onToggleSimulation?.(); addLine({ type: 'system', content: 'Simulation ENABLED — dry-run mode', timestamp: new Date().toISOString(), severity: 'success' }); }
          else addLine({ type: 'output', content: `Simulation is ${simulation ? 'ON' : 'OFF'}. Use /sim on|off to toggle.`, timestamp: new Date().toISOString() });
          break;
        case 'clear':
          setLines([]);
          break;
        case 'about':
          addLine({ type: 'output', content: 'THINKBOX PR-004 — Live Workspace Orchestration. See THINKBOX_PR004_FINAL_REPORT.md', timestamp: new Date().toISOString() });
          break;
        default:
          addLine({ type: 'error', content: `Unknown command: /${cmd}. Type /help for available commands.`, timestamp: new Date().toISOString(), severity: 'error' });
      }
    } else {
      if (simulation) {
        addLine({ type: 'event', content: `[SIM] Would execute: ${raw}`, timestamp: new Date().toISOString(), severity: 'info' });
        addLine({ type: 'system', content: 'Simulation mode active. Use /sim off to execute commands.', timestamp: new Date().toISOString(), severity: 'warn' });
      } else {
        onCommand?.(raw);
        addLine({ type: 'system', content: `Command sent: ${raw}`, timestamp: new Date().toISOString(), severity: 'info' });
      }
    }

    setHistory(prev => [...prev, raw]);
    setHistoryIdx(-1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setInput(history[idx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const idx = historyIdx + 1;
      if (idx >= history.length) { setHistoryIdx(-1); setInput(''); return; }
      setHistoryIdx(idx);
      setInput(history[idx]);
    }
  };

  const filteredLines = searchTerm
    ? lines.filter(l => l.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : filterType
      ? lines.filter(l => l.type === filterType)
      : lines;

  const typeIcon = (type: string) => {
    switch (type) {
      case 'command': return <span className="text-amber-400 font-mono text-[10px]">$</span>;
      case 'event': return <Zap className="w-3 h-3 text-violet-400" />;
      case 'agent': return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case 'error': return <XCircle className="w-3 h-3 text-rose-400" />;
      case 'system': return <Info className="w-3 h-3 text-slate-500" />;
      default: return <span className="text-slate-600 font-mono text-[10px]">&gt;</span>;
    }
  };

  if (collapsed) {
    return (
      <div className="border-t border-slate-800 bg-slate-950">
        <button onClick={onToggleCollapse} className="w-full flex items-center gap-2 px-4 py-2 text-xs font-mono text-slate-500 hover:text-emerald-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>THINKBOX Terminal</span>
          {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          <ChevronRight className="w-3 h-3 ml-auto" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-950/90 flex flex-col max-h-[50vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-[11px] font-semibold text-slate-300 tracking-wider">THINKBOX TERMINAL</span>
          {connected && <span className="text-[8px] text-emerald-400 font-mono">LIVE</span>}
          {simulation && <span className="text-[8px] text-amber-400 font-mono bg-amber-500/10 px-1 rounded">SIM</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-600" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-28 bg-slate-800/50 border border-slate-700/50 rounded px-5 py-0.5 text-[9px] text-slate-400 placeholder:text-slate-600 focus:outline-none"
            />
          </div>
          <select
            value={filterType ?? ''}
            onChange={e => setFilterType(e.target.value || null)}
            className="bg-slate-800/50 border border-slate-700/50 rounded px-1 py-0.5 text-[9px] text-slate-500"
          >
            <option value="">All</option>
            <option value="command">Commands</option>
            <option value="event">Events</option>
            <option value="agent">Agents</option>
            <option value="error">Errors</option>
            <option value="system">System</option>
          </select>
          <button onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded text-slate-500 hover:text-slate-300 ${autoScroll ? 'text-emerald-400' : ''}`}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}>
            <ArrowDown className="w-3 h-3" />
          </button>
          {onToggleSimulation && (
            <button onClick={onToggleSimulation}
              className={`p-1 rounded ${simulation ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
              title={simulation ? 'Simulation ON' : 'Simulation OFF'}>
              {simulation ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
          )}
          <button onClick={() => setLines([])} className="p-1 rounded text-slate-500 hover:text-slate-300" title="Clear">
            <XCircle className="w-3 h-3" />
          </button>
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} className="p-1 rounded text-slate-500 hover:text-slate-300" title="Collapse">
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0.5" onScroll={() => {}}>
        {filteredLines.length === 0 ? (
          <div className="text-[10px] text-slate-600 italic py-4 text-center">No output. Type a command or use /help.</div>
        ) : (
          filteredLines.map((line) => (
            <div key={line.id} className="flex items-start gap-2 text-[10px] leading-relaxed group hover:bg-slate-800/20 rounded px-1 py-0.5">
              <span className="shrink-0 mt-0.5">{typeIcon(line.type)}</span>
              <span className={`flex-1 font-mono break-all ${
                line.type === 'error' ? 'text-rose-400' :
                line.type === 'event' ? 'text-violet-300' :
                line.type === 'agent' ? 'text-emerald-300' :
                line.type === 'command' ? 'text-amber-300' :
                'text-slate-400'
              }`}>{line.content}</span>
              <span className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-600 tabular-nums text-[8px]">
                {line.timestamp ? new Date(line.timestamp).toLocaleTimeString() : ''}
              </span>
              {line.severity && <SeverityBadge severity={line.severity} />}
              {line.agent && <span className="text-slate-600 text-[8px]">{line.agent}</span>}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-800/60 px-3 py-2 bg-slate-900/40 shrink-0">
        <span className="font-mono text-[10px] text-emerald-400 shrink-0">thinkbox:~$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={simulation ? 'type a command (simulation mode)...' : 'type a command...'}
          className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
          aria-label="Thinkbox terminal input"
        />
        <span className="text-[8px] text-slate-600 font-mono">
          {simulation ? 'SIM' : 'LIVE'} · {filteredLines.length} lines
        </span>
      </form>
    </div>
  );
}
