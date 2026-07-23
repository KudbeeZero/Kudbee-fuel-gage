import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BadgeCheck,
  ShieldX,
} from 'lucide-react';
import { useEventStream } from '../../hooks/useEventStream';
import { useCommandDispatcher } from '../../store/commandDispatcher';
import { apiGet, apiPost } from '../../lib/apiClient';

interface TriageItem {
  id: number;
  payload: unknown;
  violation_reason: string;
  timestamp: string;
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
    <div className="grid grid-cols-1 gap-5">
      <TelemetryFeed
        items={triage}
        onVerify={handleVerify}
        verifying={verifying}
        verifiedIds={verifiedIds}
      />

      {triageError && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
          <ShieldX className="h-4 w-4" />
          Triage: {triageError}
        </div>
      )}

      {verifyError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-mono text-rose-300">
          <BadgeCheck className="h-4 w-4" />
          Verify: {verifyError}
        </div>
      )}
    </div>
  );
}

export default FirewallPanel;
