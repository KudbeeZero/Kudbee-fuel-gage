import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import type { ThinkTrajectory } from '@kudbee/types';

interface ThinkStormPluginProps {
  plugin: IKudbeePlugin;
  trajectories: ThinkTrajectory[];
  loading?: boolean;
}

export function ThinkStormPlugin({ plugin, trajectories = [], loading = false }: ThinkStormPluginProps) {
  const pending = trajectories.filter((t) => t.status === 'PENDING_APPROVAL').length;
  const verified = trajectories.filter((t) => t.status === 'VERIFIED').length;
  const recycled = trajectories.filter((t) => t.status === 'RECYCLED').length;
  const latest = trajectories[0];

  return (
    <PluginCard plugin={plugin} accent="border-cyan-500/20" glow="via-cyan-500/50">
      <p className="text-[11px] text-slate-400">
        Distributed reasoning storm — fans a task across parallel agent workers and merges the surviving hypotheses.
      </p>
      {loading && trajectories.length === 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1 text-center animate-pulse">
              <div className="h-5 w-8 mx-auto rounded bg-slate-800" />
              <div className="mt-1 h-3 w-12 mx-auto rounded bg-slate-800" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-1.5 font-mono text-[10px]">
          <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-center text-amber-300">
            <div className="text-base font-bold">{pending}</div>
            <div className="text-[9px] uppercase tracking-wider opacity-70">pending</div>
          </div>
          <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-center text-emerald-300">
            <div className="text-base font-bold">{verified}</div>
            <div className="text-[9px] uppercase tracking-wider opacity-70">verified</div>
          </div>
          <div className="rounded border border-sky-500/20 bg-sky-500/5 px-2 py-1 text-center text-sky-300">
            <div className="text-base font-bold">{recycled}</div>
            <div className="text-[9px] uppercase tracking-wider opacity-70">recycled</div>
          </div>
        </div>
      )}
      {latest && (
        <div className="mt-2 truncate font-mono text-[9px] text-slate-500">
          latest: {latest.token_hash} · sim {latest.similarity_score?.toFixed(3) ?? '0.000'}
        </div>
      )}
      {loading && trajectories.length > 0 && (
        <div className="mt-1 font-mono text-[9px] text-cyan-400 animate-pulse">
          Storm sampling in progress…
        </div>
      )}
    </PluginCard>
  );
}
