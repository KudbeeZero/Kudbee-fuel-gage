/**
 * THINKBOX-016A — Mobile Terminal
 *
 * Mobile-optimized terminal. Large touch targets. Sticky command input.
 * Recent commands. Swipe between Output / Events / Logs / Search.
 * No tiny fonts. No overflow. Mobile keyboard friendly.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal, Send, Copy, RotateCcw, ChevronDown,
  Zap, AlertTriangle, CheckCircle2, Info, XCircle,
} from 'lucide-react';
import { useTerminalStream } from '../../hooks/terminal/useTerminalStream';
import type { TerminalLine } from '../../hooks/terminal/useTerminalStream';
import { getCommands } from '../../hooks/terminal/commands';

type TermTab = 'output' | 'events' | 'logs' | 'search';

const SEVERITY_ICONS: Record<string, any> = {
  error: XCircle, warn: AlertTriangle, success: CheckCircle2, info: Info,
};

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-rose-400', warn: 'text-amber-400', success: 'text-emerald-400', info: 'text-slate-500',
};

export function MobileTerminal() {
  const { lines, connected, paused, eventCount, togglePause, clear, pushLine, exportLines } = useTerminalStream();
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<TermTab>('output');
  const [searchTerm, setSearchTerm] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = getCommands(
    { connected, eventCount, paused, simulation: true, missionId: 'THINKBOX-016', branch: 'feature/thinkbox-016-mobile' },
    { togglePause, clear, exportLines },
  );

  const recentCommands = commands.map(c => c.name);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const handleCommand = useCallback((raw: string) => {
    if (!raw.trim()) return;
    pushLine({ type: 'command', source: 'USER', severity: 'info', content: raw, category: 'system' });

    if (raw.startsWith('/')) {
      const cmd = commands.find(c => raw.startsWith(c.name));
      if (cmd) {
        const result = cmd.handler();
        for (const line of result.split('\n')) {
          pushLine({ type: 'output', source: 'TERMINAL', severity: 'info', content: line, category: 'system' });
        }
      } else {
        pushLine({ type: 'error', source: 'TERMINAL', severity: 'error', content: `Unknown: ${raw.split(' ')[0]}. Type /help.`, category: 'system' });
      }
    } else {
      pushLine({ type: 'output', source: 'TERMINAL', severity: 'info', content: `[SIM] ${raw}`, category: 'system' });
    }
  }, [commands, pushLine]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
    setShowRecent(false);
  };

  const handleCopy = useCallback(() => {
    const text = lines.map(l => `[${l.timestamp}] ${l.source}: ${l.content}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [lines]);

  const filteredLines = activeTab === 'search' && searchTerm
    ? lines.filter(l => l.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : activeTab === 'events'
      ? lines.filter(l => l.type === 'event')
      : activeTab === 'logs'
        ? lines.filter(l => l.type === 'system' || l.severity === 'warn' || l.severity === 'error')
        : lines;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800/60 bg-slate-950/90 overflow-hidden" style={{ maxHeight: '60vh' }}>
      {/* Tab bar */}
      <div className="flex items-center border-b border-slate-800/40 bg-slate-900/40 shrink-0">
        {(['output', 'events', 'logs', 'search'] as TermTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 min-h-[44px] text-[10px] font-mono uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                : 'text-slate-500 active:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/30 border-b border-slate-800/20 shrink-0">
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
          <span className={connected ? 'text-emerald-400' : 'text-rose-400'}>{connected ? 'LIVE' : 'OFF'}</span>
          <span className="text-slate-600">{eventCount} events</span>
          {paused && <span className="text-amber-400">PAUSED</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 active:text-emerald-400" title="Copy logs">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={togglePause} className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 active:text-amber-400" title={paused ? 'Resume' : 'Pause'}>
            {paused ? <Terminal className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={clear} className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 active:text-rose-400" title="Clear">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search input */}
      {activeTab === 'search' && (
        <div className="px-3 py-2 border-b border-slate-800/20 shrink-0">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search terminal output..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30 min-h-[44px]"
          />
        </div>
      )}

      {/* Output area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1" style={{ minHeight: '160px' }}>
        {filteredLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Terminal className="w-8 h-8 text-slate-700 mb-2" />
            <p className="text-[10px] text-slate-600">
              {connected ? 'Awaiting events...' : 'Connecting to BUS...'}
            </p>
            <p className="text-[9px] text-slate-700 mt-1">Type /help for commands</p>
          </div>
        ) : (
          filteredLines.map((line) => {
            const SI = SEVERITY_ICONS[line.severity] ?? Info;
            const sc = SEVERITY_COLORS[line.severity] ?? 'text-slate-500';
            return (
              <div key={line.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span className="shrink-0 mt-0.5">
                  {line.type === 'command' ? (
                    <span className="text-amber-400 font-mono font-bold">$</span>
                  ) : (
                    <SI className={`w-3.5 h-3.5 ${sc}`} />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-slate-400 break-words">{line.content}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[8px] font-mono ${sc}`}>{line.source}</span>
                    <span className="text-[8px] text-slate-700">
                      {line.timestamp ? new Date(line.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent commands */}
      {showRecent && (
        <div className="border-t border-slate-800/40 bg-slate-900/40 px-3 py-2 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {recentCommands.map(cmd => (
              <button
                key={cmd}
                onClick={() => { setInput(cmd); setShowRecent(false); inputRef.current?.focus(); }}
                className="min-h-[36px] px-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-[10px] font-mono text-slate-400 active:bg-emerald-500/10 active:text-emerald-400 active:border-emerald-500/30"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-800/40 px-3 py-2 bg-slate-900/50 shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
        <button
          type="button"
          onClick={() => setShowRecent(!showRecent)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 active:text-emerald-400"
          title="Recent commands"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showRecent ? 'rotate-180' : ''}`} />
        </button>
        <span className="font-mono text-[11px] text-emerald-400 shrink-0">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="/help, /status, /agents..."
          className="flex-1 bg-transparent font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none min-h-[44px]"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          enterKeyHint="send"
        />
        <button
          type="submit"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 active:bg-emerald-500/20"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
