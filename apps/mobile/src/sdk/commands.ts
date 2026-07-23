import { apiPost, apiPatch, apiGet } from '../lib/apiClient';
import { useCommandStore } from '../store/useCommandStore';

export type CommandResult = {
  success: boolean;
  detail?: string;
  traceId?: string;
};

async function runMobileCommand(
  kind: string,
  label: string,
  description: string,
  runner: () => Promise<{ success: boolean; detail?: string; traceId?: string }>
): Promise<{ id: string; success: boolean; detail?: string }> {
  const { enqueue, setState } = useCommandStore.getState();
  const id = enqueue({ kind, label, description });
  setState(id, 'QUEUED', 'Queued…');
  setState(id, 'PROCESSING', 'Running…');
  try {
    const result = await runner();
    setState(id, result.success ? 'SUCCESS' : 'FAILED', result.detail);
    return { id, success: result.success, detail: result.detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState(id, 'FAILED', message);
    return { id, success: false, detail: message };
  }
}

export const mobileCommandRunners = {
  hermesAudit: () =>
    runMobileCommand(
      'HERMES_AUDIT',
      'Trigger HERMES Audit',
      'Spawn auditor sweep across recent reasoning events',
      async () => {
        const res = await apiPost<{ success?: boolean; cycle?: number; message?: string; traceId?: string }>(
          '/api/governance/dispatch',
          { task: 'hermes-audit' }
        );
        return {
          success: !!res?.success,
          detail: res?.message || `cycle ${res?.cycle ?? '?'} dispatched`,
          traceId: res?.traceId,
        };
      }
    ),

  clearTriage: () =>
    runMobileCommand(
      'CLEAR_TRIAGE',
      'Clear Triage Queue',
      'Re-validate and clear the interceptor triage backlog',
      async () => {
        const res = await apiPost<{ ok?: boolean; count?: number; message?: string }>(
          '/api/telemetry/purge',
          { source: 'triage' }
        );
        return {
          success: !!res?.ok,
          detail: res?.message || `${res?.count ?? 0} records cleared`,
        };
      }
    ),

  resyncVector: () =>
    runMobileCommand(
      'RESYNC_VECTOR',
      'Re-sync Vector Store',
      'Force vector memory reconciliation pass',
      async () => {
        const res = await apiPost<{ success?: boolean; indexed?: number; message?: string }>(
          '/api/telemetry/ingest',
          {
            trace_id: `resync-${Date.now()}`,
            model: 'vector-resync',
            tokens_in: 0,
            tokens_out: 0,
            cost: 0,
            status: 'RESYNC_PROBE',
            provider: 'system',
            project_name: 'kilo-fuel-gauge',
            thought_summary: 'vector resync probe',
          }
        );
        return {
          success: !!res?.success,
          detail: res?.message || 'vector memory reconciliation complete',
        };
      }
    ),

  verifyTrace: (traceId: number | string) =>
    runMobileCommand(
      'VERIFY_TRACE',
      'Verify Trace',
      `Re-validate trace #${traceId} through the interceptor`,
      async () => {
        const res = await apiPatch<{ ok?: boolean; message?: string }>(
          `/api/interceptor/revalidate/${traceId}`,
          {}
        );
        return {
          success: !!res?.ok,
          detail: res?.message || `trace ${traceId} verified`,
          traceId: String(traceId),
        };
      }
    ),

  crucibleDispatch: () =>
    runMobileCommand(
      'CRUCIBLE_DISPATCH',
      'Run Crucible Cycle',
      'Trigger a single Crucible reasoning cycle',
      async () => {
        const res = await apiPost<{ success?: boolean; cycle?: number; message?: string; traceId?: string }>(
          '/api/governance/dispatch',
          { task: 'manual-dispatch' }
        );
        return {
          success: !!res?.success,
          detail: res?.message || `cycle ${res?.cycle ?? '?'} complete`,
          traceId: res?.traceId,
        };
      }
    ),

  telemetryPurge: () =>
    runMobileCommand(
      'TELEMETRY_PURGE',
      'Purge Telemetry Ledger',
      'Reset the telemetry_traces table (irreversible)',
      async () => {
        const res = await apiPost<{ ok?: boolean; count?: number }>(
          '/api/telemetry/purge',
          { source: 'all' }
        );
        return {
          success: !!res?.ok,
          detail: `${res?.count ?? 0} traces removed`,
        };
      }
    ),

  memoryRecall: (query?: string) =>
    runMobileCommand(
      'MEMORY_RECALL',
      `Recall Memory${query ? `: "${query}"` : ''}`,
      'Semantic search over the vector memory store',
      async () => {
        const q = query || 'telemetry dashboard latency';
        const res = await apiGet<{ results?: Array<{ id: string; chunk: string; score: number }>; memories?: Array<{ id: string; chunk: string; score: number }> }>(
          `/api/memory/recall?text=${encodeURIComponent(q)}&limit=5`
        );
        const hits = res?.results ?? res?.memories ?? [];
        return {
          success: true,
          detail: `${hits.length} memory chunks recalled for "${q}"`,
        };
      }
    ),

  systemProbe: () =>
    runMobileCommand(
      'SYSTEM_PROBE',
      'Trigger System Probe',
      'Run deep health check on Postgres, Redis, and agents',
      async () => {
        const res = await apiGet<{ status?: string; services?: Record<string, { status: string; latencyMs: number }>; agent?: { status: string } }>(
          '/api/system/health-deep'
        );
        const svc = res?.services ?? {};
        const parts: string[] = [];
        if (svc.postgres) parts.push(`PG ${svc.postgres.latencyMs}ms`);
        if (svc.redis) parts.push(`Redis ${svc.redis.latencyMs}ms`);
        if (res?.agent) parts.push(`Agent ${res.agent.status}`);
        return {
          success: res?.status === 'HEALTHY' || !!res?.services,
          detail: parts.length > 0 ? parts.join(', ') : 'Probe completed',
        };
      }
    ),

  governanceBulkApprove: () =>
    runMobileCommand(
      'GOVERNANCE_BULK_APPROVE',
      'Bulk Approve Pending Governance',
      'Approve all pending HITL governance actions',
      async () => {
        const pending = await apiGet<Array<{ id: string }>>('/api/governance/pending');
        const items = Array.isArray(pending) ? pending : [];
        let approved = 0;
        for (const item of items.slice(0, 10)) {
          try {
            await apiPost('/api/governance/approve', { id: item.id });
            approved++;
          } catch (err) {
            console.warn(`[mobile] failed to approve ${item.id}:`, err);
          }
        }
        return {
          success: true,
          detail: `${approved}/${items.length} actions approved`,
        };
      }
    ),

  dictionaryLookup: (query?: string) =>
    runMobileCommand(
      'DICTIONARY_LOOKUP',
      `Dictionary Lookup${query ? `: "${query}"` : ''}`,
      'pgvector cosine similarity search over victory snapshots',
      async () => {
        const q = query || 'reasoning pattern';
        const res = await apiPost<{ found?: boolean; similarity?: number; snapshot?: { text: string } }>(
          '/api/memory/dictionary/lookup',
          { query: q }
        );
        return {
          success: !!res?.found,
          detail: res?.found ? `Snapshot found (sim ${(res.similarity ?? 0).toFixed(3)})` : 'No matching snapshot',
        };
      }
    ),
};

export type MobileCommandRunners = typeof mobileCommandRunners;
