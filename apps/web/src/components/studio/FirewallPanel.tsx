import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BadgeCheck,
  ShieldX,
  Activity,
  ToggleLeft,
  ToggleRight,
  Ban,
  Zap,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import { useEventStream } from '../../hooks/useEventStream';
import { useCommandDispatcher } from '../../store/commandDispatcher';
import { useControlTowerStore } from '../../store/useControlTowerStore';
import { apiGet, apiPost } from '../../lib/apiClient';

function UpstashQuotaHealthCard() {
  const { groqMetrics } = useControlTowerStore();
  const errorCount = groqMetrics.filter((m) => m.status !== 'OK').length;
  const isQuotaSuspected = errorCount > 5 || groqMetrics.length > 450_000;

  const cooldownRemaining = isQuotaSuspected ? Math.max(0, Math.ceil((30 * 60 * 1000) / 1000)) : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="upstash-quota-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`h-3.5 w-3.5 ${isQuotaSuspected ? 'text-rose-400' : 'text-emerald-400'}`} />
          <h3 className="font-display text-xs font-semibold text-slate-200">Upstash Quota Health</h3>
        </div>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
          isQuotaSuspected
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
        }`}>
          {isQuotaSuspected ? 'QUOTA SUSPECTED' : 'HEALTHY'}
        </span>
      </div>

      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-slate-800/30 p-2">
            <div className="text-[7px] font-mono text-slate-500 uppercase">Requests</div>
            <div className="font-mono text-xs text-slate-200">{groqMetrics.length.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-slate-800/30 p-2">
            <div className="text-[7px] font-mono text-slate-500 uppercase">Circuit State</div>
            <div className={`font-mono text-xs font-bold ${isQuotaSuspected ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isQuotaSuspected ? 'ENGAGED' : 'READY'}
            </div>
          </div>
        </div>

        {isQuotaSuspected && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2">
            <div className="flex items-center justify-between text-[8px] font-mono">
              <span className="text-rose-300">Cooldown (est.)</span>
              <span className="text-rose-300">{cooldownRemaining}s remaining</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-rose-500 animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TriageItem {
  id: number;
  payload: unknown;
  violation_reason: string;
  timestamp: string;
}

interface CircuitBreakerStatus {
  providerId: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastEventAt: string | null;
  overridden: boolean;
}

let agentKeyPair: CryptoKeyPair | null = null;
let cachedAgentId = '';

async function ensureAgentIdentity(): Promise<{ keypair: CryptoKeyPair; agentId: string }> {
  if (agentKeyPair && cachedAgentId) return { keypair: agentKeyPair, agentId: cachedAgentId };
  const kp = (await crypto.subtle.generateKey('Ed25519', false, [
    'sign',
    'verify'
  ])) as CryptoKeyPair;
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const agentId = `partner-${Array.from(rawPub.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
  agentKeyPair = kp;
  cachedAgentId = agentId;
  return { keypair: kp, agentId };
}

async function signTrace(traceId: string, valueScore: number) {
  const { keypair: kp, agentId } = await ensureAgentIdentity();
  const canonical = JSON.stringify({ trace_id: traceId, value_score: valueScore });
  const sig = await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(canonical));
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  let bin = '';
  spki.forEach((b) => (bin += String.fromCharCode(b)));
  const pem = `-----BEGIN PUBLIC KEY-----\n${btoa(bin)}\n-----END PUBLIC KEY-----`;
  const passNow = Date.now();
  const passSig = await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(`${agentId}:${passNow}`));
  let passBin = '';
  new Uint8Array(passSig).forEach((b) => (passBin += String.fromCharCode(b)));
  const agentPass = btoa(JSON.stringify({ agentId, issuedAt: passNow, signature: btoa(passBin) }));
  return {
    agent_id: agentId,
    signature: btoa(String.fromCharCode(...new Uint8Array(sig))),
    signed_payload: canonical,
    public_key: pem,
    agent_pass: agentPass
  };
}

function formatPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function CircuitBreakerStatusCard() {
  const [breakers, setBreakers] = useState<CircuitBreakerStatus[]>([
    { providerId: 'groq', state: 'CLOSED', failureCount: 0, lastEventAt: null, overridden: false },
    { providerId: 'anthropic', state: 'CLOSED', failureCount: 0, lastEventAt: null, overridden: false },
    { providerId: 'openai', state: 'CLOSED', failureCount: 0, lastEventAt: null, overridden: false }
  ]);
  const [toggling, setToggling] = useState<string | null>(null);

  const toggleOverride = useCallback((providerId: string) => {
    setBreakers((prev) =>
      prev.map((b) =>
        b.providerId === providerId ? { ...b, overridden: !b.overridden, state: b.overridden ? b.failureCount >= 3 ? 'OPEN' : 'CLOSED' : 'CLOSED' as const, failureCount: b.overridden ? b.failureCount : 0 } : b
      )
    );
    setToggling(providerId);
    setTimeout(() => setToggling(null), 500);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="circuit-breaker-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Circuit Breaker Status</h3>
        </div>
        <span className="font-mono text-[10px] text-slate-500">Provider Failover Gate</span>
      </div>

      <div className="space-y-3 p-4">
        {breakers.map((breaker) => (
          <div key={breaker.providerId} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`h-3.5 w-3.5 ${
                  breaker.state === 'CLOSED' ? 'text-emerald-400' :
                  breaker.state === 'HALF_OPEN' ? 'text-amber-400' : 'text-rose-400'
                }`} />
                <span className="font-mono text-xs text-slate-300 uppercase">{breaker.providerId}</span>
              </div>
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                breaker.state === 'CLOSED'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : breaker.state === 'HALF_OPEN'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
              }`}>
                {breaker.state.replace('_', ' ')}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>Failures: {breaker.failureCount}</span>
              <button
                type="button"
                onClick={() => toggleOverride(breaker.providerId)}
                disabled={toggling === breaker.providerId}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1 text-[10px] hover:border-slate-500 transition-colors disabled:opacity-50"
                style={{ minHeight: 32 }}
              >
                {breaker.overridden ? (
                  <>
                    <ToggleRight className="h-3 w-3 text-rose-400" />
                    <span className="text-rose-400">Forced Open</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-3 w-3 text-slate-400" />
                    <span className="text-slate-400">Auto</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RateLimitStatusCard() {
  const { groqMetrics } = useControlTowerStore();
  const recentErrors = groqMetrics.filter((m) => m.status !== 'OK').slice(0, 5);
  const errorRate = groqMetrics.length > 0
    ? Math.round((recentErrors.length / groqMetrics.length) * 100)
    : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="rate-limit-card">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Rate Limit Monitor</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${
          errorRate > 10 ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' :
          errorRate > 5 ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
        }`}>{errorRate}% errors</span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="rounded-lg bg-slate-800/30 p-2">
            <div className="text-[8px] font-mono text-slate-500 uppercase">Total</div>
            <div className="font-mono text-sm text-slate-200">{groqMetrics.length}</div>
          </div>
          <div className="rounded-lg bg-slate-800/30 p-2">
            <div className="text-[8px] font-mono text-slate-500 uppercase">Errors</div>
            <div className="font-mono text-sm text-rose-400">{recentErrors.length}</div>
          </div>
          <div className="rounded-lg bg-slate-800/30 p-2">
            <div className="text-[8px] font-mono text-slate-500 uppercase">OK</div>
            <div className="font-mono text-sm text-emerald-400">{groqMetrics.length - recentErrors.length}</div>
          </div>
        </div>

        <div className="space-y-1 max-h-32 overflow-y-auto">
          {recentErrors.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded bg-slate-800/20 px-2 py-1">
              <div className="flex items-center gap-1.5">
                <Ban className="h-3 w-3 text-rose-400" />
                <span className="font-mono text-[10px] text-slate-400">{m.model}</span>
              </div>
              <span className="font-mono text-[9px] text-slate-600">{m.status} · {m.latencyMs}ms</span>
            </div>
          ))}
          {recentErrors.length === 0 && (
            <div className="text-center py-3 text-[10px] font-mono text-slate-600">
              No recent errors
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TelemetryFeed({
  items,
  onVerify,
  verifying,
  verifiedIds
}: {
  items: TriageItem[];
  onVerify: (item: TriageItem) => void;
  verifying: number | null;
  verifiedIds: Set<number>;
}) {
  return (
    <div
      id="telemetry-feed-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <ShieldX className="h-4 w-4 text-cyan-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Live Interceptor Triage</h3>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[10px] text-slate-400">
          {items.length} captured
        </span>
      </div>

      <div className="max-h-[360px] overflow-y-auto overflow-x-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-600">
            <ShieldX className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No intercepted payloads. Firewall is clear.</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-900/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {verifiedIds.has(item.id) ? (
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-400">
                        VERIFIED
                      </span>
                    ) : (
                      <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-rose-400">
                        BLOCKED
                      </span>
                    )}
                    <span className="truncate font-mono text-xs text-slate-300">#{item.id}</span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{item.timestamp}</span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-rose-300/90">{item.violation_reason}</p>
                  <pre className="mt-2 max-h-20 overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
                    {formatPayload(item.payload)}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => onVerify(item)}
                  disabled={verifying === item.id}
                  className="mt-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-40"
                  title="Cryptographically sign & verify this trace"
                >
                  <BadgeCheck className={`h-3.5 w-3.5 ${verifying === item.id ? 'animate-spin' : ''}`} />
                  {verifying === item.id ? 'Signing…' : 'Verify'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FirewallPanel() {
  const _mountedRef = useRef(true);
  const stream = useEventStream();

  const [triage, setTriage] = useState<TriageItem[]>([]);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<number | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Set<number>>(new Set());

  const loadTriage = useCallback(async () => {
    try {
      const data = await apiGet<TriageItem[]>('/api/interceptor/triage');
      if (!_mountedRef.current) return;
      setTriage(Array.isArray(data) ? data.slice(0, 25) : []);
      setTriageError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setTriageError(e instanceof Error ? e.message : 'Triage fetch failed');
    }
  }, []);

  const handleVerify = useCallback(
    async (item: TriageItem) => {
      const traceId = item.payload && typeof item.payload === 'object'
        ? (item.payload as Record<string, unknown>).trace_id
        : `triage-${item.id}`;
      const effectiveTraceId = String(traceId || `triage-${item.id}`);
      const valueScore = 50 + (item.id % 50);
      setVerifying(item.id);
      setVerifyError(null);

      const { enqueue, setState: dispatchSetState } = useCommandDispatcher.getState();
      const cmdId = enqueue({
        kind: 'VERIFY_TRACE',
        label: 'Verify Trace',
        description: `Trace #${item.id} — ${effectiveTraceId}`
      });
      dispatchSetState(cmdId, 'PROCESSING', 'Re-validating through interceptor…');

      try {
        const proof = await signTrace(effectiveTraceId, valueScore);
        const result = await apiPost<{ success: boolean; verified: boolean }>('/api/interceptor/verify', {
          trace_id: effectiveTraceId,
          agent_id: proof.agent_id,
          agent_pass: proof.agent_pass,
          signature: proof.signature,
          signed_payload: proof.signed_payload,
          public_key: proof.public_key,
          value_score: valueScore,
          note: `Partner verified triage #${item.id}`
        });
        if (!_mountedRef.current) return;

        if (result.success && result.verified) {
          setVerifiedIds((prev) => new Set(prev).add(item.id));
          dispatchSetState(cmdId, 'SUCCESS', `trace #${item.id} verified`);
        } else {
          dispatchSetState(cmdId, 'FAILED', 'interceptor rejected verification');
        }
      } catch (e) {
        if (!_mountedRef.current) return;
        const message = e instanceof Error ? e.message : 'Verification failed';
        setVerifyError(message);
        dispatchSetState(cmdId, 'FAILED', message);
      } finally {
        if (_mountedRef.current) setVerifying(null);
      }
    },
    []
  );

  useEffect(() => {
    _mountedRef.current = true;
    void loadTriage();

    const offTriage = stream.on('triage', () => {
      void loadTriage();
    });

    const pollId = setInterval(() => {
      if (_mountedRef.current) void loadTriage();
    }, 10_000);

    return () => {
      _mountedRef.current = false;
      offTriage();
      clearInterval(pollId);
    };
  }, [stream.on, loadTriage]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <TelemetryFeed
          items={triage}
          onVerify={handleVerify}
          verifying={verifying}
          verifiedIds={verifiedIds}
        />
      </div>

      <div className="space-y-5">
        <CircuitBreakerStatusCard />
        <RateLimitStatusCard />
        <UpstashQuotaHealthCard />
      </div>

      {triageError && (
        <div className="lg:col-span-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
          <ShieldX className="h-4 w-4" />
          Triage: {triageError}
        </div>
      )}

      {verifyError && (
        <div className="lg:col-span-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-mono text-rose-300">
          <BadgeCheck className="h-4 w-4" />
          Verify: {verifyError}
        </div>
      )}
    </div>
  );
}

export default FirewallPanel;
