import { useState, useEffect } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiGet } from '../lib/apiClient';
import { Timer } from 'lucide-react';

interface ProbationRecord {
  tokenId: string;
  guardTokenId: string;
  reason: string;
  stagedAt: number;
  outcome: string | null;
  resolvedAt: number | null;
}

interface ProbationDocketPluginProps { plugin: IKudbeePlugin; }

function formatCountdown(stagedAt: number): string {
  const elapsed = Math.max(0, Math.ceil((stagedAt + 60_000 - Date.now()) / 1000));
  return `${elapsed}s`;
}

export function ProbationDocketPlugin({ plugin }: ProbationDocketPluginProps) {
  const [docket, setDocket] = useState<ProbationRecord[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const fetchDocket = async () => {
      try {
        const data = await apiGet<ProbationRecord[]>('/api/governance/probation/docket');
        setDocket(Array.isArray(data) ? data : []);
      } catch { /* endpoint may not exist yet */ }
    };
    void fetchDocket();
    const poll = setInterval(() => void fetchDocket(), 10_000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const countdown = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(countdown);
  }, []);

  return (
    <PluginCard plugin={plugin} accent="border-purple-500/20" glow="via-purple-500/50">
      <p className="text-[11px] text-slate-400">
        Staged probation framework — displaced tokens under 60s evaluation by guard tokens before salvage or sink.
      </p>
      {docket.length === 0 ? (
        <div className="mt-3 font-mono text-[10px] text-slate-500">No tokens in probation</div>
      ) : (
        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
          {docket.map((r) => (
            <div
              key={r.tokenId}
              className="rounded border border-purple-500/20 bg-purple-500/5 p-2 font-mono text-[9px]"
            >
              <div className="flex justify-between text-purple-300">
                <span>{r.tokenId.slice(0, 16)}…</span>
                <span className="flex items-center gap-1 text-purple-400">
                  <Timer className="h-3 w-3" />
                  {formatCountdown(r.stagedAt)}
                </span>
              </div>
              <div className="text-slate-500 mt-0.5">
                guard <span className="text-slate-400">{r.guardTokenId.slice(0, 12)}…</span>
              </div>
              <div className="text-slate-600 mt-0.5 line-clamp-1">{r.reason}</div>
            </div>
          ))}
        </div>
      )}
      <footer className="mt-3 border-t border-slate-800/60 pt-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">
        {docket.length} on docket · 10s poll
      </footer>
    </PluginCard>
  );
}

export default ProbationDocketPlugin;
