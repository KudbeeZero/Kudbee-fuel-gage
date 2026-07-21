import { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Server,
  Database,
  Radio,
  Wifi,
  WifiOff,
  Timer,
  Search,
  Download,
  Filter
} from 'lucide-react';
import { apiGet } from '../lib/apiClient';
import { useTelemetryStream, type StreamMode } from '../hooks/useTelemetryStream';
import { useTelemetrySearch, type SearchHit } from '../hooks/useTelemetrySearch';
import { useAuditExport } from '../hooks/useAuditExport';
import { FeedbackButton } from '../components/FeedbackButton';

interface SessionHistoryItem {
  pr_number: number;
  pr_title: string;
  pr_body?: string;
  github_sha: string;
  merged_at: string;
  struggles_encountered?: string[];
  lesson_learned?: string;
  diff_summary?: string;
}

interface TelemetryLog {
  id: number;
  user_id: number;
  provider: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  calculated_cost: number;
  project_name?: string;
  timestamp: string;
  model?: string;
  cost?: number;
  status?: string;
}

export function HistoryPage() {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  const { mode: streamMode, throughput, error: streamError, reconnect } = useTelemetryStream();
  const [streamPaused, setStreamPaused] = useState(false);

  const search = useTelemetrySearch();
  const auditExport = useAuditExport();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [sessionData, logData] = await Promise.all([
          apiGet<SessionHistoryItem[]>('/api/session-history'),
          apiGet<TelemetryLog[]>('/api/telemetry/logs?limit=50')
        ]);
        if (cancelled) return;
        setSessions(Array.isArray(sessionData) ? sessionData : []);
        setLogs(Array.isArray(logData) ? logData : []);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const formatCost = (cost: unknown): string => {
    if (cost === undefined || cost === null) return '—';
    const num = typeof cost === 'number' ? cost : parseFloat(String(cost));
    if (!Number.isFinite(num)) return '—';
    return `$${num.toFixed(6)}`;
  };

  const formatTokens = (inTok: number, outTok: number): string => {
    const total = (inTok || 0) + (outTok || 0);
    return `${total.toLocaleString()} tokens`;
  };

  const getStatusIcon = (status?: string) => {
    if (!status) return <Clock className="w-3.5 h-3.5 text-slate-400" />;
    const s = status.toUpperCase();
    if (s === 'OK' || s === '200') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (s === 'BLOCKED' || s === 'ERROR' || s === '500') return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
    if (s === 'INTERCEPTED' || s === '422') return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    return <Activity className="w-3.5 h-3.5 text-slate-400" />;
  };

  const totals = useMemo(() => {
    const inTok = logs.reduce((acc, l) => acc + (l.input_tokens || 0), 0);
    const outTok = logs.reduce((acc, l) => acc + (l.output_tokens || 0), 0);
    const cost = logs.reduce((acc, l) => acc + (Number(l.calculated_cost) || Number(l.cost) || 0), 0);
    return { inTok, outTok, cost };
  }, [logs]);

  return (
    <div className="space-y-6" id="history-page-container">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
        <div className="flex flex-wrap items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-400" />
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-semibold text-slate-200 text-lg">Audit Trail & Session History</h2>
            <p className="text-xs text-slate-500 mt-1">
              Chronological audit of merged agent runs and telemetry ingestion. Expand sessions to inspect token costs, execution status, and trace IDs.
            </p>
          </div>
          <StreamModeBadge mode={streamMode} paused={streamPaused} onTogglePause={() => setStreamPaused((p) => !p)} onReconnect={() => reconnect()} />
        </div>

        {/* Universal Search & Export (Phase 22) */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input
              id="history-search-input"
              type="text"
              value={search.filters.query}
              onChange={(e) => search.updateFilter({ query: e.target.value })}
              placeholder="Search traces, providers, models, verdicts…"
              className="flex-1 bg-transparent font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
            />
            <Filter className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <select
            id="history-verdict-filter"
            value={search.filters.verdict}
            onChange={(e) => search.updateFilter({ verdict: e.target.value })}
            className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1.5 font-mono text-[10px] text-slate-300 focus:outline-none"
          >
            <option value="">All Verdicts</option>
            <option value="PASS">PASS</option>
            <option value="WARN">WARN</option>
            <option value="BLOCK">BLOCK</option>
          </select>
          <button
            id="history-export-btn"
            type="button"
            onClick={() => void auditExport.triggerExport()}
            disabled={auditExport.exporting}
            className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {auditExport.exporting ? <Activity className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Export Audit Package
          </button>
        </div>
        {auditExport.error && (
          <div className="mt-2 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[10px] text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {auditExport.error}
          </div>
        )}
        {auditExport.lastHash && (
          <div className="mt-1 font-mono text-[9px] text-slate-500">Audit hash: {auditExport.lastHash}</div>
        )}
      </div>

      {/* Live Throughput Metrics (Phase 21) */}
      <section
        id="history-throughput-panel"
        className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Live Throughput</h3>
          <span className="ml-auto rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            rolling 60s
          </span>
        </div>
        {streamError && !throughput ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {streamError}
          </div>
        ) : !throughput ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <ThroughputCard
              id="throughput-tps"
              label="Tokens / sec"
              value={throughput.tokensPerSec.toFixed(2)}
              accent="cyan"
            />
            <ThroughputCard
              id="throughput-ttft"
              label="Time-To-First-Token"
              value={throughput.ttftAvgMs !== null ? `${throughput.ttftAvgMs}ms` : '—'}
              accent="emerald"
            />
            <ThroughputCard
              id="throughput-tokens"
              label="Total Tokens (60s)"
              value={throughput.totalTokens.toLocaleString()}
              accent="violet"
            />
            <ThroughputCard
              id="throughput-samples"
              label="Traces Sampled"
              value={String(throughput.sampleCount)}
              accent="amber"
            />
          </div>
        )}
      </section>

      {/* Search Results (Phase 22) */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-violet-400" />
            <h3 className="font-display text-sm font-semibold text-slate-200">Search Results</h3>
            <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              {search.total} matches
            </span>
          </div>
        </div>
        {search.loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse" />
            ))}
          </div>
        ) : search.error ? (
          <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {search.error}
          </div>
        ) : search.results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-600">
            <Search className="h-8 w-8 mb-3 opacity-40" />
            <span className="font-mono text-xs">[NO MATCHES FOUND]</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/50">
            <table className="w-full text-left text-sm font-mono">
              <thead className="bg-slate-900/60 text-slate-400 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Trace ID</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {search.results.map((hit) => (
                  <tr key={hit.id} className="align-top hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-300">{hit.traceId}</td>
                    <td className="px-4 py-3 text-slate-300">{hit.model}</td>
                    <td className="px-4 py-3 text-slate-400 uppercase">{hit.provider}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                        hit.status === 'OK' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
                        hit.status === 'BLOCKED' || hit.status === 'ERROR' ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' :
                        'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}>
                        {hit.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-amber-400">${Number(hit.cost || 0).toFixed(6)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(hit.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3"><FeedbackButton traceId={hit.traceId} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-mono text-amber-300">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2" id="history-skeleton">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse"
            />
          ))}
        </div>
      ) : sessions.length === 0 && logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-600" id="history-empty-state">
          <Clock className="w-8 h-8 mb-3 opacity-40" />
          <span className="font-mono text-xs">[NO TRACES] · awaiting telemetry ingestion.</span>
          <span className="font-mono text-[10px] text-slate-700 mt-1">
            Window totals — in {totals.inTok.toLocaleString()} · out {totals.outTok.toLocaleString()} · {formatCost(totals.cost)}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.length > 0 && (
            <div className="bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Merged Agent Runs (Session History)</span>
                <span className="text-[10px] font-mono text-slate-500">{sessions.length} records</span>
              </div>
              {sessions.map((session) => {
                const isExpanded = expandedSession === session.pr_number;
                return (
                  <div key={session.pr_number} className="border-b border-slate-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedSession(isExpanded ? null : session.pr_number)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-900/40 transition-colors cursor-pointer flex items-center gap-3"
                    >
                      <span className="text-slate-500">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-300 font-semibold truncate">{session.pr_title || `PR #${session.pr_number}`}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-500">#{session.pr_number}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-mono text-slate-500 truncate">{session.github_sha}</span>
                          <span className="text-[10px] font-mono text-slate-600">
                            {session.merged_at ? new Date(session.merged_at).toLocaleString() : '—'}
                          </span>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pl-10 space-y-2">
                        {session.pr_body && (
                          <div className="text-[11px] text-slate-400 bg-slate-950/60 rounded p-2 border border-slate-800">
                            {session.pr_body}
                          </div>
                        )}
                        {session.struggles_encountered && session.struggles_encountered.length > 0 && (
                          <div className="text-[11px] text-amber-400">
                            <span className="font-bold">Struggles: </span>
                            {session.struggles_encountered.join(', ')}
                          </div>
                        )}
                        {session.lesson_learned && (
                          <div className="text-[11px] text-cyan-400">
                            <span className="font-bold">Lesson: </span>
                            {session.lesson_learned}
                          </div>
                        )}
                        {session.diff_summary && (
                          <pre className="text-[10px] text-slate-400 bg-slate-950 rounded p-2 border border-slate-800 whitespace-pre-wrap">{session.diff_summary}</pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {logs.length > 0 && (
            <div className="bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Telemetry Ingestion Logs</span>
                <span className="text-[10px] font-mono text-slate-500">{logs.length} records</span>
              </div>
              {logs.map((log) => {
                const isExpanded = expandedLog === log.id;
                const traceId = `tr-${log.timestamp ? log.timestamp.replace(/[^0-9]/g, '').slice(-10) : String(log.id)}`;
                return (
                  <div key={log.id} className="border-b border-slate-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-900/40 transition-colors cursor-pointer flex items-center gap-3"
                    >
                      {getStatusIcon(log.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-300 font-semibold">{log.model_name || log.model}</span>
                          <span className="text-[10px] font-mono text-slate-500 truncate">{log.project_name || 'kilo-fuel-gauge'}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400">
                            {formatCost(log.calculated_cost || log.cost)}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400">
                            {formatTokens(log.input_tokens, log.output_tokens)}
                          </span>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pl-10 space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-slate-900/60 border border-slate-800 p-2 rounded">
                            <div className="text-[10px] font-mono text-slate-500 uppercase">Trace ID</div>
                            <div className="text-[11px] font-mono font-bold text-emerald-400 mt-1 break-all select-all">{traceId}</div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(traceId);
                                setCopiedTraceId(traceId);
                                setTimeout(() => setCopiedTraceId(null), 2000);
                              }}
                              className="text-[9px] font-mono text-slate-500 hover:text-slate-300 mt-1 cursor-pointer"
                            >
                              {copiedTraceId === traceId ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-800 p-2 rounded">
                            <div className="text-[10px] font-mono text-slate-500 uppercase">Provider</div>
                            <div className="text-[11px] font-mono font-bold text-slate-100 mt-1 uppercase">{log.provider || 'unknown'}</div>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-800 p-2 rounded">
                            <div className="text-[10px] font-mono text-slate-500 uppercase">Status</div>
                            <div className="text-[11px] font-mono font-bold text-slate-100 mt-1">{log.status || '—'}</div>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-800 p-2 rounded">
                            <div className="text-[10px] font-mono text-slate-500 uppercase">Cost</div>
                            <div className="text-[11px] font-mono font-bold text-amber-400 mt-1">{formatCost(log.calculated_cost || log.cost)}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-900/60 border border-slate-800 p-2 rounded">
                            <div className="text-[10px] font-mono text-slate-500 uppercase">Input Tokens</div>
                            <div className="text-[11px] font-mono font-bold text-slate-100 mt-1">{(log.input_tokens || 0).toLocaleString()}</div>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-800 p-2 rounded">
                            <div className="text-[10px] font-mono text-slate-500 uppercase">Output Tokens</div>
                            <div className="text-[11px] font-mono font-bold text-slate-100 mt-1">{(log.output_tokens || 0).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThroughputCard({
  id,
  label,
  value,
  accent
}: {
  id: string;
  label: string;
  value: string;
  accent: 'cyan' | 'emerald' | 'violet' | 'amber';
}) {
  const accentMap: Record<typeof accent, string> = {
    cyan: 'text-cyan-300',
    emerald: 'text-emerald-300',
    violet: 'text-violet-300',
    amber: 'text-amber-300'
  };
  return (
    <div
      id={id}
      className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
    >
      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl font-bold ${accentMap[accent]}`}>
        {value}
      </div>
    </div>
  );
}

function StreamModeBadge({
  mode,
  paused,
  onTogglePause,
  onReconnect
}: {
  mode: StreamMode;
  paused: boolean;
  onTogglePause: () => void;
  onReconnect: () => void;
}) {
  const effective = paused ? 'DISCONNECTED' : mode;
  const config = {
    SSE: {
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      label: 'STREAM · SSE',
      icon: <Radio className="h-3 w-3 animate-pulse" />
    },
    POLLING: {
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      label: 'STREAM · POLL',
      icon: <Wifi className="h-3 w-3" />
    },
    DISCONNECTED: {
      color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
      label: paused ? 'STREAM · PAUSED' : 'STREAM · OFFLINE',
      icon: <WifiOff className="h-3 w-3" />
    }
  }[effective];
  return (
    <div className="flex items-center gap-1.5">
      <button
        id="stream-mode-badge"
        type="button"
        onClick={onReconnect}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${config.color}`}
        title="Reconnect stream"
      >
        {config.icon}
        {config.label}
      </button>
      <button
        id="stream-pause-toggle"
        type="button"
        onClick={onTogglePause}
        className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-300 hover:text-cyan-300"
        title={paused ? 'Resume stream' : 'Pause stream'}
      >
        <Timer className="h-3 w-3" />
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
}
