import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiGet } from '../lib/apiClient';
import { AlertTriangle, Zap } from 'lucide-react';

interface AnomalyFeedPluginProps { plugin: IKudbeePlugin; }

export function AnomalyFeedPlugin({ plugin }: AnomalyFeedPluginProps) {
  const [anomalies, setAnomalies] = useState<Array<{ tokenId?: string; confidence?: number; timestamp?: string; raw?: string }>>([]);
  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await apiGet<{ anomalies: typeof anomalies }>('/api/think/anomalies?limit=8');
        setAnomalies(data?.anomalies || []);
      } catch { /* degraded */ }
    };
    void fetch(); const id = setInterval(() => void fetch(), 12000); return () => clearInterval(id);
  }, []);
  return (
    <PluginCard plugin={plugin} accent="border-rose-500/20" glow="via-rose-500/50">
      <p className="text-[11px] text-slate-400">Groq anomaly feed — low-confidence minted think tokens flagged in real-time.</p>
      {anomalies.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-emerald-300"><Zap className="h-3 w-3" /> All tokens passing confidence threshold.</div>
      ) : (
        <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
          {anomalies.map((a, i) => (
            <div key={i} className="rounded border border-rose-500/20 bg-rose-500/5 p-2 font-mono text-[9px] text-rose-300">
              <div className="flex items-center justify-between"><span>{a.tokenId || '—'}</span><AlertTriangle className="h-3 w-3 text-rose-400" /></div>
              <div className="text-slate-500">conf: {a.confidence?.toFixed(3) || '—'} · {a.timestamp || '—'}</div>
            </div>
          ))}
        </div>
      )}
      <footer className="mt-3 border-t border-slate-800/60 pt-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">{anomalies.length} flagged · 12s poll</footer>
    </PluginCard>
  );
}
export default AnomalyFeedPlugin;
