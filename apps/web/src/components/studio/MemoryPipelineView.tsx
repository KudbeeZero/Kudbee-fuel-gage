import { Brain, TrendingUp, Clock, Hash, Database, Circle, CircleDot } from 'lucide-react';
import { useControlTowerStore } from '../../store/useControlTowerStore';
import { useMemoryEvents } from '../../hooks/useMemoryEvents';

const CATEGORY_COLORS: Record<string, string> = {
  FACT: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  OBSERVATION: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  DECISION: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  ERROR: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  TOOL_CALL: 'border-amber-500/30 bg-amber-500/10 text-amber-400'
};

export function MemoryStatusBadge({ stored, recalled }: { stored: number; recalled: number }) {
  const isLive = stored > 0;
  return (
    <div className="flex items-center gap-3 font-mono text-[10px]" id="memory-status-badge">
      <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
        isLive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-900 text-slate-500'
      }`}>
        {isLive ? <CircleDot className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
        <span className="hidden sm:inline">{isLive ? 'MEMORY LIVE' : 'MEMORY IDLE'}</span>
        <span className="sm:hidden">{isLive ? 'LIVE' : 'IDLE'}</span>
      </span>
      <span className="text-slate-400 hidden sm:inline">
        {stored} stored · {recalled} recalled
      </span>
      <span className="text-slate-400 sm:hidden">
        {stored}/{recalled}
      </span>
    </div>
  );
}

export function MemoryPipelineView() {
  useMemoryEvents();
  const activeMemories = useControlTowerStore((s) => s.activeMemories);
  const recallMetrics = useControlTowerStore((s) => s.recallMetrics);

  const recent = activeMemories.slice(0, 10);
  const totalStored = activeMemories.length;
  const factCount = activeMemories.filter((m) => m.category === 'FACT').length;
  const errorCount = activeMemories.filter((m) => m.category === 'ERROR').length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="memory-pipeline-view">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Memory Pipeline</h3>
        </div>
        <MemoryStatusBadge stored={totalStored} recalled={recallMetrics.totalRecalls} />
        <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><Database className="h-3 w-3" />{totalStored} stored</span>
          <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{recallMetrics.totalRecalls} recalls</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
        <div className="rounded-lg bg-slate-800/30 p-2 text-center">
          <div className="text-[8px] font-mono text-slate-500 uppercase">Facts</div>
          <div className="font-mono text-sm text-emerald-400 mt-0.5">{factCount}</div>
        </div>
        <div className="rounded-lg bg-slate-800/30 p-2 text-center">
          <div className="text-[8px] font-mono text-slate-500 uppercase">Errors</div>
          <div className="font-mono text-sm text-rose-400 mt-0.5">{errorCount}</div>
        </div>
        <div className="rounded-lg bg-slate-800/30 p-2 text-center">
          <div className="text-[8px] font-mono text-slate-500 uppercase">Window Size</div>
          <div className="font-mono text-sm text-slate-200 mt-0.5">{recallMetrics.lastWindowSize || '—'}</div>
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto px-4 pb-4 space-y-1.5">
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <Brain className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No active agent memories. Store facts, observations, or decisions via the memory tool.</span>
          </div>
        ) : (
          recent.map((mem) => (
            <div key={mem.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase ${CATEGORY_COLORS[mem.category] || 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                {mem.category}
              </span>
              <span className="font-mono text-[10px] text-slate-300 truncate flex-1">{mem.content}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-0.5 font-mono text-[9px] text-slate-600">
                  <Hash className="h-2.5 w-2.5" />
                  {mem.recallCount}
                </span>
                <span className="font-mono text-[9px] text-slate-500">
                  {(mem.importance * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {totalStored > 0 && (
        <div className="border-t border-slate-800/60 px-5 py-3 flex items-center justify-between text-[9px] font-mono">
          <span className="text-slate-500 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {(recent[0]?.lastRecalledAt ? new Date(recent[0].lastRecalledAt).toLocaleTimeString() : 'never')}
          </span>
          <span className="text-slate-600">Similarity avg: {recallMetrics.avgSimilarity.toFixed(3)}</span>
        </div>
      )}

      {totalStored === 0 && recallMetrics.totalRecalls === 0 && (
        <div className="border-t border-slate-800/60 px-5 py-3 flex items-center justify-center text-[9px] font-mono text-slate-600">
          Run seed-memory.ts to populate agent memories
        </div>
      )}
    </div>
  );
}
