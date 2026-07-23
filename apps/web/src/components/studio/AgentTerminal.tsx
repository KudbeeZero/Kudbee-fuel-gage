import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronDown, ChevronRight, RefreshCw, Terminal, Zap } from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';

interface UserMemory {
  model?: string;
  thought_summary?: string;
  reasoning?: string;
  created_at?: string;
}

interface SessionHistoryItem {
  id?: number;
  action?: string;
  status?: string;
  created_at?: string;
  output?: string;
  details?: string;
}

interface TerminalContext {
  health?: string;
  live?: boolean;
  communityValue?: number;
  governance?: number;
  hermes?: number;
}

interface AgentTerminalProps {
  data?: SessionHistoryItem[];
  loading?: boolean;
  error?: string | null;
  live?: boolean;
  thinking?: boolean;
  thinkLatest?: string | null;
  context?: TerminalContext;
  externalCommands?: { id: number; text: string; output?: string }[];
  onDispatch?: () => void;
  collapsed?: boolean;
  onToggleCollapse: () => void;
  onNavigate?: (tab: string) => void;
}

export function AgentTerminal({
  data = [],
  loading = false,
  error = null,
  live = false,
  thinking = false,
  context,
  externalCommands,
  onDispatch,
  collapsed,
  onToggleCollapse,
  onNavigate
}: AgentTerminalProps) {
  const [commands, setCommands] = useState<{ id: number; text: string; output?: string }[]>([]);
  const [input, setInput] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [displayedData, setDisplayedData] = useState<SessionHistoryItem[]>([]);
  const [collapsedSessions, setCollapsedSessions] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestDataRef = useRef(data);
  const processedCmdIds = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!externalCommands || externalCommands.length === 0) return;
    const newCmds = externalCommands.filter((cmd) => !processedCmdIds.current.has(cmd.id));
    if (newCmds.length === 0) return;
    newCmds.forEach((cmd) => processedCmdIds.current.add(cmd.id));
    if (!mountedRef.current) return;
    setCommands((prev) => [...prev, ...newCmds]);
  }, [externalCommands]);

  useEffect(() => { latestDataRef.current = data; }, [data]);

  useEffect(() => { if (!isPaused) setDisplayedData(data); }, [data, isPaused]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => { if (!prev) setDisplayedData(latestDataRef.current); return !prev; });
  }, []);

  const toggleCollapse = useCallback((prNumber: number) => {
    setCollapsedSessions((prev) => { const next = new Set(prev); next.has(prNumber) ? next.delete(prNumber) : next.add(prNumber); return next; });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && !isPaused) el.scrollTop = el.scrollHeight;
  }, [displayedData, commands, error, isPaused]);

  const runCommand = (raw: string): string => {
    const cmd = raw.trim();
    const [name, ...rest] = cmd.toLowerCase().split(/\s+/);
    const ctx = context;
    switch (name) {
      case 'help':
        return ['available commands:', '  help, status, governance, hermes', '  !recall, !remember <data>, !chat, clear, echo <text>'].join('\n');
      case 'chat':
      case 'llama':
        return 'Ollama Terminal Chat is available in the TERMINAL tab (sidebar ⌘+T). Use ChatBubble streaming with local models (qwen3, llama3.2, mistral, etc).';
      case 'status':
        return `system: ${ctx?.health ?? 'unknown'} · HERMES online: ${ctx?.live ? 'yes' : 'no'} · community value: ${ctx?.communityValue ?? 0} CV`;
      case 'governance':
        return `governance actions: ${ctx?.governance ?? 0} · pending HERMES suggestions: ${ctx?.hermes ?? 0}`;
      case 'hermes':
        return `HERMES auditor: ${ctx?.live ? 'ONLINE' : 'OFFLINE'} · active suggestions: ${ctx?.hermes ?? 0}`;
      case 'clear': setCommands([]); return '';
      case 'echo': return rest.join(' ');
      default: return `command not found: ${cmd} (type "help")`;
    }
  };

  const runRecall = async (): Promise<void> => {
    const placeholderId = Date.now();
    setCommands((prev) => [...prev, { id: placeholderId, text: '!recall', output: 'recalling last 10 user memories…' }]);
    try {
      const data = await apiGet<{ count: number; memories: UserMemory[] }>('/api/memory/recall?last=10');
      const memories = data?.memories ?? [];
      const rendered = memories.length === 0 ? 'no user memories stored yet.' : memories.map((m, i) => `#${i + 1} [${m.model}] ${m.created_at ? new Date(m.created_at).toLocaleString() : ''}\n    ${m.thought_summary || m.reasoning || '(empty)'}`).join('\n');
      setCommands((prev) => prev.map((c) => (c.id === placeholderId ? { ...c, output: rendered } : c)));
    } catch (e) {
      setCommands((prev) => prev.map((c) => (c.id === placeholderId ? { ...c, output: `recall failed: ${e instanceof Error ? e.message : 'unknown error'}` } : c)));
    }
  };

  const runRemember = async (data: string): Promise<void> => {
    const placeholderId = Date.now();
    setCommands((prev) => [...prev, { id: placeholderId, text: `!remember ${data}`, output: 'persisting…' }]);
    try {
      await apiPost('/api/memory/remember', { data });
      setCommands((prev) => prev.map((c) => (c.id === placeholderId ? { ...c, output: `remembered: "${data}"` } : c)));
    } catch (e) {
      setCommands((prev) => prev.map((c) => (c.id === placeholderId ? { ...c, output: `remember failed: ${e instanceof Error ? e.message : 'unknown error'}` } : c)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    if (text.startsWith('!recall')) { void runRecall(); return; }
    if (text.startsWith('!remember ')) { void runRemember(text.slice(10)); return; }
    const output = runCommand(text);
    setCommands((prev) => [...prev, { id: Date.now(), text, output: output || undefined }]);
  };

  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-slate-800 bg-slate-950">
        <button onClick={onToggleCollapse} className="w-full flex items-center gap-2 px-4 py-2 text-xs font-mono text-slate-500 hover:text-emerald-400 transition-colors">
          <Terminal className="w-3.5 h-3.5" />
          <span>Agent Terminal</span>
          {live && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"/></span>}
          <ChevronRight className="w-3 h-3 ml-auto" />
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-950 max-h-[40vh] flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-[11px] font-semibold text-slate-300 tracking-wider">AGENT TERMINAL</span>
          {thinking && <Zap className="w-3 h-3 text-amber-400 animate-pulse" />}
          {live && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-mono">
              <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"/></span>
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={togglePause} className={`p-1 rounded text-[10px] font-mono transition-colors ${isPaused ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 hover:text-slate-300'}`} title={isPaused ? 'Resume' : 'Pause'}>
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
          <button onClick={onDispatch} className="p-1 rounded text-slate-500 hover:text-emerald-400 transition-colors" title="Dispatch refresh">
            <RefreshCw className="w-3 h-3" />
          </button>
          <button onClick={onToggleCollapse} className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors" title="Collapse">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px]">
        {loading && <div className="text-slate-500 animate-pulse">loading session data…</div>}
        {error && <div className="text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded px-3 py-2">{error}</div>}

        {displayedData.slice(0, 10).map((item, i) => {
          const isCollapsed = collapsedSessions.has(item.id ?? i);
          return (
            <div key={item.id ?? i} className="rounded border border-slate-800/40 bg-slate-900/40">
              <button onClick={() => toggleCollapse(item.id ?? i)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/30 transition-colors">
                {isCollapsed ? <ChevronRight className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                <span className="text-slate-400">{item.action || 'session'}</span>
                <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-mono ${item.status === 'success' ? 'text-emerald-400 bg-emerald-500/10' : item.status === 'error' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-500 bg-slate-800/50'}`}>{item.status || 'unknown'}</span>
              </button>
              {!isCollapsed && (
                <div className="px-3 pb-2 text-[10px] text-slate-500 border-t border-slate-800/30">
                  <div className="pt-1.5">{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</div>
                  {item.output ? <pre className="mt-1 whitespace-pre-wrap text-slate-400 break-words">{item.output}</pre> : null}
                  {item.details ? <div className="mt-1 text-slate-600">{item.details}</div> : null}
                </div>
              )}
            </div>
          );
        })}
        {displayedData.length === 0 && !loading && <div className="text-slate-600 italic">no active sessions</div>}

        {commands.map((cmd) => (
          <div key={cmd.id} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 shrink-0">$</span>
              <span className="text-slate-300">{cmd.text}</span>
            </div>
            {cmd.output !== undefined && <div className="ml-4 whitespace-pre-wrap text-slate-500 text-[10px]">{cmd.output}</div>}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-800/60 px-3 py-2">
        <span className="font-mono text-[11px] text-emerald-400 shrink-0">kudbee@studio:~$</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="type a command and press enter…" className="flex-1 bg-transparent font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none" aria-label="Agent terminal command input" />
      </form>
    </div>
  );
}
