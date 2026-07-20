import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, Shield, ShieldCheck, ShieldAlert, ShieldX, Terminal, Copy, Check } from 'lucide-react';
import { type SecurityViolation } from '@kudbee/types';

interface InterceptedRequest {
  id: string;
  timestamp: string;
  model: string;
  status: 'CLEAN' | 'PII_REDACTED' | 'BLOCKED';
  payload: string;
}

const TRIAGE_POLL_MS = 5000;
const PAYLOAD_TRUNCATION_LIMIT = 2000;
const TRUNCATION_WARNING = '\n\n...[PAYLOAD OVERSIZED - TRUNCATED FOR SECURITY]';

function truncatePayload(payload: string): string {
  if (payload.length > PAYLOAD_TRUNCATION_LIMIT) {
    return payload.slice(0, PAYLOAD_TRUNCATION_LIMIT) + TRUNCATION_WARNING;
  }
  return payload;
}

// Map a quarantined triage violation into the interceptor's request shape.
// Real data only: nothing is fabricated — when the backend has no intercepted
// payloads the list stays empty and the UI renders the clean "0 Active Signals"
// terminal state.
function violationToRequest(v: SecurityViolation): InterceptedRequest {
  return {
    id: `triage-${v.id}`,
    timestamp: v.timestamp,
    model: 'unknown',
    status: 'BLOCKED',
    payload: JSON.stringify(v.payload, null, 2)
  };
}

const STATUS_CONFIG: Record<InterceptedRequest['status'], {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: typeof ShieldCheck;
  iconColor: string;
}> = {
  CLEAN: {
    label: 'CLEAN',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: ShieldCheck,
    iconColor: 'text-emerald-400'
  },
  PII_REDACTED: {
    label: 'PII REDACTED',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: ShieldAlert,
    iconColor: 'text-amber-400'
  },
  BLOCKED: {
    label: 'BLOCKED',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    icon: ShieldX,
    iconColor: 'text-rose-400'
  }
};

export function InterceptorView({ currency, onNewLogTriggered }: { currency: 'USD' | 'EUR' | 'GBP'; onNewLogTriggered?: () => void }) {
  const [requests, setRequests] = useState<InterceptedRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadIntercepts = useCallback(async () => {
    try {
      const res = await fetch('/api/interceptor/triage', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Intercept fetch failed (${res.status})`);
      const data = (await res.json()) as SecurityViolation[];
      setRequests(Array.isArray(data) ? data.map(violationToRequest) : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load intercepted requests');
    }
  }, []);

  useEffect(() => {
    void loadIntercepts();
    const timer = setInterval(() => void loadIntercepts(), TRIAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [loadIntercepts]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? requests[0] ?? null,
    [requests, selectedId]
  );

  const handleCopy = () => {
    if (!selectedRequest) return;
    navigator.clipboard.writeText(selectedRequest.payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayPayload = selectedRequest ? truncatePayload(selectedRequest.payload) : '';
  const isTruncated = selectedRequest ? selectedRequest.payload.length > PAYLOAD_TRUNCATION_LIMIT : false;

  return (
    <div className="space-y-6" id="interceptor-view-container">
      {/* HEADER */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="font-display font-semibold text-slate-200 text-lg">Secure Interceptor Wiretap</h2>
              <p className="text-xs text-slate-500 mt-1">Master-detail inspection of intercepted AI telemetry payloads with client-side security safeguards.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.7)]"></span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Live Wiretap</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-xs font-mono text-rose-300">{error}</span>
        </div>
      )}

      {/* EMPTY STATE — trust the empty space; do not pad with fake data. */}
      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-500">
          <Terminal className="w-12 h-12 mb-4 text-emerald-400/40" />
          <div className="font-mono text-sm uppercase tracking-widest text-slate-400">
            0 Active Signals
          </div>
          <div className="mt-2 font-mono text-xs text-slate-600">
            Awaiting Telemetry · wiretap idle
          </div>
        </div>
      ) : (
        /* MASTER-DETAIL SPLIT PANE */
        <div className="flex flex-col lg:flex-row gap-6">
          {/* MASTER FEED */}
          <div className="w-full lg:w-2/5 xl:w-1/3 flex flex-col bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="font-display font-semibold text-slate-200 text-sm">Intercepted Requests</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{requests.length} captured</span>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
              {requests.map((req) => {
                const config = STATUS_CONFIG[req.status];
                const StatusIcon = config.icon;
                const isSelected = req.id === selectedId;

                return (
                  <button
                    key={req.id}
                    onClick={() => setSelectedId(req.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer active:scale-95 duration-75 ${
                      isSelected
                        ? 'border-emerald-500 bg-slate-900 shadow-[0_0_12px_rgba(52,211,153,0.15)]'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-3.5 h-3.5 ${config.iconColor}`} />
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${config.bg} ${config.color} ${config.border}`}>
                          [{config.label}]
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{req.timestamp.split('T')[1]?.split('Z')[0] ?? req.timestamp}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-300 font-semibold">{req.model}</span>
                      <span className="text-[10px] font-mono text-slate-500">{req.id}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DETAIL INSPECTOR */}
          <div className="w-full lg:w-3/5 xl:w-2/3 flex flex-col bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            {selectedRequest && (
              <>
                <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-display font-semibold text-slate-200 text-sm">Payload Inspector</h3>
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_CONFIG[selectedRequest.status].bg} ${STATUS_CONFIG[selectedRequest.status].color} ${STATUS_CONFIG[selectedRequest.status].border}`}>
                      [{STATUS_CONFIG[selectedRequest.status].label}]
                    </span>
                  </div>

                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer active:scale-95 duration-75"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">COPIED</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>COPY</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex-1 bg-slate-950/50 rounded-lg border border-slate-800 font-mono overflow-y-auto overscroll-contain p-4 scrollbar-thin scrollbar-thumb-slate-800">
                  {isTruncated && (
                    <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                        Payload Oversized - Truncated for Security
                      </span>
                    </div>
                  )}
                  <pre className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-all select-all">
                    {displayPayload}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
