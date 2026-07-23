import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import type { ThinkTrajectory } from '@kudbee/types';

interface ThinkStreamPluginProps {
  plugin: IKudbeePlugin;
  trajectories: ThinkTrajectory[];
  loading?: boolean;
}

export function ThinkStreamPlugin({ plugin, trajectories = [], loading = false }: ThinkStreamPluginProps) {
  const count = trajectories.length;
  const avgSim = count > 0
    ? trajectories.reduce((acc, t) => acc + (t.similarity_score ?? 0), 0) / count
    : 0;

  return (
    <PluginCard plugin={plugin} accent="border-violet-500/20" glow="via-violet-500/50">
      <p className="text-[11px] text-slate-400">
        Live chain-of-thought stream — surfaces reasoning tokens from the agent shell in real time.
      </p>
      {loading && count === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[10px] font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-slate-500">Connecting to think stream…</span>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center gap-2 text-violet-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            streaming · Think: Stream
          </div>
          <div className="text-slate-500">
            {count} tokens · avg sim {avgSim.toFixed(3)}
          </div>
        </div>
      )}
      {loading && count > 0 && (
        <div className="mt-1 font-mono text-[9px] text-violet-400 animate-pulse">
          Receiving tokens…
        </div>
      )}
    </PluginCard>
  );
}
