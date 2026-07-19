import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Brain,
  CircleDot,
  Clock,
  Cpu,
  Database,
  Gauge,
  MemoryStick,
  Radio,
  RefreshCw,
  ScrollText,
  ShieldX,
  Signal,
  Terminal,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useInterval } from '../hooks/useInterval';
import { useEventStream } from '../hooks/useEventStream';
import { GovernanceToastStack, HermesSuggestion } from '../components/GovernanceToast';
import { apiGet, apiPost, apiUrl } from '../lib/apiClient';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service?: string;
  phase?: string;
  uptime_sec?: number;
  timestamp?: string;
  dependencies?: { ingestion_db?: string; vector_memory?: string };
}

interface TriageItem {
  id: number;
  payload: unknown;
  violation_reason: string;
  timestamp: string;
}

interface MemoryRecall {
  trace_id: string;
  thought_summary: string;
  reasoning: string;
  model: string;
  similarity: number;
}

interface UserMemory {
  id: number;
  agent_id: string | null;
  thought_summary: string;
  reasoning: string;
  model: string;
  created_at: string | null;
}

interface MemoryResponse {
  query?: string;
  count: number;
  memories: MemoryRecall[];
}

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

interface HealthCheckResponse {
  uptime_sec: number;
  community_value_score: string;
  alerts: Array<{ timestamp?: number; severity?: string; message?: string }>;
}

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

// --- Phase 6: client-side cryptographic signing (Ed25519 via Web Crypto) ---
// The Partner Portal signs the trace with the agent's key pair before submitting
// the "Verify" governance action. The backend verifies the signature (proving
// possession of the private key) before recording the GOVERNANCE_ACTION.

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
  // Export the public key as SPKI/DER and wrap it in PEM so the Node backend
  // (crypto.verify with `null` algorithm) can load it directly.
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

function StatusDot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {live && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex rounded-full h-3 w-3 ${
          live ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]' : 'bg-rose-500'
        }`}
      />
    </span>
  );
}

function formatUptime(sec?: number): string {
  if (!sec) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function HealthPanel({
  health,
  loading,
  error
}: {
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const live = health?.status === 'ok' || health?.status === 'degraded';
  const degraded = health?.status === 'degraded';

  return (
    <div
      id="system-health-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
            System Health
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot live={live} />
          <span
            className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
              live ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {loading ? 'Probing…' : live ? (degraded ? 'Degraded' : 'Live') : 'Offline'}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border ${
            live
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {live ? <Wifi className="h-9 w-9" /> : <WifiOff className="h-9 w-9" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-3xl font-bold ${
                live ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {live ? '100' : '000'}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 100 service score</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">
            {live
              ? `Control Tower online · ${health?.service ?? 'kudbee'}`
              : 'No heartbeat received from backend. Check CORS / REACT_APP_API_URL.'}
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <DependencyBadge
              label="Ingestion DB"
              state={health?.dependencies?.ingestion_db ?? (live ? 'healthy' : 'unknown')}
            />
            <DependencyBadge
              label="Vector Memory"
              state={health?.dependencies?.vector_memory ?? (live ? 'healthy' : 'unknown')}
            />
          </div>
        </div>
      </div>

      {health?.uptime_sec !== undefined && (
        <div className="mt-4 flex items-center gap-2 border-t border-slate-800/60 pt-3 text-[11px] font-mono text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Uptime {formatUptime(health.uptime_sec)}
          <span className="ml-auto">{health.timestamp}</span>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-mono text-rose-300">
          <span className="line-clamp-2">{error}</span>
        </div>
      )}
    </div>
  );
}

function DependencyBadge({ label, state }: { label: string; state: string }) {
  const ok = state === 'healthy';
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide ${
        ok
          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
          : 'border-rose-500/20 bg-rose-500/5 text-rose-400'
      }`}
    >
      <CircleDot className="h-3 w-3" />
      {label}
      <span className="ml-auto opacity-70">{ok ? 'OK' : state}</span>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4 text-emerald-500/70" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-2 font-mono text-2xl text-slate-100">
        {value}
        {suffix && <span className="ml-1 text-base text-emerald-500/50">{suffix}</span>}
      </div>
    </div>
  );
}

function TelemetryFeed({
  items,
  onVerify,
  verifying
}: {
  items: TriageItem[];
  onVerify: (item: TriageItem) => void;
  verifying: number | null;
}) {
  return (
    <div
      id="telemetry-feed-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-cyan-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Live Interceptor Triage</h3>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[10px] text-slate-400">
          {items.length} captured
        </span>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
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
                    <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-rose-400">
                      BLOCKED
                    </span>
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

function MiniBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const hue = pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full ${hue} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MemoryInsights({ memories }: { memories: MemoryRecall[] }) {
  return (
    <div
      id="memory-insights-card"
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Recent Memory Recalls</h3>
        </div>
        <span className="font-mono text-[10px] text-slate-500">vector · cosine</span>
      </div>

      <div className="space-y-3 p-5">
        {memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-600">
            <MemoryStick className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">Semantic memory store is empty.</span>
          </div>
        ) : (
          memories.map((m) => (
            <div
              key={m.trace_id}
              className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-violet-300">{m.model}</span>
                <span className="shrink-0 font-mono text-[10px] text-slate-500">
                  {(m.similarity * 100).toFixed(1)}% match
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-300">{m.thought_summary || m.reasoning}</p>
              <div className="mt-2">
                <MiniBar value={m.similarity} />
              </div>
              <p className="mt-1.5 truncate font-mono text-[9px] text-slate-600">trace {m.trace_id}</p>
            </div>
          ))
        )}
      </div>
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

      <div className="max-h-[360px] space-y-2 overflow-y-auto p-4">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-600">
            <BadgeCheck className="h-8 w-8 opacity-40" />
            <span className="font-mono text-xs">No verified actions yet. Use Verify to sign off a trace.</span>
          </div>
        ) : (
          actions.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-emerald-500/15 bg-slate-950/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate font-mono text-xs text-emerald-300">{a.agent_id}</span>
                </div>
                <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-400">
                  VERIFIED
                </span>
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
          ))
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

function SystemStatusCard({ data, loading, error }: { data: HealthCheckResponse | null; loading: boolean; error: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500">
          <Activity className="h-4 w-4 text-amber-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">System Status</span>
        </div>
        {loading && <span className="text-[10px] font-mono text-slate-500">Loading…</span>}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Uptime</div>
          <div className="mt-1 font-mono text-xl text-slate-100">
            {data ? formatUptime(data.uptime_sec) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Community Value</div>
          <div className="mt-1 font-mono text-xl text-slate-100">
            {data ? Number(data.community_value_score).toFixed(2) : '—'}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">Recent Alerts</span>
        </div>
        <div className="mt-2 max-h-[140px] space-y-1.5 overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-mono text-rose-300">
              {error}
            </div>
          )}
          {!error && !data && (
            <div className="text-[11px] font-mono text-slate-600">No alert data available.</div>
          )}
          {data && data.alerts.length === 0 && (
            <div className="text-[11px] font-mono text-slate-600">No alerts in the last 5 entries.</div>
          )}
          {data && data.alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`rounded-lg border px-3 py-2 text-[11px] font-mono ${
                alert.severity === 'CRITICAL'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold uppercase">{alert.severity ?? 'INFO'}</span>
                <span className="text-[9px] opacity-70">
                  {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
              <p className="mt-1 line-clamp-2">{alert.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TerminalContext {
  live: boolean;
  health: string;
  hermes: number;
  governance: number;
  communityValue: number;
}

function AgentTerminal({
  data,
  loading,
  error,
  live,
  thinking,
  context
}: {
  data: SessionHistoryItem[];
  loading: boolean;
  error: string | null;
  live?: boolean;
  thinking?: boolean;
  context?: TerminalContext;
}) {
  const [commands, setCommands] = useState<{ id: number; text: string; output?: string }[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content whenever data or local commands change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data, commands, error]);

  // Interactive command handling — queries live dashboard context and prints
  // real values back into the terminal instead of a no-op echo.
  const runCommand = (raw: string): string => {
    const cmd = raw.trim();
    const [name, ...rest] = cmd.toLowerCase().split(/\s+/);
    const ctx = context;
    switch (name) {
      case 'help':
        return [
          'available commands:',
          '  help            — show this help',
          '  status          — system + HERMES health',
          '  governance      — governance ledger summary',
          '  hermes          — HERMES auditor status',
          '  !recall         — show last 10 stored user memories',
          '  clear           — clear the terminal',
          '  echo <text>     — print text'
        ].join('\n');
      case 'status':
        return `system: ${ctx?.health ?? 'unknown'} · HERMES online: ${ctx?.live ? 'yes' : 'no'} · community value: ${ctx?.communityValue ?? 0} CV`;
      case 'governance':
        return `governance actions: ${ctx?.governance ?? 0} · pending HERMES suggestions: ${ctx?.hermes ?? 0}`;
      case 'hermes':
        return `HERMES auditor: ${ctx?.live ? 'ONLINE' : 'OFFLINE'} · active suggestions: ${ctx?.hermes ?? 0}`;
      case 'clear':
        setCommands([]);
        return '';
      case 'echo':
        return rest.join(' ');
      default:
        return `command not found: ${cmd} (type "help")`;
    }
  };

  // `!recall` — query the backend for the last 10 persisted user memories and
  // render them inline. Async: we push a placeholder, then replace with results.
  const runRecall = async (): Promise<void> => {
    const placeholderId = Date.now();
    setCommands((prev) => [
      ...prev,
      { id: placeholderId, text: '!recall', output: 'recalling last 10 user memories…' }
    ]);
    try {
      const data = await apiGet<{ count: number; memories: UserMemory[] }>(
        '/api/memory/recall?last=10'
      );
      const memories = data?.memories ?? [];
      const rendered =
        memories.length === 0
          ? 'no user memories stored yet.'
          : memories
              .map((m, i) => {
                const when = m.created_at ? new Date(m.created_at).toLocaleString() : '';
                const body = m.thought_summary || m.reasoning || '(empty)';
                return `#${i + 1} [${m.model}] ${when}\n    ${body}`;
              })
              .join('\n');
      setCommands((prev) =>
        prev.map((c) => (c.id === placeholderId ? { ...c, output: rendered } : c))
      );
    } catch (e) {
      setCommands((prev) =>
        prev.map((c) =>
          c.id === placeholderId
            ? { ...c, output: `recall failed: ${e instanceof Error ? e.message : 'unknown error'}` }
            : c
        )
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (text.toLowerCase() === '!recall') {
      void runRecall();
      setInput('');
      return;
    }
    const output = runCommand(text);
    setCommands((prev) => [...prev, { id: Date.now(), text, output }]);
    setInput('');
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 p-5 flex flex-col">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Thinking Pulse overlay — activates when the system enters SLOW_BRAIN
          (LLM reasoning). Pure CSS keyframe pulse simulates "AI processing". */}
      {thinking && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3">
            <span className="relative flex h-16 w-16">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500/40" />
              <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-violet-500/30" style={{ animationDelay: '300ms' }} />
              <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border border-violet-400/40 bg-slate-900/80">
                <Brain className="h-7 w-7 animate-pulse text-violet-300" />
              </span>
            </span>
            <div className="flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1">
              <Cpu className="h-3.5 w-3.5 text-violet-300" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-200">
                Slow Brain · Reasoning…
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest">Live Agent Terminal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`relative flex h-2 w-2 ${live ? '' : 'opacity-60'}`}>
            {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </span>
          <span className="text-[10px] font-mono text-slate-500">{thinking ? 'REASONING' : live ? 'ONLINE' : 'OFFLINE'}</span>
          {loading && <span className="text-[10px] font-mono text-slate-500">Loading…</span>}
        </div>
      </div>

      <div ref={scrollRef} className="mt-4 max-h-[360px] space-y-3 overflow-y-auto font-mono text-[11px] pr-1">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300">
            {error}
          </div>
        )}
        {loading && !error && data.length === 0 && commands.length === 0 && (
          <div className="text-slate-600">Loading session history…</div>
        )}
        {!loading && !error && data.length === 0 && commands.length === 0 && (
          <div className="text-slate-600">No session history available. Type a command below to interact.</div>
        )}
        {data.map((session) => (
          <div key={session.pr_number} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-emerald-300">#{session.pr_number} {session.pr_title}</span>
              <span className="shrink-0 text-[9px] text-slate-500">
                {session.merged_at ? new Date(session.merged_at).toLocaleString() : ''}
              </span>
            </div>
            <p className="mt-1 truncate text-[10px] text-slate-500">SHA: {session.github_sha.slice(0, 12)}</p>

            {session.struggles_encountered && session.struggles_encountered.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="text-[9px] font-bold uppercase tracking-widest">Struggles Encountered</span>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-300/80">
                  {session.struggles_encountered.map((struggle, idx) => (
                    <li key={idx}>{struggle}</li>
                  ))}
                </ul>
              </div>
            )}

            {session.lesson_learned && (
              <div className="mt-2 border-t border-slate-800/60 pt-2 text-[10px] text-slate-400">
                <span className="text-emerald-500/70">Lesson:</span> {session.lesson_learned}
              </div>
            )}
          </div>
        ))}

        {commands.map((cmd) => (
          <div key={cmd.id} className="text-slate-400">
            <span className="text-emerald-400">kudbee@control-tower:~$ </span>
            <span className="text-slate-200">{cmd.text}</span>
            {cmd.output !== undefined && cmd.output !== '' && (
              <pre className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-slate-500">{cmd.output}</pre>
            )}
            {cmd.output === '' && cmd.text.trim().toLowerCase() === 'clear' && (
              <div className="mt-0.5 text-slate-600">terminal cleared.</div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2 border-t border-slate-800/60 pt-3">
        <span className="font-mono text-[11px] text-emerald-400 shrink-0">kudbee@control-tower:~$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="type a command and press enter…"
          className="flex-1 bg-transparent font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
          aria-label="Agent terminal command input"
        />
      </form>
    </div>
  );
}

export function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [systemStatus, setSystemStatus] = useState<HealthCheckResponse | null>(null);
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(true);

  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [sessionHistoryError, setSessionHistoryError] = useState<string | null>(null);
  const [sessionHistoryLoading, setSessionHistoryLoading] = useState(true);

  const [triage, setTriage] = useState<TriageItem[]>([]);
  const [triageError, setTriageError] = useState<string | null>(null);

  const [memories, setMemories] = useState<MemoryRecall[]>([]);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const [governance, setGovernance] = useState<GovernanceAction[]>([]);
  const [communityValue, setCommunityValue] = useState<CommunityValue | null>(null);
  const [govError, setGovError] = useState<string | null>(null);

  const [verifying, setVerifying] = useState<number | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(0);

  // --- Real-time telemetry (SSE) ---
  const [thinking, setThinking] = useState(false);
  const [suggestions, setSuggestions] = useState<HermesSuggestion[]>([]);
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const stream = useEventStream();

  const probeHealth = useCallback(async () => {
    try {
      const data = await apiGet<HealthResponse>('/health');
      setHealth(data);
      setHealthError(null);
    } catch (e) {
      setHealth(null);
      setHealthError(e instanceof Error ? e.message : 'Health probe failed');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadTriage = useCallback(async () => {
    try {
      const data = await apiGet<TriageItem[]>('/api/interceptor/triage');
      setTriage(Array.isArray(data) ? data.slice(0, 25) : []);
      setTriageError(null);
    } catch (e) {
      setTriageError(e instanceof Error ? e.message : 'Triage fetch failed');
    }
  }, []);

  const loadMemory = useCallback(async () => {
    try {
      const data = await apiGet<MemoryResponse>(
        '/api/memory/recall?query=control%20tower%20telemetry%20health&limit=5'
      );
      setMemories(data?.memories ?? []);
      setMemoryError(null);
    } catch (e) {
      setMemoryError(e instanceof Error ? e.message : 'Memory recall failed');
    }
  }, []);

  const loadGovernance = useCallback(async () => {
    try {
      const [feed, value] = await Promise.all([
        apiGet<GovernanceAction[]>('/api/governance/feed?limit=25'),
        apiGet<CommunityValue>('/api/metrics/community-value')
      ]);
      setGovernance(Array.isArray(feed) ? feed : []);
      setCommunityValue(value);
      setGovError(null);
    } catch (e) {
      setGovError(e instanceof Error ? e.message : 'Governance fetch failed');
    }
  }, []);

  // --- Real-time telemetry: subscribe to the SSE stream (declared after the
  // loaders above so the handlers can call them directly). ---
  useEffect(() => {
    // SLOW_BRAIN enter/exit -> Thinking Pulse overlay.
    const offSlow = stream.on('slow_brain', (data: any) => {
      if (data?.state === 'start') {
        setThinking(true);
        if (thinkTimer.current) clearTimeout(thinkTimer.current);
        // Safety auto-clear in case the stop event is missed.
        thinkTimer.current = setTimeout(() => setThinking(false), 30000);
      } else if (data?.state === 'stop') {
        if (thinkTimer.current) clearTimeout(thinkTimer.current);
        setThinking(false);
      }
    });

    // HERMES audit/optimization suggestion -> top-right toast.
    const offSuggest = stream.on('hermes_suggestion', (data: any) => {
      if (!data?.id) return;
      setSuggestions((prev) =>
        prev.some((s) => s.id === data.id) ? prev : [...prev, data as HermesSuggestion]
      );
    });

    // Governance change (approve/reject) or triage -> refresh the relevant feed.
    const offGov = stream.on('governance', () => { void loadGovernance(); });
    const offTriage = stream.on('triage', () => { void loadTriage(); });

    // Initial snapshot of proposed actions from the SSE handshake.
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

    return () => {
      offSlow();
      offSuggest();
      offGov();
      offTriage();
      offSnapshot();
    };
  }, [stream.on, loadGovernance, loadTriage]);

  const loadSystemStatus = useCallback(async () => {
    try {
      const data = await apiGet<HealthCheckResponse>('/api/health-check');
      setSystemStatus(data);
      setSystemStatusError(null);
    } catch (e) {
      setSystemStatus(null);
      setSystemStatusError(e instanceof Error ? e.message : 'Health check failed');
    } finally {
      setSystemStatusLoading(false);
    }
  }, []);

  const loadSessionHistory = useCallback(async () => {
    try {
      const data = await apiGet<SessionHistoryItem[]>('/api/session-history');
      setSessionHistory(Array.isArray(data) ? data : []);
      setSessionHistoryError(null);
    } catch (e) {
      setSessionHistory([]);
      setSessionHistoryError(e instanceof Error ? e.message : 'Session history fetch failed');
    } finally {
      setSessionHistoryLoading(false);
    }
  }, []);

  const handleVerify = useCallback(
    async (item: TriageItem) => {
      const traceId = item.payload && typeof item.payload === 'object'
        ? (item.payload as Record<string, unknown>).trace_id
        : `triage-${item.id}`;
      const effectiveTraceId = String(traceId || `triage-${item.id}`);
      const valueScore = 50 + (item.id % 50); // deterministic demo value attribution
      setVerifying(item.id);
      setVerifyError(null);
      try {
        const proof = await signTrace(effectiveTraceId, valueScore);
        await apiPost('/api/interceptor/verify', {
          trace_id: effectiveTraceId,
          agent_id: proof.agent_id,
          agent_pass: proof.agent_pass,
          signature: proof.signature,
          signed_payload: proof.signed_payload,
          public_key: proof.public_key,
          value_score: valueScore,
          note: `Partner verified triage #${item.id}`
        });
        await loadGovernance();
      } catch (e) {
        setVerifyError(e instanceof Error ? e.message : 'Verification failed');
      } finally {
        setVerifying(null);
      }
    },
    [loadGovernance]
  );

  const syncAll = useCallback(async () => {
    await Promise.allSettled([
      probeHealth(),
      loadSystemStatus(),
      loadSessionHistory(),
      loadTriage(),
      loadMemory(),
      loadGovernance()
    ]);
    setLastSync(new Date());
    setPulse((p) => p + 1);
  }, [probeHealth, loadSystemStatus, loadSessionHistory, loadTriage, loadMemory, loadGovernance]);

  // Initial load on mount. Subsequent updates arrive via the SSE stream, so
  // the 5s poll is reduced to a slow safety net (every 30s) instead of the
  // primary update path.
  useEffect(() => {
    void syncAll();
  }, [syncAll]);

  useInterval(() => {
    void syncAll();
  }, 30_000);

  const live = health?.status === 'ok' || health?.status === 'degraded';

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200" id="control-tower-dashboard">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                <Cpu className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">
                  Control Tower
                </h1>
                <p className="text-xs text-slate-500">
                  Phase 6 · Partner Portal · command console &amp; on-chain governance
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <Signal
                className={`h-4 w-4 ${live ? 'text-emerald-400' : 'text-rose-400'}`}
              />
              <div className="leading-tight">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  Pulse
                </div>
                <div className="font-mono text-xs text-slate-300">
                  {lastSync ? `synced ${lastSync.toLocaleTimeString()}` : 'initializing…'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void syncAll()}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-mono font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pulse > 0 ? 'animate-spin' : ''}`} />
              Manual Pulse
            </button>
          </div>
        </header>

        {/* Main control grid — consistent 3-column responsive layout.
            Every top-level card sits in the same 3-col grid so heights align;
            the Live Agent Terminal spans the full width below. */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HealthPanel health={health} loading={healthLoading} error={healthError} />
          </div>
          <CommunityValueScore data={communityValue} />

          <SystemStatusCard data={systemStatus} loading={systemStatusLoading} error={systemStatusError} />
          <TelemetryFeed items={triage} onVerify={handleVerify} verifying={verifying} />
          <MemoryInsights memories={memories} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-2">
            <MetricCard icon={BadgeCheck} label="Verified Traces" value={communityValue?.verified_traces ?? 0} suffix="ok" />
            <MetricCard icon={Brain} label="Memory Hits" value={memories.length} suffix="vec" />
          </div>
          <GovernanceFeed actions={governance} />
        </div>

        {/* Live Agent Terminal — full-width interactive console */}
        <div className="mt-5">
          <AgentTerminal
            data={sessionHistory}
            loading={sessionHistoryLoading}
            error={sessionHistoryError}
            live={live}
            thinking={thinking}
            context={{
              live,
              health: health?.status ?? (healthError ? 'error' : 'unknown'),
              hermes: suggestions.length,
              governance: governance.length,
              communityValue: communityValue ? Number(communityValue.community_value_score) : 0
            }}
          />
        </div>


        {/* HERMES live suggestion toasts (top-right) */}
        <GovernanceToastStack
          suggestions={suggestions}
          onDismiss={dismissSuggestion}
          onApproved={dismissSuggestion}
        />

        {(triageError || memoryError || govError || verifyError || systemStatusError || sessionHistoryError) && (
          <div className="mt-5 space-y-2">
            {triageError && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
                <Activity className="h-4 w-4" />
                Triage: {triageError}
              </div>
            )}
            {memoryError && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
                <Brain className="h-4 w-4" />
                Memory: {memoryError}
              </div>
            )}
            {govError && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300">
                <ScrollText className="h-4 w-4" />
                Governance: {govError}
              </div>
            )}
            {verifyError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-mono text-rose-300">
                <BadgeCheck className="h-4 w-4" />
                Verify: {verifyError}
              </div>
            )}
            {systemStatusError && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[10px] font-mono text-amber-300">
                <Activity className="h-4 w-4 shrink-0" />
                <span className="truncate">System Status: {systemStatusError}</span>
              </div>
            )}
            {sessionHistoryError && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[10px] font-mono text-amber-300">
                <Terminal className="h-4 w-4 shrink-0" />
                <span className="truncate">Session History: {sessionHistoryError}</span>
              </div>
            )}
          </div>
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-slate-800/60 pt-5 text-[10px] font-mono text-slate-600">
          <span>Kudbee Control Tower · live SSE {stream.connected ? 'connected' : 'connecting…'} · 30s safety poll</span>
          <span>{apiUrl('/health')}</span>
        </footer>
      </div>
    </div>
  );
}

export default DashboardPage;
