import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiGet } from '../lib/apiClient';
import { Activity, TrendingDown } from 'lucide-react';

interface EnergyDecayPluginProps { plugin: IKudbeePlugin; }

export function EnergyDecayPlugin({ plugin }: EnergyDecayPluginProps) {
  const [avgEnergy, setAvgEnergy] = useState(0);
  const [weights, setWeights] = useState<{ alpha: number; beta: number; gamma: number; delta: number } | null>(null);
  const [snapCount, setSnapCount] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await apiGet<{ averageEnergy: number; weights: { alpha: number; beta: number; gamma: number; delta: number }; snapshots: unknown[] }>('/api/think/energy-mesh');
        setAvgEnergy(data?.averageEnergy ?? 0);
        setWeights(data?.weights ?? null);
        setSnapCount((data?.snapshots ?? []).length);
      } catch { /* degraded */ }
    };
    void fetch(); const id = setInterval(() => void fetch(), 8000); return () => clearInterval(id);
  }, []);

  const pct = (avgEnergy * 100).toFixed(1);
  const status = avgEnergy < 0.3 ? 'EFFICIENT' : avgEnergy < 0.6 ? 'ELEVATED' : 'ENTROPIC';

  return (
    <PluginCard plugin={plugin} accent="border-violet-500/20" glow="via-violet-500/50">
      <p className="text-[11px] text-slate-400">Thermodynamic energy mesh — computes E(token) = α(1-Kd)ε + β(1-sim) + γ(sink) + δ(threat).</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-slate-500"><Activity className="inline h-3 w-3 mr-1" />System Energy</span>
        <span className={`font-mono text-lg font-bold ${avgEnergy < 0.3 ? 'text-emerald-300' : avgEnergy < 0.6 ? 'text-amber-300' : 'text-rose-300'}`}>{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full transition-all duration-700 ${avgEnergy < 0.3 ? 'bg-emerald-400' : avgEnergy < 0.6 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-slate-500">
        <span>{status}</span>
        <span>{snapCount} samples · 8s poll</span>
      </div>
      {weights && (
        <div className="mt-2 grid grid-cols-4 gap-1 font-mono text-[8px] text-slate-600">
          <span>α:{weights.alpha.toFixed(2)}</span><span>β:{weights.beta.toFixed(2)}</span><span>γ:{weights.gamma.toFixed(2)}</span><span>δ:{weights.delta.toFixed(2)}</span>
        </div>
      )}
    </PluginCard>
  );
}
export default EnergyDecayPlugin;
