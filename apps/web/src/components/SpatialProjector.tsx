import { useState, useEffect, useMemo } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import type { ThinkTrajectory } from '@kudbee/types';
import { apiGet } from '../lib/apiClient';
import { Dna } from 'lucide-react';

interface SpatialProjectorProps {
  plugin: IKudbeePlugin;
}

const STATUS_COLOR: Record<string, string> = {
  VERIFIED: 'bg-emerald-400 shadow-emerald-400/60',
  PENDING_APPROVAL: 'bg-amber-400 shadow-amber-400/60',
  RECYCLED: 'bg-rose-400 shadow-rose-400/60',
};

const FALLBACK = 'bg-slate-500 shadow-slate-500/40';

function fibonacciSphere(index: number, total: number, radius: number): { x: number; y: number; z: number } {
  const phi = Math.acos(1 - 2 * (index + 0.5) / total);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return {
    x: Math.cos(theta) * Math.sin(phi) * radius,
    y: Math.cos(phi) * radius,
    z: Math.sin(theta) * Math.sin(phi) * radius,
  };
}

function Dot({ trajectory, index, total }: { trajectory: ThinkTrajectory; index: number; total: number }) {
  const coords = trajectory.spatial_coordinates;
  const has3D = coords && coords.length >= 3;

  const p = has3D
    ? { x: coords[0], y: coords[1], z: coords[2] }
    : fibonacciSphere(index, total, 120);

  const clamped = {
    x: Math.max(-1, Math.min(1, p.x)) * 120,
    y: Math.max(-1, Math.min(1, p.y)) * 120,
    z: Math.max(-1, Math.min(1, p.z)) * 120,
  };

  const color = STATUS_COLOR[trajectory.status] ?? FALLBACK;

  return (
    <div
      className="group absolute"
      style={{
        transform: `translate3d(${clamped.x}px, ${clamped.y}px, ${clamped.z}px)`,
      }}
    >
      <div
        className={`h-3 w-3 rounded-full ${color} shadow-lg ring-1 ring-white/10 transition-transform hover:scale-150`}
      />
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-700 bg-slate-900/95 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="font-mono text-[9px] text-slate-300">
          {trajectory.token_hash.slice(0, 12)}…
        </div>
        <div className="font-mono text-[8px] text-indigo-300">
          sim {trajectory.similarity_score?.toFixed(3) ?? '—'}
        </div>
      </div>
    </div>
  );
}

export function SpatialProjector({ plugin }: SpatialProjectorProps) {
  const [trajectories, setTrajectories] = useState<ThinkTrajectory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const data = await apiGet<{ trajectories: ThinkTrajectory[]; count: number }>(
          '/api/think/trajectories?limit=50'
        );
        if (!cancelled) {
          setTrajectories(data?.trajectories ?? []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    const interval = setInterval(() => void fetchData(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const visible = useMemo(() => trajectories.slice(0, 50), [trajectories]);

  return (
    <PluginCard plugin={plugin} accent="border-indigo-500/20" glow="via-indigo-500/50">
      <p className="text-[11px] text-slate-400">
        3D homunculus — projective mapping of trajectory cluster topologies in CSS perspective space.
      </p>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-slate-500">
          <Dna className="h-3 w-3 animate-spin" />
          probing spatial manifold…
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-3 font-mono text-[10px] text-slate-600">
          No trajectory data — manifold empty.
        </div>
      ) : (
        <div className="mt-3 flex justify-center">
          <div
            className="relative h-64 w-64"
            style={{ perspective: '600px' }}
          >
            <div
              className="absolute inset-0 animate-[homunculus-orbit_20s_linear_infinite]"
              style={{
                transformStyle: 'preserve-3d',
                transformOrigin: '50% 50%',
              }}
            >
              {visible.map((traj, idx) => (
                <Dot key={traj.id} trajectory={traj} index={idx} total={visible.length} />
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes homunculus-orbit {
          0% { transform: rotateX(8deg) rotateY(0deg); }
          100% { transform: rotateX(8deg) rotateY(360deg); }
        }
      `}</style>
    </PluginCard>
  );
}

export default SpatialProjector;
