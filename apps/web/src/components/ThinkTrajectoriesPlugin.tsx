import { useState } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import type { ThinkTrajectory } from '@kudbee/types';
import { X, Brain, Coins, Hash } from 'lucide-react';

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
  const x = coords?.[0] ?? 0;
  const y = coords?.[1] ?? 0;
  const z = coords?.[2] ?? 0;
  const hue = Math.abs(x) > 0.5 ? 'text-rose-300' : Math.abs(y) > 0.5 ? 'text-amber-300' : 'text-emerald-300';
  return (
    <div className={`font-mono text-[9px] ${hue}`}>
      x:{x.toFixed(2)} y:{y.toFixed(2)} z:{z.toFixed(2)}
    </div>
  );
}

interface TrajectoryDrawerProps {
  trajectory: ThinkTrajectory;
  onClose: () => void;
}

function TrajectoryDrawer({ trajectory, onClose }: TrajectoryDrawerProps) {
  const coords = trajectory.spatial_coordinates;
  const dims = coords?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Trajectory Detail</h3>
            <span className="font-mono text-[10px] text-slate-500">{trajectory.token_hash}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 p-1.5 text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                <Brain className="h-3 w-3" /> Status
              </div>
              <div className="mt-1">
                <StatusBadge status={trajectory.status} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                <Coins className="h-3 w-3" /> Confidence
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-violet-300">
                {trajectory.confidence_score?.toFixed(3) ?? '—'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              <Hash className="h-3 w-3" /> Spatial Coordinates ({dims}-dim)
            </div>
            {dims > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {coords!.slice(0, 12).map((v, i) => (
                  <span key={i} className="rounded border border-violet-500/20 bg-violet-500/5 px-1.5 py-0.5 font-mono text-[9px] text-violet-300">
                    {v.toFixed(4)}
                  </span>
                ))}
                {dims > 12 && (
                  <span className="rounded border border-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                    +{dims - 12} more
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-1 font-mono text-[10px] text-slate-600">No spatial data</div>
            )}
          </div>

          {((trajectory as any).reasoning as string | undefined) ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                Reasoning Chain
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-300">
                {(trajectory as any).reasoning}
              </pre>
            </div>
          ) : trajectory.task_context ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                Task Context
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-300">
                {JSON.stringify(trajectory.task_context, null, 2)}
              </pre>
            </div>
          ) : null}

          {trajectory.correction_delta && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300 mb-2">
                Correction Delta
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-amber-200">
                {trajectory.correction_delta}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <div className="text-[9px] font-mono uppercase text-slate-500">Similarity</div>
              <div className="mt-1 font-mono text-sm font-bold text-sky-300">
                {trajectory.similarity_score?.toFixed(3) ?? '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <div className="text-[9px] font-mono uppercase text-slate-500">Confidence</div>
              <div className="mt-1 font-mono text-sm font-bold text-emerald-300">
                {trajectory.confidence_score?.toFixed(3) ?? '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <div className="text-[9px] font-mono uppercase text-slate-500">Dims</div>
              <div className="mt-1 font-mono text-sm font-bold text-cyan-300">
                {dims}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThinkTrajectoriesPlugin({ plugin, trajectories = [], loading }: ThinkTrajectoriesPluginProps) {
  const items = trajectories.slice(0, 9);
  const grid = Array.from({ length: 9 }, (_, i) => items[i] ?? null);
  const [selected, setSelected] = useState<ThinkTrajectory | null>(null);

  return (
    <>
      <PluginCard plugin={plugin} accent="border-violet-500/20" glow="via-violet-500/50">
        <p className="text-[11px] text-slate-400">
          Spatial vector trajectories — 1536-dim token embeddings surfaced from the Neon pgvector store.
          Click a cell to inspect the reasoning chain.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {grid.map((trajectory, idx) => (
            <button
              type="button"
              key={idx}
              disabled={!trajectory}
              onClick={() => trajectory && setSelected(trajectory)}
              className={`rounded-lg border p-1.5 text-left transition-colors ${
                trajectory
                  ? 'border-violet-500/20 bg-violet-500/[0.04] cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/[0.08]'
                  : 'border-slate-800 bg-slate-950/40 cursor-default'
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
                      sim {trajectory.similarity_score?.toFixed(3) ?? '—'}
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
            </button>
          ))}
        </div>
        {loading && (
          <div className="mt-2 text-[10px] font-mono text-slate-500">probing trajectories…</div>
        )}
      </PluginCard>

      {selected && (
        <TrajectoryDrawer
          trajectory={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
