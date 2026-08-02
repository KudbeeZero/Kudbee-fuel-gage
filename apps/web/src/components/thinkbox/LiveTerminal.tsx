/**
 * THINKBOX PR-014B — Live Interactive Terminal
 *
 * The canonical engineering console. Subscribes to SSE/BUS events
 * and displays them in real time. Supports filtering, commands,
 * replay mode, simulation mode, and search.
 *
 * This REPLACES the PR-014A placeholder with a live, connected component.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal, Play, Pause, Search, XCircle, ArrowDown,
  Eye, EyeOff, Filter, Radio, Clock, Zap, Shield,
  AlertTriangle, CheckCircle2, Info, RefreshCw,
} from 'lucide-react';
import { useTerminalStream } from '../../hooks/terminal/useTerminalStream';
import type { TerminalLine } from '../../hooks/terminal/useTerminalStream';
import { getCommands } from '../../hooks/terminal/commands';

interface LiveTerminalProps {
  missionId?: string;
  branch?: string;
  simulation?: boolean;
  workspaceId?: string;
}

const SEVERITY_ICONS: Record<string, any> = {
  error: XCircle, warn: AlertTriangle, success: CheckCircle2, info: Info,
};

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-rose-400', warn: 'text-amber-400', success: 'text-emerald-400', info: 'text-slate-500',
};

const CATEGORY_COLORS: Record<string, string> = {
  system: 'text-slate-500', engineering: 'text-emerald-400', governance: 'text-violet-400',
  agent: 'text-blue-400', execution: 'text-amber-400', learning: 'text-cyan-400',
};

export function LiveTerminal({
  missionId = 'THINKBOX-014B',
  branch = 'feature/thinkbox-pr014b',
  simulation = true,
  workspaceId,
}: LiveTerminalProps) {
  const { lines, connected, paused, eventCount, togglePause, clear, filter, setFilter, exportLines, pushLine } = useTerminalStream();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = getCommands(
    { connected, eventCount, paused, simulation, missionId, branch },
    { togglePause, clear, exportLines },
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleCommand = (raw: string) => {
    if (!raw.trim()) return;
    pushLine({ type: 'command', source: 'USER', severity: 'info', content: raw, category: 'system' });

    if (raw.startsWith('/')) {
      const cmd = commands.find(c => raw.startsWith(c.name));
      if (cmd) {
        const result = cmd.handler();
        for (const line of result.split('\n')) {
          pushLine({ type: 'output', source: 'TERMINAL', severity: 'info', content: line, category: 'system' });
        }
      } else if (raw.startsWith('/search ')) {
        const query = raw.slice(8).trim();
        setSearchTerm(query);
        pushLine({ type: 'output', source: 'TERMINAL', severity: 'info', content: `Searching for: "${query}"...`, category: 'system' });
      } else if (raw.startsWith('/replay')) {
        pushLine({ type: 'output', source: 'TERMINAL', severity: 'info', content: 'Replay mode — stream paused. Use /pause to resume.', category: 'system' });
        if (!paused) togglePause();
      } else {
        pushLine({ type: 'error', source: 'TERMINAL', severity: 'error', content: `Unknown command: ${raw.split(' ')[0]}. Type /help.`, category: 'system' });
      }
    } else {
      pushLine({ type: 'output', source: 'TERMINAL', severity: 'info', content: simulation ? `[SIM] Would execute: ${raw}` : `Command sent: ${raw}`, category: 'system' });
    }

    setHistory(prev => [...prev, raw]);
    setHistoryIdx(-1);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const filteredLines = searchTerm
    ? lines.filter(l => l.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : categoryFilter
      ? lines.filter(l => l.category === categoryFilter)
      : lines;

  if (collapsed) {
    return (
      <div className="border-t border-slate-800 bg-slate-950">
        <button onClick={() => setCollapsed(false)} className="w-full flex items-center gap-2 px-4 py-2 text-xs font-mono text-slate-500 hover:text-emerald-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>THINKBOX Terminal</span>
          {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          <span className="text-slate-600 ml-auto">{eventCount} events</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-950/90 flex flex-col" style={{ maxHeight: '45vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-slate-300 tracking-wider">THINKBOX TERMINAL</span>
              {connected ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="SSE connected" /> : <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="SSE disconnected" />}
            </div>
            <div className="flex items-center gap-3 text-[8px] text-slate-600 font-mono mt-0.5">
              <span>Mission: {missionId}</span>
              <span>Branch: {branch}</span>
              <span>Guardian: PASS</span>
              <span>BUS: {connected ? 'LIVE' : 'OFF'}</span>
              {simulation && <span className="text-amber-400">SIM</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-600" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-24 bg-slate-800/50 border border-slate-700/50 rounded px-5 py-0.5 text-[9px] text-slate-400 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30"
            />
          </div>
          <select
            value={categoryFilter ?? ''}
            onChange={e => setCategoryFilter(e.target.value || null)}
            className="bg-slate-800/50 border border-slate-700/50 rounded px-1 py-0.5 text-[9px] text-slate-500"
          >
            <option value="">All</option>
            <option value="system">System</option>
            <option value="engineering">Engineering</option>
            <option value="governance">Governance</option>
            <option value="agent">Agent</option>
            <option value="execution">Execution</option>
            <option value="learning">Learning</option>
          </select>
          <button onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded ${autoScroll ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}>
            <ArrowDown className="w-3 h-3" />
          </button>
          <button onClick={togglePause}
            className={`p-1 rounded ${paused ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
            title={paused ? 'Paused' : 'Streaming'}>
            {paused ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <button onClick={clear} className="p-1 rounded text-slate-500 hover:text-slate-300" title="Clear">
            <XCircle className="w-3 h-3" />
          </button>
          <button onClick={() => setCollapsed(true)} className="p-1 rounded text-slate-500 hover:text-slate-300" title="Collapse">
            <EyeOff className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0.5" style={{ minHeight: '120px' }}>
        {filteredLines.length === 0 ? (
          <div className="text-[10px] text-slate-600 italic py-8 text-center">
            {connected ? 'Awaiting events... Type /help for commands.' : 'Connecting to BUS...'}
          </div>
        ) : (
          filteredLines.map((line) => {
            const SI = SEVERITY_ICONS[line.severity] ?? Info;
            const sc = SEVERITY_COLORS[line.severity] ?? 'text-slate-500';
            const cc = CATEGORY_COLORS[line.category] ?? 'text-slate-600';
            return (
              <div key={line.id} className="flex items-start gap-1.5 text-[10px] leading-relaxed group hover:bg-slate-800/20 rounded px-1 py-0.5">
                <span className="shrink-0 mt-0.5">
                  {line.type === 'command' ? <span className="text-amber-400 font-mono text-[10px]">$</span> :
                   line.type === 'system' ? <SI className={`w-3 h-3 ${sc}`} /> :
                   line.type === 'error' ? <XCircle className="w-3 h-3 text-rose-400" /> :
                   <Zap className="w-3 h-3 text-violet-400" />}
                </span>
                <span className="flex-1 font-mono break-all text-slate-400">{line.content}</span>
                <span className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-600 tabular-nums text-[8px]">
                  {line.timestamp ? new Date(line.timestamp).toLocaleTimeString() : ''}
                </span>
                <span className={`text-[8px] ${cc} font-mono shrink-0`}>{line.source}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Status footer */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-slate-800/60 text-[8px] text-slate-600 font-mono">
        <div className="flex gap-3">
          <span>{connected ? 'LIVE' : 'OFF'}</span>
          <span>{paused ? 'PAUSED' : 'STREAMING'}</span>
          <span>{eventCount} events</span>
        </div>
        <span>PR-014B · {simulation ? 'SIM' : 'EXEC'}</span>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-800/60 px-3 py-1.5 bg-slate-900/40 shrink-0">
        <span className="font-mono text-[10px] text-emerald-400 shrink-0">thinkbox:~$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={simulation ? 'type /help (simulation mode)...' : 'type /help...'}
          className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
          aria-label="Thinkbox terminal input"
        />
        <span className="text-[8px] text-slate-600">{filteredLines.length} lines</span>
      </form>
    </div>
  );
}
