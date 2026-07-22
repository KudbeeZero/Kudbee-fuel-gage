import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiGet } from '../lib/apiClient';
import { FileText } from 'lucide-react';

interface ContractMonitorPluginProps { plugin: IKudbeePlugin; }

export function ContractMonitorPlugin({ plugin }: ContractMonitorPluginProps) {
  const [contracts, setContracts] = useState<Array<{ id: string; agentId: string; maxTokensPerWindow: number; maxMemoryBytes: number; maxLatencyMs: number; active: boolean; violations: number; signedAt: string }>>([]);
  useEffect(() => {
    const fetch = async () => {
      try { const d = await apiGet<{ contracts: typeof contracts }>('/api/governance/contract/active'); setContracts(d?.contracts ?? []); } catch {}
    };
    void fetch(); const id = setInterval(() => void fetch(), 15000); return () => clearInterval(id);
  }, []);
  return (<PluginCard plugin={plugin} accent="border-emerald-500/20" glow="via-emerald-500/50">
    <p className="text-[11px] text-slate-400">Assume-guarantee contracts — agents sign resource leases; kernel enforces compliance.</p>
    {contracts.length === 0 ? <div className="mt-3 font-mono text-[10px] text-slate-500">No active contracts.</div> : <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">{contracts.map(c => (
      <div key={c.id} className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 font-mono text-[9px]">
        <div className="flex justify-between text-emerald-300"><span>{c.id.slice(0, 16)}…</span><span className={c.active ? 'text-green-400' : 'text-red-400'}>{c.active ? '● compliant' : '● breached'}</span></div>
        <div className="text-slate-500">agent {c.agentId?.slice(0, 10) ?? '?'} · {c.violations ?? 0} violations</div>
      </div>
    ))}</div>}
    <footer className="mt-3 border-t border-slate-800/60 pt-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">{contracts.length} contracts · 15s poll</footer>
  </PluginCard>);
}
export default ContractMonitorPlugin;
