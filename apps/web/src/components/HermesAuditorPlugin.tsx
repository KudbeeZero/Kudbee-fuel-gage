import { useEffect, useRef, useState, useMemo } from 'react';
import { z } from 'zod';
import { TerminalSquare, Search, ToggleLeft, ToggleRight, Activity, History, ChevronDown } from 'lucide-react';
import type { IKudbeePlugin } from '@kudbee/types';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { apiPost, apiGet } from '../lib/apiClient';

export const HermesAuditLogSchema = z.object({
  ts: z.string().min(1),
  line: z.string().min(1)
});
export type HermesAuditLog = z.infer<typeof HermesAuditLogSchema>;

export interface HermesAuditorPluginProps {
  plugin: IKudbeePlugin;
  logs?: readonly HermesAuditLog[];
  connected?: boolean;
}

interface AuditEvent {
  timestamp: string;
  agentId: string;
  eventType: string;
  details: string;
}

interface ParsedSweep {
  ts: string;
  line: string;
  level: 'AUDIT' | 'WARN' | 'ERROR' | 'INFO' | 'UNKNOWN';
  target: string;
}

interface ProbeResult {
  status: 'HEALTHY' | 'DEGRADED' | 'UNREACHABLE';
  services?: Record<string, { status: string; latencyMs: number }>;
  agent?: { status: string };
}

const LEVEL_ORDER = ['AUDIT', 'WARN', 'ERROR', 'INFO'] as const;
const ALL_LEVELS: string[] = ['ALL', ...LEVEL_ORDER];
const TRAIL_PAGE_SIZE = 5;

function parseSweep(raw: HermesAuditLog): ParsedSweep | null {
  if (!raw?.line) return null;
  const levelMatch = raw.line.match(/\[(HERMES:AUDITOR)\]\s*(AUDIT|WARN|ERROR|INFO)/i);
  const level = (levelMatch?.[2]?.toUpperCase() as ParsedSweep['level']) || 'UNKNOWN';
  const tail = raw.line.slice((levelMatch?.index ?? 0) + (levelMatch?.[0]?.length ?? 0));
  const targetMatch = tail.match(/[a-z_]+/i);
  const target = targetMatch?.[0] ?? 'audit';
  return { ts: raw.ts, line: raw.line, level, target };
}

function levelTone(level: ParsedSweep['level']): string {
  switch (level) {
    case 'AUDIT':      return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    case 'WARN':       return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    case 'ERROR':      return 'text-rose-300 border-rose-500/30 bg-rose-500/10';
    case 'INFO':       return 'text-sky-300 border-sky-500/30 bg-sky-500/10';
    default:           return 'text-slate-300 border-slate-700 bg-slate-800/40';
  }
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatFullTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function HermesAuditorPluginInner({
  plugin,
  logs = [],
  connected = true
}: HermesAuditorPluginProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _mountedRef = useRef(true);

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [trailPage, setTrailPage] = useState(1);
  const [trailLoading, setTrailLoading] = useState(false);
  const [trailError, setTrailError] = useState<string | null>(null);
  const [trailTotal, setTrailTotal] = useState(0);

  useEffect(() => {
    _mountedRef.current = true;
    return () => {
      _mountedRef.current = false;
      if (probeTimerRef.current !== null) clearTimeout(probeTimerRef.current);
    };
  }, []);

  const fetchAuditTrail = async (page: number) => {
    setTrailLoading(true);
    setTrailError(null);
    try {
      const data = await apiGet<{ events: AuditEvent[]; total: number }>(
        `/api/governance/audit?page=${page}&limit=${TRAIL_PAGE_SIZE}`
      );
      if (!_mountedRef.current) return;
      if (page === 1) {
        setAuditEvents(data.events || []);
      } else {
        setAuditEvents((prev) => [...prev, ...(data.events || [])]);
      }
      setTrailTotal(data.total ?? 0);
    } catch (e) {
      if (!_mountedRef.current) return;
      setTrailError(e instanceof Error ? e.message : 'Audit trail fetch failed');
    } finally {
      if (_mountedRef.current) setTrailLoading(false);
    }
  };

  useEffect(() => {
    void fetchAuditTrail(1);
  }, []);

  const loadMore = () => {
    const nextPage = trailPage + 1;
    setTrailPage(nextPage);
    void fetchAuditTrail(nextPage);
  };

  const allSweeps = useMemo(
    () => logs.map(parseSweep).filter((s): s is ParsedSweep => s !== null),
    [logs]
  );

  const filtered = useMemo(() => {
    let result = allSweeps;
    if (levelFilter !== 'ALL') {
      result = result.filter((s) => s.level === levelFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((s) =>
        s.line.toLowerCase().includes(q) ||
        s.target.toLowerCase().includes(q)
      );
    }
    return result.slice(0, 40);
  }, [allSweeps, levelFilter, query]);

  useEffect(() => {
    if (autoScroll) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  });

  const lastSweep = filtered[0];
  const levelCounts = LEVEL_ORDER.reduce<Record<string, number>>((acc, l) => {
    acc[l] = filtered.filter((s) => s.level === l).length;
    return acc;
  }, {});

  const triggerProbe = async () => {
    setProbing(true);
    setProbeResult(null);
    if (probeTimerRef.current !== null) clearTimeout(probeTimerRef.current);
    try {
      const data = await apiPost<ProbeResult>('/api/system/health-deep', {});
      if (!_mountedRef.current) return;
      setProbeResult(data);
    } catch {
      if (!_mountedRef.current) return;
      setProbeResult({ status: 'UNREACHABLE' });
    } finally {
      if (_mountedRef.current) setProbing(false);
      probeTimerRef.current = setTimeout(() => { if (_mountedRef.current) setProbeResult(null); }, 8000);
    }
  };

  const remainingTrail = trailTotal - auditEvents.length;

  return (
    <article
      id="plugin-hermes-auditor"
      data-plugin="auditor"
      className="group relative flex min-h-[180px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-0 transition-all hover:border-emerald-500/40"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <header className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-200">
            {plugin.title}
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
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-emerald-400' : 'bg-rose-500'}`} />
            {connected ? 'WORKER LINKED' : 'OFFLINE'}
          </span>
        </div>
      </header>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800/60 px-4 py-2">
        <div className="flex flex-1 items-center gap-1.5 rounded border border-slate-800 bg-slate-950/40 px-2 py-1">
          <Search className="h-3 w-3 text-slate-600" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by trace_id, agent, or message…"
            className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
          />
        </div>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1 font-mono text-[10px] text-slate-300 focus:outline-none"
        >
          {ALL_LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAutoScroll((v) => !v)}
          className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950/40 px-2 py-1 font-mono text-[9px] text-slate-400 transition-colors hover:border-slate-600"
          title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
        >
          {autoScroll ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" /> : <ToggleLeft className="h-3.5 w-3.5 text-slate-500" />}
        </button>
      </div>

      {/* Probe Result Banner */}
      {probeResult && (
        <div className={`border-b px-4 py-2 font-mono text-[9px] ${
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
        </div>
      )}

      {/* Audit sweep stream */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-1 overflow-y-auto px-5 py-3 font-mono text-[11px] leading-relaxed"
      >
        {filtered.length === 0 ? (
          <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-2 text-slate-600">
            <TerminalSquare className="h-7 w-7 opacity-40" />
            <span className="font-mono text-xs">
              {logs.length === 0 ? 'No audit sweeps captured.' : 'No sweeps match current filter.'}
            </span>
          </div>
        ) : (
          filtered.map((sweep, i) => (
            <div key={`${sweep.ts}-${i}`} className="flex items-center gap-2">
              <span className="shrink-0 text-slate-600">{formatTs(sweep.ts)}</span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${levelTone(sweep.level)}`}
              >
                {sweep.level}
              </span>
              <span className="truncate text-slate-400">
                audit sweep · <span className="text-slate-200">{sweep.target}</span>
              </span>
            </div>
          ))
        )}
      </div>

      {/* Audit Trail Viewer */}
      <div className="border-t border-slate-800/60 px-5 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <History className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Audit Trail · {trailTotal} events
          </span>
        </div>
        {trailError && (
          <div className="mb-2 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 font-mono text-[9px] text-rose-300">
            {trailError}
          </div>
        )}
        <div className="space-y-1.5">
          {auditEvents.length === 0 && !trailLoading ? (
            <div className="font-mono text-[10px] text-slate-600">No audit events recorded.</div>
          ) : (
            auditEvents.slice(-5).map((evt, i) => (
              <div key={`${evt.timestamp}-${i}`} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
                <span className="shrink-0 font-mono text-[9px] text-slate-600">{formatFullTs(evt.timestamp)}</span>
                <span className="shrink-0 rounded border border-slate-700 bg-slate-800/60 px-1 font-mono text-[9px] font-bold uppercase text-slate-400">
                  {evt.eventType}
                </span>
                <span className="truncate font-mono text-[10px] text-slate-300">
                  agent <span className="text-emerald-300">{evt.agentId}</span> · {evt.details}
                </span>
              </div>
            ))
          )}
        </div>
        {remainingTrail > 0 && (
          <button
            type="button"
            onClick={loadMore}
            disabled={trailLoading}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-slate-700 bg-slate-800/40 px-3 py-1.5 font-mono text-[10px] text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:opacity-40"
          >
            {trailLoading ? (
              <>
                <Activity className="h-3 w-3 animate-spin" />
                Loading…
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Load More ({remainingTrail} remaining)
              </>
            )}
          </button>
        )}
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-slate-800/60 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <span>
          audit {levelCounts.AUDIT} · warn {levelCounts.WARN} · err {levelCounts.ERROR}
        </span>
        <span>
          {lastSweep ? `last: ${lastSweep.level.toLowerCase()} · ${lastSweep.target}` : 'no sweeps'}
        </span>
      </footer>
    </article>
  );
}

export function HermesAuditorPlugin(props: HermesAuditorPluginProps) {
  return (
    <PanelErrorBoundary panel={props.plugin.title}>
      <HermesAuditorPluginInner {...props} />
    </PanelErrorBoundary>
  );
}

export { parseSweep };
export default HermesAuditorPlugin;
