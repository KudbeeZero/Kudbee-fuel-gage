import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BadgeCheck,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Gauge,
  Clock,
} from 'lucide-react';
import { useGovernanceStream } from '../../hooks/useGovernanceStream';
import { useThinkGovernanceStream } from '../../hooks/useThinkGovernanceStream';
import { useEventStream } from '../../hooks/useEventStream';
import { useCommandDispatcher } from '../../store/commandDispatcher';
import { useControlTowerStore } from '../../store/useControlTowerStore';
import { GovernanceToastStack, type HermesSuggestion } from '../../components/GovernanceToast';
import { ApprovalQueueTray } from '../../components/ApprovalQueueTray';
import { GovernanceQueueTray } from '../../components/governance/GovernanceQueueTray';
import { apiGet, apiPost } from '../../lib/apiClient';
import type { ApprovalDecision, ThinkTrajectory } from '@kudbee/types';

interface GovernanceAction {
  id: number;
  trace_id: string;
  action: string;
  type: string;
  agent_id: string;
  signature: string;
  signed_payload: string;
  value_score: number;
  note?: string | null;
  timestamp: string;
}

interface CommunityValue {
  community_value_score: number;
  verified_traces: number;
  governance_actions: number;
}

interface TriageItem {
  id: number;
  payload: unknown;
  violation_reason: string;
  timestamp: string;
}

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

function computeRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'LOW';
  if (score >= 50) return 'MEDIUM';
  return 'HIGH';
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, string> = {
    LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    HIGH: 'border-rose-500/30 bg-rose-500/10 text-rose-400'
  };
  const icons: Record<RiskLevel, typeof ShieldCheck> = {
    LOW: ShieldCheck,
    MEDIUM: ShieldAlert,
    HIGH: ShieldX
  };
  const Icon = icons[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${styles[level]}`}>
      <Icon className="h-3 w-3" />
      {level}
    </span>
  );
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

function MiniBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const hue = pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full ${hue} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function GovernanceFeed({ actions }: { actions: GovernanceAction[] }) {
  return (
    <div
      id="governance-feed-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-emerald-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Governance Feed</h3>
        </div>
        <span className="font-mono text-[10px] text-slate-500">signed · on-chain</span>
      </div>

      <div className="max-h-[360px] space-y-2 overflow-y-auto overflow-x-hidden p-4">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-600">
            <BadgeCheck className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No verified actions yet. Use Verify to sign off a trace.</span>
          </div>
        ) : (
          actions.map((a) => {
            const risk = computeRiskLevel(a.value_score);
            return (
              <div
                key={a.id}
                className="rounded-xl border border-emerald-500/15 bg-slate-950/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className="truncate font-mono text-xs text-emerald-300">{a.agent_id}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RiskBadge level={risk} />
                    <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-400">
                      VERIFIED
                    </span>
                  </div>
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                  trace {a.trace_id}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <MiniBar value={a.value_score / 100} />
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">
                    {a.value_score} cv
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-[9px] text-slate-600">
                  sig {a.signature.slice(0, 24)}…
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CommunityValueScore({ data }: { data: CommunityValue | null }) {
  const score = data ? Number(data.community_value_score) : 0;
  const ringPct = Math.min(100, Math.round(score));
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (ringPct / 100) * circ;
  return (
    <div
      id="community-value-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500">
          <BadgeCheck className="h-4 w-4 text-amber-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">Community Value</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">
          {data?.governance_actions ?? 0} actions
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={radius} className="fill-none stroke-slate-800" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              className="fill-none stroke-amber-400 transition-all duration-700"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
            />
          </svg>
          <span className="absolute font-mono text-sm font-bold text-amber-300">
            {ringPct}
          </span>
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-slate-100">
            {score.toFixed(1)}
            <span className="ml-1 text-sm text-amber-500/60">CV</span>
          </div>
          <p className="text-[10px] text-slate-500">
            {data?.verified_traces ?? 0} verified traces
          </p>
        </div>
      </div>
    </div>
  );
}

function GovernanceProposalPanel() {
  const proposals = useControlTowerStore((s) => s.governanceProposals);
  const updateProposalStatus = useControlTowerStore((s) => s.updateProposalStatus);
  const pending = proposals.filter((p) => p.status === 'PENDING');

  const handleApprove = useCallback((id: string) => {
    updateProposalStatus(id, 'APPROVED');
  }, [updateProposalStatus]);

  const handleReject = useCallback((id: string) => {
    updateProposalStatus(id, 'REJECTED');
  }, [updateProposalStatus]);

  if (pending.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" id="governance-proposal-panel">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Agent Tool Proposals</h3>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] text-amber-300">
          {pending.length} pending
        </span>
      </div>

      <div className="max-h-[360px] space-y-2 overflow-y-auto p-4">
        {pending.slice(0, 10).map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-300 truncate">{p.action}</span>
                <RiskBadge level={p.riskLevel} />
              </div>
              <span className="text-[9px] font-mono text-slate-600">
                <Clock className="inline h-3 w-3 mr-0.5" />
                {new Date(p.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-slate-500 truncate">
              agent: {p.agentId} · rule: {p.triggeredRule}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApprove(p.id)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-mono font-semibold text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all"
              >
                <ShieldCheck className="h-3 w-3" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleReject(p.id)}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[10px] font-mono font-semibold text-rose-300 hover:bg-rose-500/20 active:scale-95 transition-all"
              >
                <ShieldX className="h-3 w-3" />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GovernancePanel() {
  const _mountedRef = useRef(true);
  const stream = useEventStream();
  const { pending: pendingApprovals, submitApproval } = useGovernanceStream();
  const { pending: pendingThinkTokens, promoteToken } = useThinkGovernanceStream();
  const pushProposal = useControlTowerStore((s) => s.pushGovernanceProposal);

  const [governance, setGovernance] = useState<GovernanceAction[]>([]);
  const [communityValue, setCommunityValue] = useState<CommunityValue | null>(null);
  const [govError, setGovError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<HermesSuggestion[]>([]);

  const loadGovernance = useCallback(async () => {
    try {
      const [feed, value] = await Promise.all([
        apiGet<GovernanceAction[]>('/api/governance/feed?limit=25'),
        apiGet<CommunityValue>('/api/metrics/community-value')
      ]);
      if (!_mountedRef.current) return;
      setGovernance(Array.isArray(feed) ? feed : []);
      setCommunityValue(value);
      setGovError(null);
    } catch (e) {
      if (!_mountedRef.current) return;
      setGovError(e instanceof Error ? e.message : 'Governance fetch failed');
    }
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleVerify = useCallback(
    async (item: TriageItem) => {
      const traceId = item.payload && typeof item.payload === 'object'
        ? (item.payload as Record<string, unknown>).trace_id
        : `triage-${item.id}`;
      const effectiveTraceId = String(traceId || `triage-${item.id}`);
      const valueScore = 50 + (item.id % 50);
      const risk: RiskLevel = valueScore >= 80 ? 'LOW' : valueScore >= 50 ? 'MEDIUM' : 'HIGH';
      const { enqueue, setState: dispatchSetState } = useCommandDispatcher.getState();
      const cmdId = enqueue({
        kind: 'VERIFY_TRACE',
        label: 'Verify Trace',
        description: `Trace #${item.id} — ${effectiveTraceId}`
      });
      dispatchSetState(cmdId, 'PROCESSING', 'Re-validating through interceptor…');

      pushProposal({
        agentId: `partner-${effectiveTraceId.slice(0, 8)}`,
        action: `Verify trace ${effectiveTraceId}`,
        triggeredRule: 'kudbee_propose_governance',
        riskLevel: risk,
        actionJson: { trace_id: effectiveTraceId, value_score: valueScore }
      });

      try {
        const proof = await signTrace(effectiveTraceId, valueScore);
        await apiPost<{ success: boolean; verified: boolean }>('/api/interceptor/verify', {
          trace_id: effectiveTraceId,
          agent_id: proof.agent_id,
          agent_pass: proof.agent_pass,
          signature: proof.signature,
          signed_payload: proof.signed_payload,
          public_key: proof.public_key,
          value_score: valueScore,
          note: `Partner verified triage #${item.id}`
        });
        dispatchSetState(cmdId, 'SUCCESS', `trace #${item.id} verified`);
        void loadGovernance();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Verification failed';
        dispatchSetState(cmdId, 'FAILED', message);
      }
    },
    [loadGovernance, pushProposal]
  );

  useEffect(() => {
    _mountedRef.current = true;

    void loadGovernance();

    const offGov = stream.on('governance', () => {
      void loadGovernance();
    });

    const offSuggest = stream.on('hermes_suggestion', (data: any) => {
      if (!data?.id) return;
      setSuggestions((prev) =>
        prev.some((s) => s.id === data.id) ? prev : [...prev, data as HermesSuggestion]
      );
    });

    const offSnapshot = stream.on('snapshot', (data: any) => {
      if (Array.isArray(data?.proposed)) {
        setSuggestions((prev) => {
          const incoming = (data.proposed as HermesSuggestion[])
            .filter((p) => !prev.some((s) => s.id === p.id))
            .map((p) => ({ id: p.id, action: p.action, tags: p.tags, prompt: p.prompt, detail: 'Pending proposed action' }));
          return [...prev, ...incoming];
        });
      }
    });

    const pollId = setInterval(() => {
      if (_mountedRef.current) void loadGovernance();
    }, 10_000);

    return () => {
      _mountedRef.current = false;
      offGov();
      offSuggest();
      offSnapshot();
      clearInterval(pollId);
    };
  }, [stream.on, loadGovernance]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {pendingApprovals.length > 0 && (
        <ApprovalQueueTray pending={pendingApprovals} onResolve={submitApproval} />
      )}

      {pendingThinkTokens.length > 0 && (
        <GovernanceQueueTray pending={pendingThinkTokens} onPromote={promoteToken} />
      )}

      <div className="lg:col-span-2">
        <GovernanceFeed actions={governance} />
      </div>
      <CommunityValueScore data={communityValue} />

      <div className="lg:col-span-3">
        <GovernanceProposalPanel />
      </div>

      {govError && (
        <div className="lg:col-span-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
          <ScrollText className="h-4 w-4" />
          Governance: {govError}
        </div>
      )}

      <GovernanceToastStack
        suggestions={suggestions}
        onDismiss={dismissSuggestion}
        onApproved={dismissSuggestion}
      />
    </div>
  );
}

export default GovernancePanel;
