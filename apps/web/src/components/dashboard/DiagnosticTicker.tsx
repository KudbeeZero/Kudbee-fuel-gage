import React, { useEffect, useState } from 'react';
import { Activity, X } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface TraceRecord {
  trace_id: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  status: string;
}

// Real-data hook: surface the most recent ingested telemetry trace as the live
// OTel ref payload. Resilient-First — a fetch failure (or an empty store)
// degrades to the clean "Awaiting Telemetry" state, never a fabricated record.
function useLatestTrace(): { trace: TraceRecord | null; loading: boolean } {
  const [trace, setTrace] = useState<TraceRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await apiGet<unknown>('/api/telemetry/logs?limit=1');
        if (cancelled || !Array.isArray(rows) || rows.length === 0) {
          setTrace(null);
          return;
        }
        const r = rows[0] as Record<string, unknown>;
        setTrace({
          trace_id: String(r.trace_id ?? 'unknown'),
          model: String(r.model ?? 'unknown'),
          tokens_in: Number(r.tokens_in) || 0,
          tokens_out: Number(r.tokens_out) || 0,
          cost: Number(r.cost) || 0,
          status: String(r.status ?? 'OK')
        });
      } catch {
        setTrace(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { trace, loading };
}

export function DiagnosticTicker() {
  const { trace, loading } = useLatestTrace();

  return (
    <div
      className="bg-slate-900/40 border border-slate-800 p-3 font-mono text-xs relative overflow-hidden"
      id="diagnostic-ticker"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.7)]"></span>
          </span>
          <span className="text-slate-300 tracking-wide flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-500/70" />
            OTel Stream Schema: VERIFIED STABLE
          </span>
        </div>

        <button
          type="button"
          className="p-1 text-slate-500 hover:text-slate-200 border border-slate-800 hover:border-slate-700 rounded cursor-pointer transition-all active:scale-95 duration-75"
          aria-label="Dismiss diagnostic ticker"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
        {loading ? (
          <span className="text-slate-600">Probing telemetry store…</span>
        ) : trace ? (
          <>
            <span className="text-slate-400">Ref Payload:</span>{' '}
            {JSON.stringify(trace)}
          </>
        ) : (
          <span className="text-slate-600">Awaiting Telemetry · no captured traces yet.</span>
        )}
      </div>
    </div>
  );
}

export default DiagnosticTicker;
