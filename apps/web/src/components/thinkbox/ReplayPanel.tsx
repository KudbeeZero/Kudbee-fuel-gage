/**
 * THINKBOX PR-010 — Replay Panel
 *
 * Replays completed engineering sessions: timeline, terminal, agent
 * decisions, planning, execution, learning. Supports play/pause,
 * speed control, and step-by-step navigation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Clock, Zap, ChevronRight, CheckCircle2 } from 'lucide-react';

interface ReplayFrame {
  id: string;
  timestamp: string;
  subsystem: string;
  action: string;
  detail: string;
  agentId: string | null;
}

interface ReplayPanelProps {
  session?: {
    sessionId: string;
    frames: ReplayFrame[];
    metadata: { totalFrames: number; subsystems: string[]; agentContributions: Record<string, number> };
  };
}

export function ReplayPanel({ session }: ReplayPanelProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [subsystemFilter, setSubsystemFilter] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const frames = session?.frames ?? [
    { id: 'f1', timestamp: new Date().toISOString(), subsystem: 'detection', action: 'Project detected', detail: '10 languages found', agentId: null },
    { id: 'f2', timestamp: new Date().toISOString(), subsystem: 'intelligence', action: 'Intelligence generated', detail: '7 services, 55 env vars', agentId: null },
    { id: 'f3', timestamp: new Date().toISOString(), subsystem: 'planning', action: 'Mission planned', detail: '2 epics, 10 tasks', agentId: 'KILOH' },
    { id: 'f4', timestamp: new Date().toISOString(), subsystem: 'agent', action: 'Agents assigned', detail: 'FORGE, GATE, JOURNAL', agentId: 'KILOH' },
    { id: 'f5', timestamp: new Date().toISOString(), subsystem: 'provision', action: 'Provision plan generated', detail: '70 steps, Score 100/A', agentId: 'FORGE' },
    { id: 'f6', timestamp: new Date().toISOString(), subsystem: 'execution', action: 'Execution planned', detail: '70 commands, 2 approvals', agentId: 'FORGE' },
    { id: 'f7', timestamp: new Date().toISOString(), subsystem: 'learning', action: 'Learning extracted', detail: '5 records', agentId: 'DTHINK' },
    { id: 'f8', timestamp: new Date().toISOString(), subsystem: 'recommendation', action: 'Recommendations generated', detail: '2 evidence-based recs', agentId: 'KILOH' },
    { id: 'f9', timestamp: new Date().toISOString(), subsystem: 'agent', action: 'Mission complete', detail: 'All verified', agentId: 'GATE' },
  ];

  const filtered = subsystemFilter ? frames.filter(f => f.subsystem === subsystemFilter) : frames;
  const subsystems = [...new Set(frames.map(f => f.subsystem))];

  const tick = useCallback(() => {
    setCurrentIdx(prev => {
      const next = prev + 1;
      if (next >= filtered.length) {
        setPlaying(false);
        return prev;
      }
      return next;
    });
  }, [filtered.length]);

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(tick, 1000 / speed);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, speed, tick]);

  const current = filtered[currentIdx];
  const progress = filtered.length > 0 ? Math.round((currentIdx / filtered.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Engineering Replay</h3>
            <p className="text-[10px] text-slate-500">{frames.length} frames · {subsystems.length} subsystems</p>
          </div>
        </div>
        <span className="text-[9px] text-slate-600 font-mono">{speed}x</span>
      </div>

      <div className="flex gap-1">
        {subsystems.map(s => (
          <button key={s} onClick={() => setSubsystemFilter(subsystemFilter === s ? null : s)}
            className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${subsystemFilter === s ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-600 hover:text-slate-400'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
        <div className="h-full rounded-full bg-cyan-500/60 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center justify-center gap-2">
        <button onClick={() => setCurrentIdx(0)}
          className="p-1.5 rounded text-slate-500 hover:text-slate-300"><SkipBack className="w-4 h-4" /></button>
        <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
          className="p-1 rounded text-slate-500 hover:text-slate-300" disabled={currentIdx === 0}>
          <SkipBack className="w-3 h-3" />
        </button>
        <button onClick={() => setPlaying(!playing)}
          className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button onClick={() => setCurrentIdx(Math.min(filtered.length - 1, currentIdx + 1))}
          className="p-1 rounded text-slate-500 hover:text-slate-300" disabled={currentIdx >= filtered.length - 1}>
          <SkipForward className="w-3 h-3" />
        </button>
        <button onClick={() => setCurrentIdx(filtered.length - 1)}
          className="p-1.5 rounded text-slate-500 hover:text-slate-300"><SkipForward className="w-4 h-4" /></button>
        <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
          className="ml-2 bg-slate-800/50 border border-slate-700/50 rounded px-1 py-0.5 text-[9px] text-slate-400">
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
          <option value={8}>8x</option>
        </select>
      </div>

      {current && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <div className="w-px h-4 bg-slate-700" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] text-cyan-400 font-mono uppercase">{current.subsystem}</span>
              {current.agentId && <span className="text-[8px] text-slate-600 font-mono">{current.agentId}</span>}
              <span className="text-[8px] text-slate-600 ml-auto">{currentIdx + 1}/{filtered.length}</span>
            </div>
            <div className="text-[10px] text-slate-300 font-mono">{current.action}</div>
            <div className="text-[9px] text-slate-500 mt-0.5">{current.detail}</div>
          </div>
        </div>
      )}

      <div className="max-h-32 overflow-y-auto space-y-0.5">
        {filtered.slice(0, 30).map((f, i) => (
          <button key={f.id}
            onClick={() => { setCurrentIdx(i); setPlaying(false); }}
            className={`w-full flex items-center gap-2 text-left text-[10px] py-0.5 px-1 rounded hover:bg-slate-800/20 transition-colors ${i === currentIdx ? 'bg-cyan-500/10' : i < currentIdx ? 'opacity-60' : ''}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${i < currentIdx ? 'bg-cyan-400' : i === currentIdx ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-slate-500 w-16 font-mono text-[9px]">{f.subsystem}</span>
            <span className="text-slate-400 truncate flex-1">{f.action}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
