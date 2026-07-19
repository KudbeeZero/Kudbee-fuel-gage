/**
 * apps/web/src/components/plugins/ThinkStormPlugin.tsx
 * ---------------------------------------------------------------------------
 * DAW-style "Think: Storm" plugin (4-col). Visualizes reasoning intensity /
 * cognitive load with placeholder nodes. No backend wiring yet — this is the
 * storm (pre-token) stage of the Think pipeline.
 *
 * Strictly typed — no `any`.
 */
import { useState, useEffect } from 'react';

interface StormNode {
  id: number;
  intensity: number; // 0..1 placeholder cognitive load
  label: string;
}

const SEED_NODES: StormNode[] = [
  { id: 1, intensity: 0.82, label: 'hypothesis' },
  { id: 2, intensity: 0.54, label: 'branch' },
  { id: 3, intensity: 0.36, label: 'constraint' },
  { id: 4, intensity: 0.67, label: 'recall' },
  { id: 5, intensity: 0.21, label: 'verify' },
  { id: 6, intensity: 0.48, label: 'route' }
];

function StormNodeBar({ node }: { node: StormNode }) {
  const pct = Math.round(node.intensity * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
        {node.label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-800/80">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-600/70 to-fuchsia-400/80"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-[9px] text-violet-300">{pct}%</span>
    </div>
  );
}

export function ThinkStormPlugin() {
  const [nodes, setNodes] = useState<StormNode[]>(SEED_NODES);

  // Gentle animated jitter so the storm "breathes" (placeholder visual only).
  useEffect(() => {
    const id = setInterval(() => {
      setNodes((prev) =>
        prev.map((n) => {
          const next = n.intensity + (Math.random() - 0.5) * 0.18;
          return { ...n, intensity: Math.max(0.08, Math.min(1, next)) };
        })
      );
    }, 1600);
    return () => clearInterval(id);
  }, []);

  const avg = nodes.reduce((a, n) => a + n.intensity, 0) / nodes.length;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-violet-500/25 bg-slate-900/60 p-4">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
          <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-violet-200">
            Think: Storm
          </h3>
        </div>
        <span className="font-mono text-[9px] text-slate-500">storm · pre-token</span>
      </div>

      <div className="mt-3 space-y-1.5">
        {nodes.map((n) => (
          <StormNodeBar key={n.id} node={n} />
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-800/60 pt-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
          avg intensity
        </span>
        <span className="font-mono text-xs font-semibold text-violet-300">
          {Math.round(avg * 100)}%
        </span>
      </div>
    </div>
  );
}

export default ThinkStormPlugin;
