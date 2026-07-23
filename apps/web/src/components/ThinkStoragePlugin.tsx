import { useEffect, useRef, useState } from 'react';
import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';
import type { ThinkTrajectory } from '@kudbee/types';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import { apiPost } from '../lib/apiClient';

interface ThinkStoragePluginProps {
  plugin: IKudbeePlugin;
  trajectories: ThinkTrajectory[];
}

interface MemoryRecallResult {
  id: string;
  chunk: string;
  score: number;
  source?: string;
}

export function ThinkStoragePlugin({ plugin, trajectories = [] }: ThinkStoragePluginProps) {
  const _mountedRef = useRef(true);
  useEffect(() => {
    _mountedRef.current = true;
    return () => { _mountedRef.current = false; };
  }, []);
  const count = trajectories.length;
  const dims = count > 0 ? (trajectories[0]?.spatial_coordinates?.length ?? 0) : 0;
  const deltas = trajectories.filter((t) => t.correction_delta && t.correction_delta.length > 0).length;

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MemoryRecallResult[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setSearched(true);
    try {
      const data = await apiPost<{ memories?: MemoryRecallResult[]; results?: MemoryRecallResult[] }>(
        '/api/memory/recall',
        { query: q, limit: 5 }
      );
      const list = data?.memories ?? data?.results ?? [];
      if (!_mountedRef.current) return;
      setResults(Array.isArray(list) ? list : []);
    } catch {
      if (!_mountedRef.current) return;
      setResults([]);
    } finally {
      if (!_mountedRef.current) return;
      setSearching(false);
    }
  };

  return (
    <PluginCard plugin={plugin} accent="border-sky-500/20" glow="via-sky-500/50">
      <p className="text-[11px] text-slate-400">
        Durable memory recall — semantic search over archived traces with similarity-ranked retrieval.
      </p>
      <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-sky-300">
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">{count} vectors</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">{dims}-dim embed</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">{deltas} deltas</span>
      </div>

      {/* Recall Memory Search */}
      <form onSubmit={(e) => void handleSearch(e)} className="mt-3">
        <div className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950/40 px-2 py-1">
          <Search className="h-3 w-3 text-slate-600" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Recall Memory… (e.g. 'telemetry dashboard latency')"
            className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-mono text-[9px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-30"
          >
            {searching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <ArrowRight className="h-3 w-3" />
                Search
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {searching && (
        <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          querying vector memory…
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] text-sky-200">
                  {r.chunk.length > 80 ? r.chunk.slice(0, 80) + '…' : r.chunk}
                </span>
                <span className="shrink-0 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-sky-300">
                  Score: {r.score.toFixed(3)}
                </span>
              </div>
              {r.source && (
                <div className="mt-1 font-mono text-[8px] text-slate-500">
                  source: {r.source}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!searching && searched && results.length === 0 && (
        <div className="mt-3 font-mono text-[10px] text-slate-500">
          No matching memories found.
        </div>
      )}
    </PluginCard>
  );
}
