import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import type { ThinkTrajectory } from '@kudbee/types';

interface ThinkTrajectoriesPluginProps {
  plugin: IKudbeePlugin;
  trajectories: ThinkTrajectory[];
  loading: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'VERIFIED'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : status === 'RECYCLED'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${tone}`}>
      {status}
    </span>
  );
}

function MiniSpatial({ coords }: { coords: number[] }) {
  const x = coords[0] ?? 0;
  const y = coords[1] ?? 0;
  const z = coords[2] ?? 0;
  const hue = Math.abs(x) > 0.5 ? 'text-rose-300' : Math.abs(y) > 0.5 ? 'text-amber-300' : 'text-emerald-300';
  return (
    <div className={`font-mono text-[9px] ${hue}`}>
      x:{x.toFixed(2)} y:{y.toFixed(2)} z:{z.toFixed(2)}
    </div>
  );
}

export function ThinkTrajectoriesPlugin({ plugin, trajectories, loading }: ThinkTrajectoriesPluginProps) {
  const items = trajectories.slice(0, 9);
  const grid = Array.from({ length: 9 }, (_, i) => items[i] ?? null);

  return (
    <PluginCard plugin={plugin} accent="border-violet-500/20" glow="via-violet-500/50">
      <p className="text-[11px] text-slate-400">
        Spatial vector trajectories — 1536-dim token embeddings surfaced from the Neon pgvector store.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {grid.map((trajectory, idx) => (
          <div
            key={idx}
            className={`rounded-lg border p-1.5 ${
              trajectory
                ? 'border-violet-500/20 bg-violet-500/[0.04]'
                : 'border-slate-800 bg-slate-950/40'
            }`}
          >
            {trajectory ? (
              <>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-mono text-[9px] text-violet-200">
                    {trajectory.token_hash}
                  </span>
                  <StatusBadge status={trajectory.status} />
                </div>
                <MiniSpatial coords={trajectory.spatial_coordinates} />
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-[9px] text-slate-500">
                    sim {trajectory.similarity_score.toFixed(3)}
                  </span>
                  {trajectory.correction_delta ? (
                    <span className="rounded bg-violet-500/10 px-1 py-0.5 text-[8px] font-mono text-violet-300">
                      delta
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex h-10 items-center justify-center font-mono text-[9px] text-slate-600">
                empty
              </div>
            )}
          </div>
        ))}
      </div>
      {loading && (
        <div className="mt-2 text-[10px] font-mono text-slate-500">probing trajectories…</div>
      )}
    </PluginCard>
  );
}
