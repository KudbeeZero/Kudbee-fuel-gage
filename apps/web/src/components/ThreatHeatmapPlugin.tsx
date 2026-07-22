import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiGet } from '../lib/apiClient';
import { Shield, AlertTriangle } from 'lucide-react';

interface ThreatEntry {
  model: string;
  threatCount: number;
  totalTraces: number;
  category: string;
}

interface ThreatHeatmapPluginProps {
  plugin: IKudbeePlugin;
}

const HEAT_COLORS = [
  'bg-emerald-500/60',
  'bg-emerald-400/50',
  'bg-yellow-400/50',
  'bg-amber-500/60',
  'bg-orange-500/70',
  'bg-rose-500/80'
];

function heatClass(ratio: number): string {
  const idx = Math.min(HEAT_COLORS.length - 1, Math.floor(ratio * HEAT_COLORS.length));
  return HEAT_COLORS[idx] ?? HEAT_COLORS[0];
}

export function ThreatHeatmapPlugin({ plugin }: ThreatHeatmapPluginProps) {
  const [threats, setThreats] = useState<ThreatEntry[]>([]);
  const [sinkPressure, setSinkPressure] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await apiGet<{ threats?: ThreatEntry[]; pressure?: number }>('/api/interceptor/threat-heatmap');
        setThreats(Array.isArray(data?.threats) ? data.threats : []);
        setSinkPressure(typeof data?.pressure === 'number' ? data.pressure : 0);
      } catch { /* degraded */ }
    };
    void fetchData();
    const id = setInterval(() => void fetchData(), 15000);
    return () => clearInterval(id);
  }, []);

  const maxThreats = Math.max(1, ...threats.map(t => t.threatCount));

  return (
    <PluginCard plugin={plugin} accent="border-rose-500/20" glow="via-rose-500/50">
      <p className="text-[11px] text-slate-400">
        Groq-evaluated threat distribution — models flagged by FTWB semantic firewall.
      </p>

      <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
        <span className="flex items-center gap-1 text-slate-500">
          <Shield className="h-3 w-3" />
          Sink Pressure
        </span>
        <span className={sinkPressure > 0.5 ? 'text-rose-300' : 'text-emerald-300'}>
          {(sinkPressure * 100).toFixed(1)}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all duration-500 ${sinkPressure > 0.5 ? 'bg-rose-500' : 'bg-emerald-400'}`}
          style={{ width: `${Math.min(100, sinkPressure * 100)}%` }}
        />
      </div>

      {threats.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <AlertTriangle className="h-3 w-3 text-slate-600" />
          No interceptor threats detected — firewall calm.
        </div>
      ) : (
        <div className="mt-4 space-y-1.5">
          {threats.map((t) => (
            <div key={t.model} className="flex items-center gap-2">
              <span className="w-16 truncate font-mono text-[9px] text-slate-400">{t.model}</span>
              <div className="flex-1 h-3 rounded-sm bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${heatClass(t.threatCount / maxThreats)}`}
                  style={{ width: `${(t.threatCount / maxThreats) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-[9px] text-slate-500">{t.threatCount}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="mt-3 border-t border-slate-800/60 pt-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">
        ftwb firewall · groq-evaluated
      </footer>
    </PluginCard>
  );
}

export default ThreatHeatmapPlugin;
