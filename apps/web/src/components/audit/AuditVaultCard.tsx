import { useState, useEffect, useCallback } from 'react';
import { Lock, RefreshCw, CheckCircle2, AlertTriangle, Loader2, ShieldCheck, FileLock, BadgeCheck } from 'lucide-react';
import { useTenantStore, type Tenant } from '../../store/tenantStore';
import { apiGet, apiPost } from '../../lib/apiClient';
import { useEd25519Verify } from '../../hooks/useEd25519Verify';

interface VaultAnchor {
  anchorId: string;
  tenantId: string;
  tenantRole: string;
  batchRoot: string;
  leafCount: number;
  sampleLeafHashes: string[];
  createdAt: string;
}

interface VerifyResult {
  verified: boolean;
  anchorId: string;
  originalRoot: string;
  recomputedRoot: string;
  leafCount: number;
  currentLeafCount: number;
  verifiedAt: string;
}

export function AuditVaultCard() {
  const { tenants, currentTenantId } = useTenantStore();
  const current: Tenant | null = tenants.find((t: Tenant) => t.id === currentTenantId) || null;
  const canAnchor = current?.role === 'ADMIN';
  const canVerify = current?.role === 'ADMIN' || current?.role === 'AUDITOR';

  const [anchors, setAnchors] = useState<VaultAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchoring, setAnchoring] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [optimisticAnchorId, setOptimisticAnchorId] = useState<string | null>(null);

  const { isProven, verifySignature, verifying: _edVfy } = useEd25519Verify();

  const headers = useCallback((): HeadersInit => ({ 'Content-Type': 'application/json', 'X-Tenant-Id': currentTenantId }), [currentTenantId]);

  const fetchAnchors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ anchors: VaultAnchor[]; count: number }>('/api/audit/vault');
      setAnchors(Array.isArray(data.anchors) ? data.anchors : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnchors();
  }, [fetchAnchors]);

  const anchor = useCallback(async () => {
    if (!canAnchor) return;
    setAnchoring(true);
    setError(null);
    try {
      await apiPost('/api/audit/vault/anchor', { limit: 50 }, { headers: headers() });
      setOptimisticAnchorId(`optimistic-${Date.now()}`);
      await fetchAnchors();
      setOptimisticAnchorId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anchor failed');
    } finally {
      setAnchoring(false);
    }
  }, [canAnchor, fetchAnchors, headers]);

  const verify = useCallback(async (anchorId: string, batchRoot: string) => {
    if (!canVerify) return;
    setVerifying(anchorId);
    setError(null);
    try {
      const data = await apiPost<VerifyResult>('/api/audit/vault/verify', { anchorId }, { headers: headers() });
      setVerifyResults((prev) => ({ ...prev, [anchorId]: data }));

      if (data.verified) {
        const pubKeyHex = 'abc123';
        await verifySignature(
          anchorId,
          pubKeyHex,
          `${data.anchorId}:${data.leafCount}`,
          data.recomputedRoot
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verify failed');
    } finally {
      setVerifying(null);
    }
  }, [canVerify, headers, verifySignature]);

  return (
    <div id="audit-vault-card" className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileLock className="w-4 h-4 text-violet-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">Audit Vault &amp; Verification</h3>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
          {anchors.length} anchor{anchors.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-[10px] font-mono text-slate-500 mb-3">
        Cryptographic SHA-256 batch roots of telemetry execution logs. {canAnchor ? 'Click to anchor a new batch.' : 'Read-only role.'}
      </p>

      {error && (
        <div className="mb-3 p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span className="font-mono text-[10px] text-amber-300">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button
          id="audit-vault-anchor-btn"
          type="button"
          onClick={() => void anchor()}
          disabled={!canAnchor || anchoring}
          title={canAnchor ? 'Create a new vault anchor from current telemetry' : 'ADMIN role required'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 font-mono text-[10px] font-bold uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:opacity-40"
        >
          {anchoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
          Anchor Batch
        </button>
        <button
          type="button"
          onClick={() => void fetchAnchors()}
          disabled={loading}
          className="p-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-slate-400"
          title="Refresh anchors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && anchors.length === 0 && !optimisticAnchorId ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg border border-slate-800 bg-slate-950/40 animate-pulse" />
          ))}
        </div>
      ) : anchors.length === 0 && !optimisticAnchorId ? (
        <div
          id="audit-vault-empty"
          className="p-4 rounded-lg border border-slate-800 bg-slate-950/40 text-center"
        >
          <ShieldCheck className="w-6 h-6 text-slate-600 mx-auto mb-2" />
          <span className="font-mono text-[10px] text-slate-500">[NO VAULT HASHES] · create the first anchor to begin chain-of-custody</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {optimisticAnchorId && (
            <div className="p-2 rounded border border-violet-500/30 bg-violet-500/5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-violet-300">Anchoring batch...</span>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
              </div>
              <div className="font-mono text-[9px] text-slate-500 break-all">Awaiting vault confirmation...</div>
              <div className="font-mono text-[9px] text-slate-600 mt-0.5">
                Creating new anchor · {new Date().toLocaleString()}
              </div>
            </div>
          )}
          {anchors.map((a) => {
            const result = verifyResults[a.anchorId];
            const proven = isProven(a.anchorId);
            const isDone = proven || (result && result.verified);
            return (
              <div
                key={a.anchorId}
                className="p-2 rounded border border-slate-800 bg-slate-950/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-slate-300 truncate">{a.anchorId}</span>
                  {isDone ? (
                    <span className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-widest text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 animate-in fade-in zoom-in duration-300">
                      <BadgeCheck className="w-3 h-3 text-emerald-400" />
                      PROVEN
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void verify(a.anchorId, a.batchRoot)}
                      disabled={!canVerify || verifying === a.anchorId}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                    >
                      {verifying === a.anchorId ? '…' : 'Verify'}
                    </button>
                  )}
                </div>
                <div className="font-mono text-[9px] text-slate-500 break-all">{a.batchRoot}</div>
                <div className="font-mono text-[9px] text-slate-600 mt-0.5">
                  {a.leafCount} traces · {new Date(a.createdAt).toLocaleString()}
                </div>
                {result && (
                  <div
                    className={`mt-1 p-1.5 rounded text-[9px] font-mono flex items-center gap-1 ${
                      result.verified
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}
                  >
                    {result.verified ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {result.verified ? 'VERIFIED · hash chain intact' : `[UNVERIFIED] · expected ${result.originalRoot.slice(0, 12)}… got ${result.recomputedRoot.slice(0, 12)}…`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
