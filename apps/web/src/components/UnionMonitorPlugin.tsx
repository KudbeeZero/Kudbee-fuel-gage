import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiGet } from '../lib/apiClient';
import { Users } from 'lucide-react';

interface UnionMonitorPluginProps { plugin: IKudbeePlugin; }

export function UnionMonitorPlugin({ plugin }: UnionMonitorPluginProps) {
  const [unions, setUnions] = useState<Array<{ id: string; pooledAffinity: number; pooledEfficacy: number; members: Array<{ agentId: string }>; formedAt: string }>>([]);
  useEffect(() => {
    const fetch = async () => {
      try { const d = await apiGet<{ unions: typeof unions }>('/api/governance/union/active'); setUnions(d?.unions || []); } catch {}
    };
    void fetch(); const id = setInterval(() => void fetch(), 15000); return () => clearInterval(id);
  }, []);
  return (<PluginCard plugin={plugin} accent="border-cyan-500/20" glow="via-cyan-500/50">
    <p className="text-[11px] text-slate-400">Nash bargaining coalitions — agents pool affinity and efficacy to negotiate resource allocation.</p>
    {unions.length === 0 ? <div className="mt-3 font-mono text-[10px] text-slate-500">No active unions.</div> : <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">{unions.map(u => (
      <div key={u.id} className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2 font-mono text-[9px]">
        <div className="flex justify-between text-cyan-300"><span>{u.id.slice(0, 16)}…</span><span>{u.members.length} agents</span></div>
        <div className="text-slate-500">aff {u.pooledAffinity.toFixed(3)} · eff {u.pooledEfficacy.toFixed(3)}</div>
      </div>
    ))}</div>}
    <footer className="mt-3 border-t border-slate-800/60 pt-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">{unions.length} unions · 15s poll</footer>
  </PluginCard>);
}
export default UnionMonitorPlugin;
