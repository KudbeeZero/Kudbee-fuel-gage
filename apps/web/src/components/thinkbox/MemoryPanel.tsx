import { Brain, Clock, Hash, Layers, Database } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';

export function MemoryPanel() {
  const { viewModel } = useDashboardSync();
  const memories = viewModel.memory || [];
  const intelligence = viewModel.intelligence;

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-100 font-mono">Memory</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{memories.length} stored</span>
      </div>

      {/* Dependencies summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Langs</div>
          <div className="text-sm font-bold text-zinc-200 font-mono">{intelligence.languages.length}</div>
        </div>
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Deps</div>
          <div className="text-sm font-bold text-zinc-200 font-mono">
            {intelligence.dependencies.reduce((s, d) => s + d.totalCount, 0)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-2 text-center">
          <div className="text-[9px] text-slate-500 font-mono mb-1">Svcs</div>
          <div className="text-sm font-bold text-zinc-200 font-mono">{intelligence.services.length}</div>
        </div>
      </div>

      {/* Think tokens */}
      {memories.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Think Tokens</span>
          {memories.slice(0, 8).map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-lg border border-slate-800/40 bg-slate-950/30 p-2">
              <Hash className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-300 font-mono truncate">{m.title}</div>
                {m.content && (
                  <div className="text-[9px] text-slate-500 font-mono line-clamp-2 mt-0.5">{m.content}</div>
                )}
              </div>
              {m.timestamp && (
                <span className="text-[8px] text-slate-600 font-mono flex-shrink-0">
                  {new Date(m.timestamp).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Runtimes */}
      {intelligence.runtimes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Runtimes</span>
          {intelligence.runtimes.map((rt, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-300">{rt.kind}</span>
              {rt.version && <span className="text-slate-500">{rt.version}</span>}
            </div>
          ))}
        </div>
      )}

      {memories.length === 0 && (
        <div className="text-[10px] text-slate-600 font-mono text-center py-4">
          No think tokens stored. Tokens are minted by the THINK loop during self-healing cycles.
        </div>
      )}
    </div>
  );
}

export default MemoryPanel;
