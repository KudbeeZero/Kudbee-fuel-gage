import { useState, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import { TelemetryTraceSchema, ApprovalStatusSchema } from '@kudbee/types';
import { Search, Activity } from 'lucide-react';
import { apiPost } from '../lib/apiClient';

export const EdgeGovernanceSchema = z.object({
  id: z.string().min(1),
  status: ApprovalStatusSchema,
  agentId: z.literal('EDGE_SENTINEL'),
  action: z.string().min(1),
  calculatedRisk: z.number().int().min(0).max(6),
  reason: z.string()
});
export type EdgeGovernance = z.infer<typeof EdgeGovernanceSchema>;

export interface EdgeSignal {
  traceId: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface EdgeSentinelPluginProps {
  signals?: readonly EdgeSignal[];
  connected?: boolean;
  lastIngressAt?: number | null;
  pendingGovernance?: EdgeGovernance | null;
}

interface ProbeResult {
  status: 'HEALTHY' | 'DEGRADED' | 'UNREACHABLE';
  services?: Record<string, { status: string; latencyMs: number }>;
  agent?: { status: string };
}

const MAX_BARS = 12;
const RISK_MAX = 6;
const INGRESS_PULSE_MS = 4000;

const WIDTH_STEPS = [
  'w-0', 'w-[8%]', 'w-[17%]', 'w-1/4', 'w-[33%]',
  'w-2/5', 'w-1/2', 'w-[58%]', 'w-2/3', 'w-3/4',
  'w-[92%]', 'w-full'
] as const;

function widthClass(pct: number): string {
  const idx = Math.max(0, Math.min(WIDTH_STEPS.length - 1, Math.round(pct / 100 * (WIDTH_STEPS.length - 1))));
  return WIDTH_STEPS[idx] ?? 'w-0';
}

function parseRawSignal(raw: unknown): EdgeSignal | null {
  const parsed = TelemetryTraceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  return {
    traceId: String(t.trace_id),
    model: String(t.model),
    latencyMs: 0,
    tokensIn: Number(t.tokens_in) || 0,
    tokensOut: Number(t.tokens_out) || 0
  };
}

function riskTone(score: number): string {
  if (score >= 5) return 'bg-rose-500';
  if (score >= 3) return 'bg-amber-500';
  if (score >= 1) return 'bg-yellow-400';
  return 'bg-emerald-500';
}

function riskLabel(score: number): string {
  if (score >= 5) return 'CRITICAL';
  if (score >= 3) return 'ELEVATED';
  if (score >= 1) return 'WATCH';
  return 'NOMINAL';
}

export function EdgeSentinelPlugin({
  signals = [],
  connected = true,
  lastIngressAt = null,
  pendingGovernance = null
}: EdgeSentinelPluginProps) {
  const [pulse, setPulse] = useState(false);
  const [liveRisk, setLiveRisk] = useState(0);
  const [query, setQuery] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (probeTimerRef.current !== null) clearTimeout(probeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (lastIngressAt == null) return;
    setPulse(true);
    const last = signals[0];
    const tokens = last ? last.tokensIn + last.tokensOut : 0;
    setLiveRisk(Math.min(RISK_MAX, Math.round(tokens / 1000)));
    const t = setTimeout(() => setPulse(false), INGRESS_PULSE_MS);
    return () => clearTimeout(t);
  }, [lastIngressAt, signals]);

  const filtered = useMemo(() => {
    if (!query.trim()) return signals;
    const q = query.toLowerCase();
    return signals.filter((s) =>
      s.traceId.toLowerCase().includes(q) || s.model.toLowerCase().includes(q)
    );
  }, [signals, query]);

  const ingested = filtered.length;
  const signalPct = ingested === 0 ? 0 : 100;
  const noisePct = 0;

  const bars = Array.from({ length: MAX_BARS }, (_, i) => i < ingested);

  const clampedRisk = Math.max(0, Math.min(RISK_MAX, liveRisk));
  const gaugePct = Math.round((clampedRisk / RISK_MAX) * 100);

  const triggerProbe = async () => {
    setProbing(true);
    setProbeResult(null);
    if (probeTimerRef.current !== null) clearTimeout(probeTimerRef.current);
    try {
      const data = await apiPost<ProbeResult>('/api/system/health-deep', {});
      setProbeResult(data);
    } catch {
      setProbeResult({ status: 'UNREACHABLE' });
    } finally {
      setProbing(false);
      probeTimerRef.current = setTimeout(() => setProbeResult(null), 8000);
    }
  };

  return (
    <article
      id="plugin-edge-sentinel"
      data-plugin="sentinel"
      className="group relative flex min-h-[180px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition-all hover:border-emerald-500/40"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${pulse ? 'animate-ping bg-emerald-300' : 'bg-emerald-400'}`} />
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-200">
            EDGE: SENTINEL
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={probing}
            onClick={() => void triggerProbe()}
            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/40 px-2 py-1 font-mono text-[9px] uppercase text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:opacity-40"
            title="Trigger System Probe"
          >
            <Activity className={`h-3 w-3 ${probing ? 'animate-pulse' : ''}`} />
            {probing ? 'probing…' : 'Probe'}
          </button>
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${pulse ? 'animate-pulse bg-emerald-300' : connected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            {pulse ? 'INGRESS' : connected ? 'HEARTBEAT OK' : 'OFFLINE'}
          </span>
        </div>
      </header>

      {/* Probe Result Banner */}
      {probeResult && (
        <div className={`mt-3 rounded border px-3 py-2 font-mono text-[9px] ${
          probeResult.status === 'HEALTHY'
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
            : probeResult.status === 'DEGRADED'
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
              : 'border-rose-500/30 bg-rose-500/5 text-rose-300'
        }`}>
          Probe: {probeResult.status}
          {probeResult.services?.postgres && (
            <span className="ml-2">PG {probeResult.services.postgres.latencyMs}ms</span>
          )}
          {probeResult.services?.redis && (
            <span className="ml-2">Redis {probeResult.services.redis.latencyMs}ms</span>
          )}
          {probeResult.agent && (
            <span className="ml-2">Agent {probeResult.agent.status}</span>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="mt-3 flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950/40 px-2 py-1">
        <Search className="h-3 w-3 text-slate-600" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by trace_id or model…"
          className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />
      </div>

      {/* Signal-to-Noise Visualizer */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-500">
          <span>Signal / Noise</span>
          <span>{signalPct}% sig · {noisePct}% dropped</span>
        </div>
        <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
          <div className={`h-full bg-emerald-500/70 transition-all duration-500 ${widthClass(signalPct)}`} />
          <div className={`h-full bg-slate-700/60 transition-all duration-500 ${widthClass(noisePct)}`} />
        </div>
        <div className="mt-2 flex items-end gap-[3px]">
          {bars.map((on, i) => (
            <span
              key={i}
              className={`h-5 flex-1 rounded-sm transition-all duration-300 ${on ? (pulse ? 'bg-emerald-300/90' : 'bg-emerald-400/80') : 'bg-slate-800'}`}
            />
          ))}
        </div>
        {ingested === 0 && signals.length > 0 && query.trim() && (
          <p className="mt-2 font-mono text-[10px] text-slate-500">No signals match filter.</p>
        )}
        {signals.length === 0 && (
          <p className="mt-2 font-mono text-[10px] text-slate-600">
            Awaiting Telemetry · no egressed signals captured yet.
          </p>
        )}
      </div>

      {/* Blast Radius Gauge */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-500">
          <span>Blast Radius</span>
          <span className={clampedRisk >= 3 ? 'text-amber-300' : 'text-emerald-300'}>
            {riskLabel(clampedRisk)} · {clampedRisk}/{RISK_MAX}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
          <div className={`h-full ${riskTone(clampedRisk)} transition-all duration-500 ${widthClass(gaugePct)}`} />
        </div>
        {pendingGovernance ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-mono text-amber-300">
            HITL · {pendingGovernance.action} · risk {pendingGovernance.calculatedRisk}
          </div>
        ) : (
          <div className="mt-3 text-[10px] font-mono text-slate-500">
            No escalations · autonomous hand-off disabled
          </div>
        )}
      </div>

      <footer className="mt-4 border-t border-slate-800/60 pt-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        sentinel · {ingested} egressed · dyno bound
      </footer>
    </article>
  );
}

export { parseRawSignal };
export default EdgeSentinelPlugin;
