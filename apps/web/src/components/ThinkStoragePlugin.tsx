import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import type { ThinkTrajectory } from '@kudbee/types';

interface ThinkStoragePluginProps {
  plugin: IKudbeePlugin;
  trajectories: ThinkTrajectory[];
}

export function ThinkStoragePlugin({ plugin, trajectories }: ThinkStoragePluginProps) {
  const count = trajectories.length;
  const dims = count > 0 ? trajectories[0]!.spatial_coordinates.length : 0;
  const deltas = trajectories.filter((t) => t.correction_delta && t.correction_delta.length > 0).length;

  return (
    <PluginCard plugin={plugin} accent="border-sky-500/20" glow="via-sky-500/50">
      <p className="text-[11px] text-slate-400">
        Durable memory recall — semantic search over archived traces with similarity-ranked retrieval.
      </p>
      <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-sky-300">
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">{count} vectors</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">{dims}-dim embed</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">{deltas} deltas</span>
      </div>
    </PluginCard>
  );
}
