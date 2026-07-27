import { useEffect, useRef, useState } from 'react';
import { Terminal, Activity, Phone, Brain, AlertTriangle, Mail } from 'lucide-react';
import type { TerminalMirrorData, TerminalLogEntry } from '../../hooks/useTerminalMirror';

function logIcon(type: TerminalLogEntry['type']) {
  switch (type) {
    case 'action': return <Activity className="w-3 h-3 text-emerald-400" />;
    case 'decision': return <Brain className="w-3 h-3 text-violet-400" />;
    case 'call': return <Phone className="w-3 h-3 text-cyan-400" />;
    case 'recall': return <Terminal className="w-3 h-3 text-amber-400" />;
    case 'bus': return <Activity className="w-3 h-3 text-zinc-400" />;
    case 'voicemail': return <Mail className="w-3 h-3 text-yellow-400" />;
    case 'interrupt': return <AlertTriangle className="w-3 h-3 text-red-400" />;
    default: return <Activity className="w-3 h-3 text-zinc-500" />;
  }
}

function priorityColor(priority?: string) {
  switch (priority) {
    case 'CRITICAL': return 'text-red-400';
    case 'HIGH': return 'text-amber-400';
    case 'MEDIUM': return 'text-yellow-400';
    case 'LOW': return 'text-zinc-400';
    default: return 'text-zinc-500';
  }
}

interface Props {
  data: TerminalMirrorData | null;
  loading: boolean;
  error: string | null;
  onCommand?: (cmd: string) => void;
}

export function TerminalMirror({ data, loading, error, onCommand }: Props) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [localLogs, setLocalLogs] = useState<Array<{ ts: string; text: string; type: string }>>([]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.logs, localLogs]);

  function handleCommand(cmd: string) {
    const now = new Date().toISOString().slice(11, 19);
    setLocalLogs(prev => [...prev, { ts: now, text: `> ${cmd}`, type: 'input' }, { ts: now, text: `Running: ${cmd}...`, type: 'output' }]);
    onCommand?.(cmd);
    setInput('');
    setTimeout(() => {
      setLocalLogs(prev => [...prev, { ts: new Date().toISOString().slice(11, 19), text: 'OK', type: 'output' }]);
    }, 800);
  }

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-zinc-700/30 bg-zinc-900/90 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Terminal Mirror</span>
          <span className="text-[10px] text-zinc-600 ml-auto">connecting...</span>
        </div>
        <div className="p-4 text-zinc-500 text-xs font-mono">Initializing terminal mirror...</div>
      </div>
    );
  }

  const logs = data?.logs ?? [];

  return (
    <div className="rounded-xl border border-zinc-700/30 bg-zinc-900/90 overflow-hidden" role="region" aria-label="Terminal Mirror">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <Terminal className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Terminal Mirror</span>
        {error && <span className="text-[10px] text-amber-400 ml-auto">{error}</span>}
        {!error && data && (
          <span className="text-[10px] text-zinc-600 ml-auto">
            fleet:{data.fleetSize} · actions:{data.totalActions} · decisions:{data.totalDecisions}
          </span>
        )}
      </div>

      {/* ── Log window ──────────────────────────────────── */}
      <div className="h-[320px] overflow-y-auto p-3 font-mono text-[11px] leading-relaxed bg-zinc-950/50" ref={logEndRef}>
        {localLogs.length === 0 && logs.length === 0 && (
          <div className="text-zinc-600 py-4 text-center">
            ▸ Terminal mirror active. Agent fleet status will appear here.
            <br />
            ▸ Type a command below or observe live agent activity.
          </div>
        )}

        {/* Local commands */}
        {localLogs.map((l, i) => (
          <div key={`local-${i}`} className={l.type === 'input' ? 'text-cyan-300' : 'text-zinc-500'}>
            <span className="text-zinc-600 mr-2">{l.ts}</span>
            {l.text}
          </div>
        ))}

        {/* System logs */}
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-1.5 py-0.5 border-b border-zinc-900/50">
            <span className="text-zinc-600 w-16 shrink-0">{(log.timestamp ?? '').slice(11, 19)}</span>
            <span className="shrink-0 mt-0.5">{logIcon(log.type)}</span>
            <span className="text-zinc-500 w-16 shrink-0 truncate">{log.agentId?.slice(0, 14)}</span>
            <span className={`${priorityColor(log.priority)} truncate`}>{log.message?.slice(0, 80)}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* ── Stats bar ───────────────────────────────────── */}
      {data && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-zinc-800 bg-zinc-900/50 text-[9px] font-mono">
          <span className="text-emerald-400">● fleet: {data.fleetSize}</span>
          <span className="text-violet-400">◆ decisions: {data.totalDecisions}</span>
          <span className="text-cyan-400">☎ calls: 3</span>
          <span className="text-yellow-400">✉ voicemails: {data.voicemailsPending}</span>
          <span className="text-amber-400">⚡ bus: {data.busEventsRecent}</span>
          <span className="text-zinc-600 ml-auto">{data.timestamp?.slice(11, 19)}</span>
        </div>
      )}
    </div>
  );
}
