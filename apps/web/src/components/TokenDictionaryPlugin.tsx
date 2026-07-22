import { useState } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import { apiPost } from '../lib/apiClient';
import { BookOpen, Search, Loader2, Zap } from 'lucide-react';

interface TokenDictionaryPluginProps {
  plugin: IKudbeePlugin;
}

export function TokenDictionaryPlugin({ plugin }: TokenDictionaryPluginProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ found: boolean; snapshot?: { text: string; similarity: number }; similarity: number; latencyMs: number } | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await apiPost<typeof result>('/api/memory/dictionary/lookup', { query: query.trim() });
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PluginCard plugin={plugin} accent="border-amber-500/20" glow="via-amber-500/50">
      <p className="text-[11px] text-slate-400">
        Victory Memory Dictionary — sub-millisecond cosine lookup over verified reasoning snapshots stored in pgvector.
      </p>
      <form onSubmit={(e) => void handleLookup(e)} className="mt-3">
        <div className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950/40 px-2 py-1">
          <Search className="h-3 w-3 text-slate-600" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Look up a reasoning pattern..." className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none" />
          <button type="submit" disabled={loading || !query.trim()} className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[9px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-30">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><BookOpen className="h-3 w-3" /> Lookup</>}
          </button>
        </div>
      </form>
      {result && (
        <div className={`mt-3 rounded-lg border p-3 ${result.found ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-950/40'}`}>
          {result.found ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-mono text-[10px] text-amber-300"><Zap className="h-3 w-3" /> Victory Snapshot Found</span>
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300">Score: {result.similarity.toFixed(4)}</span>
              </div>
              <div className="mt-2 font-mono text-[10px] leading-relaxed text-slate-300">{result.snapshot?.text?.slice(0, 300) || '—'}</div>
              <div className="mt-1 font-mono text-[9px] text-slate-500">{result.latencyMs}ms recall</div>
            </>
          ) : (
            <div className="font-mono text-[10px] text-slate-500">No matching snapshot (sim &lt; 0.90) · {result.latencyMs}ms</div>
          )}
        </div>
      )}
    </PluginCard>
  );
}

export default TokenDictionaryPlugin;
