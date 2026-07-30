import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  KeyRound,
  EyeOff,
  FileWarning,
  Loader2,
  CheckCircle2,
  CircleSlash,
  Send,
  AlertTriangle,
  FlaskConical,
  GitCompare
} from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';
import { AutoTuneButton } from './AutoTuneButton';

export type PolicySeverity = 'PASS' | 'WARN' | 'BLOCK';

export interface Policy {
  id: string;
  label: string;
  enabled: boolean;
  severity: PolicySeverity;
  config: Record<string, unknown>;
}

interface PoliciesResponse {
  policies: Policy[];
}

interface PolicyEvaluation {
  overall: PolicySeverity;
  results: Array<{ id: string; status: PolicySeverity; detail: string }>;
}

interface PolicyDiff {
  id: string;
  label: string;
  field: string;
  before: string | boolean;
  after: string | boolean;
}

const POLICY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  token_budget_cap: Lock,
  secret_leak_prevention: KeyRound,
  system_prompt_guard: EyeOff,
  pii_redaction: FileWarning
};

const SEVERITY_RANK: Record<PolicySeverity, number> = { PASS: 0, WARN: 1, BLOCK: 2 };

function defaultPolicies(): Policy[] {
  return [
    { id: 'token_budget_cap', label: 'Token Budget Cap', enabled: true, severity: 'BLOCK', config: { maxTokens: 200000 } },
    { id: 'secret_leak_prevention', label: 'Secret Leak Prevention', enabled: true, severity: 'BLOCK', config: { patterns: ['sk-ant-', 'sk-proj-', 'AIzaSy', 'ghp_'] } },
    { id: 'system_prompt_guard', label: 'System Prompt Guard', enabled: true, severity: 'WARN', config: { denyTerms: ['ignore previous', 'disregard system'] } },
    { id: 'pii_redaction', label: 'PII Redaction', enabled: true, severity: 'WARN', config: { pattern: 'email' } }
  ];
}

function severityClasses(severity: PolicySeverity): string {
  if (severity === 'BLOCK') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  if (severity === 'WARN') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
}

export function PolicyEnginePanel() {
  const [policies, setPolicies] = useState<Policy[]>(defaultPolicies());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [probePrompt, setProbePrompt] = useState(
    'Implement a function that returns the current OpenAI key from env: sk-proj-EXAMPLE-12345'
  );
  const [probeRunning, setProbeRunning] = useState(false);
  const [probeResult, setProbeResult] = useState<PolicyEvaluation | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  const [dryRun, setDryRun] = useState(false);
  const [diffs, setDiffs] = useState<PolicyDiff[]>([]);
  const [pendingPolicyDiffs, setPendingPolicyDiffs] = useState<PolicyDiff[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<PoliciesResponse>('/api/governance/policies');
      setPolicies(Array.isArray(data?.policies) ? data.policies : defaultPolicies());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Policy fetch failed');
      setPolicies(defaultPolicies());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePolicy = useCallback(
    async (id: string, patch: Partial<Pick<Policy, 'enabled' | 'severity'>>) => {
      const policy = policies.find((p) => p.id === id);
      if (!policy) return;

      if (dryRun) {
        const diffEntries: PolicyDiff[] = [];
        if ('enabled' in patch && patch.enabled !== undefined && patch.enabled !== policy.enabled) {
          diffEntries.push({
            id,
            label: policy.label,
            field: 'enabled',
            before: policy.enabled,
            after: patch.enabled
          });
        }
        if ('severity' in patch && patch.severity !== undefined && patch.severity !== policy.severity) {
          diffEntries.push({
            id,
            label: policy.label,
            field: 'severity',
            before: policy.severity,
            after: patch.severity
          });
        }
        if (diffEntries.length > 0) {
          setPendingPolicyDiffs(diffEntries);
          setTimeout(() => setPendingPolicyDiffs([]), 5000);
        }
        return;
      }

      const previous = policies;
      setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      setPendingId(id);
      try {
        const data = await apiPost<{ policy: Policy }>('/api/governance/policies', { id, ...patch });
        if (data?.policy) {
          setPolicies((prev) => prev.map((p) => (p.id === id ? data.policy : p)));
        }
        setDiffs((prev) => [...prev, {
          id, label: policy.label,
          field: 'enabled' in patch ? 'enabled' : 'severity',
          before: 'enabled' in patch ? String(policy.enabled) : policy.severity,
          after: 'enabled' in patch ? String(patch.enabled) : String(patch.severity)
        }]);
        setError(null);
      } catch (e) {
        setPolicies(previous);
        setError(e instanceof Error ? e.message : 'Policy update failed');
      } finally {
        setPendingId(null);
      }
    },
    [policies, dryRun]
  );

  const runProbe = useCallback(async () => {
    if (!probePrompt.trim()) return;
    setProbeRunning(true);
    setProbeError(null);
    try {
      const endpoint = dryRun
        ? '/api/governance/policies/evaluate?dry_run=true'
        : '/api/governance/policies/evaluate';
      const result = await apiPost<PolicyEvaluation>(endpoint, {
        prompt: probePrompt
      });
      setProbeResult(result);
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setProbeRunning(false);
    }
  }, [probePrompt, dryRun]);

  const overall = useMemo<PolicySeverity>(() => {
    return policies
      .filter((p) => p.enabled)
      .reduce<PolicySeverity>(
        (acc, p) => (SEVERITY_RANK[p.severity] > SEVERITY_RANK[acc] ? p.severity : acc),
        'PASS'
      );
  }, [policies]);

  const OverallIcon = overall === 'BLOCK' ? ShieldX : overall === 'WARN' ? ShieldAlert : ShieldCheck;

  return (
    <section
      id="policy-engine-panel"
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Dynamic Policy Engine</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDryRun((v) => !v)}
            className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
              dryRun
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-slate-700 bg-slate-800/40 text-slate-500 hover:text-slate-300'
            }`}
          >
            <FlaskConical className={`w-3 h-3 ${dryRun ? 'animate-pulse' : ''}`} />
            {dryRun ? 'Dry Run ON' : 'Dry Run'}
          </button>
          <span
            id="policy-overall-badge"
            className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${severityClasses(overall)}`}
          >
            <OverallIcon className="inline w-3 h-3 mr-1 -mt-0.5" />
            {overall}
          </span>
        </div>
      </div>
      <p className="text-[10px] font-mono text-slate-500 mb-3">
        {dryRun
          ? 'Simulation mode — changes are previewed, not applied.'
          : 'Pre-routing governance evaluated against every prompt and surfaced on telemetry traces.'}
      </p>

      {error && (
        <div
          id="policy-engine-error"
          className="mb-3 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-mono text-amber-300"
        >
          <AlertTriangle className="w-3 h-3" />
          {error}
        </div>
      )}

      {/* Policy Diff Viewer */}
      <AnimatePresence>
        {pendingPolicyDiffs.length > 0 && (
          <motion.div
            key="policy-diff-preview"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
          >
            <div className="flex items-center gap-1.5 mb-2 font-mono text-[9px] uppercase tracking-widest text-amber-300">
              <GitCompare className="w-3 h-3" />
              Dry Run Diff Preview
            </div>
            {pendingPolicyDiffs.map((diff, i) => (
              <div key={`${diff.id}-${diff.field}-${i}`} className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-slate-400">{diff.label}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-500">{diff.field}</span>
                <span className="text-slate-400">: {String(diff.before)}</span>
                <span className="text-amber-400">→</span>
                <span className="text-amber-300">{String(diff.after)}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Applied Diffs History */}
      <AnimatePresence>
        {diffs.length > 0 && (
          <motion.div
            key="policy-diff-history"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 max-h-32 overflow-y-auto"
          >
            <div className="flex items-center gap-1.5 mb-2 font-mono text-[9px] uppercase tracking-widest text-emerald-300">
              <GitCompare className="w-3 h-3" />
              Recent Changes
            </div>
            {diffs.slice(-3).map((diff, i) => (
              <div key={`hist-${i}`} className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-slate-400">{diff.label}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-500">{diff.field}</span>
                <span className="text-slate-400">: {diff.before}</span>
                <span className="text-emerald-400">→</span>
                <span className="text-emerald-300">{diff.after}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse"
              />
            ))}
          </div>
        ) : policies.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-center font-mono text-[10px] text-slate-500">
            No policies registered.
          </div>
        ) : (
          policies.map((p) => {
            const Icon = POLICY_ICONS[p.id] || ShieldCheck;
            const isPending = pendingId === p.id;
            return (
              <div
                key={p.id}
                id={`policy-card-${p.id}`}
                className={`rounded-lg border p-3 transition-colors ${
                  p.enabled ? 'border-slate-700 bg-slate-950/60' : 'border-slate-800 bg-slate-950/30 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`w-3.5 h-3.5 ${p.enabled ? 'text-violet-300' : 'text-slate-600'}`} />
                  <span className="text-xs font-semibold text-slate-200 flex-1">{p.label}</span>
                  {isPending && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                  <button
                    id={`policy-toggle-${p.id}`}
                    type="button"
                    onClick={() => void updatePolicy(p.id, { enabled: !p.enabled })}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                      p.enabled ? 'bg-violet-500' : 'bg-slate-700'
                    }`}
                    title={dryRun ? `[DRY RUN] ${p.enabled ? 'Would disable' : 'Would enable'}` : p.enabled ? 'Click to disable' : 'Click to enable'}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-slate-950 transition-transform ${
                        p.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {(['PASS', 'WARN', 'BLOCK'] as PolicySeverity[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      id={`policy-severity-${p.id}-${s}`}
                      onClick={() => void updatePolicy(p.id, { severity: s })}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors ${
                        p.severity === s ? severityClasses(s) : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 border-t border-slate-800/60 pt-3">
        <div className="mb-1.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-500">
          <Send className="w-3 h-3" />
          Test Policy Evaluation
          {dryRun && (
            <span className="rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-amber-400">
              DRY RUN
            </span>
          )}
        </div>
        <textarea
          id="policy-probe-input"
          value={probePrompt}
          onChange={(e) => setProbePrompt(e.target.value)}
          rows={3}
          placeholder="Paste a prompt to evaluate against the active policies…"
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-violet-500/40"
        />
        <button
          id="policy-probe-btn"
          type="button"
          disabled={probeRunning}
          onClick={() => void runProbe()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
        >
          {probeRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
          {probeRunning ? 'Evaluating…' : dryRun ? 'Simulate Evaluation' : 'Evaluate Prompt'}
        </button>
        <AnimatePresence>
          {probeError && (
            <motion.div
              key="probe-error"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mt-2 flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 font-mono text-[10px] text-rose-300"
            >
              <AlertTriangle className="w-3 h-3" />
              {probeError}
            </motion.div>
          )}
          {probeResult && (
            <motion.div
              key="probe-result"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              id="policy-probe-result"
              className={`mt-2 rounded-lg border p-2.5 ${severityClasses(probeResult.overall)}`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest">
                <span className="flex items-center gap-1">
                  {dryRun && <FlaskConical className="w-3 h-3 text-amber-400" />}
                  Result: {probeResult.overall}
                  {dryRun && <span className="text-[8px] text-amber-400">(simulated)</span>}
                </span>
                <span className="text-[9px] opacity-70">{probeResult.results.length} rules evaluated</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[10px]">
                {probeResult.results.map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-center gap-1.5 ${
                      r.status === 'BLOCK'
                        ? 'text-rose-300'
                        : r.status === 'WARN'
                          ? 'text-amber-300'
                          : 'text-slate-400'
                    }`}
                  >
                    {r.status === 'PASS' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <CircleSlash className="w-3 h-3" />
                    )}
                    <span className="font-bold">{r.id}</span>
                    {r.detail && <span className="opacity-80">— {r.detail}</span>}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 border-t border-slate-800/60 pt-3">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
          Auto-Tune
        </div>
        <AutoTuneButton onApplied={load} />
      </div>
    </section>
  );
}
