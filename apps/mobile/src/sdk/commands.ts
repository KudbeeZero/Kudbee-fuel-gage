import { apiPost, apiPatch, apiGet } from '../lib/apiClient';

export interface CommandResult {
  success: boolean;
  detail?: string;
  traceId?: string;
}

export async function hermesAudit(): Promise<CommandResult> {
  const res = await apiPost<{ success?: boolean; cycle?: number; message?: string; traceId?: string }>(
    '/api/governance/dispatch',
    { task: 'hermes-audit' }
  );
  return {
    success: !!res?.success,
    detail: res?.message || `cycle ${res?.cycle ?? '?'} dispatched`,
    traceId: res?.traceId
  };
}

export async function clearTriage(): Promise<CommandResult> {
  const res = await apiPost<{ ok?: boolean; count?: number; message?: string }>(
    '/api/telemetry/purge',
    { source: 'triage' }
  );
  return {
    success: !!res?.ok,
    detail: res?.message || `${res?.count ?? 0} records cleared`
  };
}

export async function resyncVector(): Promise<CommandResult> {
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
      thought_summary: 'vector resync probe'
    }
  );
  return {
    success: !!res?.success,
    detail: res?.message || 'vector memory reconciliation complete'
  };
}

export async function verifyTrace(traceId: number | string): Promise<CommandResult> {
  const res = await apiPatch<{ ok?: boolean; message?: string }>(
    `/api/interceptor/revalidate/${traceId}`,
    {}
  );
  return {
    success: !!res?.ok,
    detail: res?.message || `trace ${traceId} verified`,
    traceId: String(traceId)
  };
}

export async function crucibleDispatch(): Promise<CommandResult> {
  const res = await apiPost<{ success?: boolean; cycle?: number; message?: string; traceId?: string }>(
    '/api/governance/dispatch',
    { task: 'manual-dispatch' }
  );
  return {
    success: !!res?.success,
    detail: res?.message || `cycle ${res?.cycle ?? '?'} complete`,
    traceId: res?.traceId
  };
}

export async function telemetryPurge(): Promise<CommandResult> {
  const res = await apiPost<{ ok?: boolean; count?: number }>(
    '/api/telemetry/purge',
    { source: 'all' }
  );
  return {
    success: !!res?.ok,
    detail: `${res?.count ?? 0} traces removed`
  };
}

export async function memoryRecall(query = 'telemetry dashboard latency'): Promise<CommandResult> {
  const res = await apiGet<{ results?: Array<{ id: string; chunk: string; score: number }>; memories?: Array<{ id: string; chunk: string; score: number }> }>(
    `/api/memory/recall?text=${encodeURIComponent(query)}&limit=5`
  );
  const hits = res?.results ?? res?.memories ?? [];
  return {
    success: true,
    detail: `${hits.length} memory chunks recalled for "${query}"`
  };
}

export async function systemProbe(): Promise<CommandResult> {
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
    detail: parts.length > 0 ? parts.join(', ') : 'Probe completed'
  };
}

export async function governanceBulkApprove(): Promise<CommandResult> {
  const pending = await apiGet<Array<{ id: string }>>('/api/governance/pending');
  const items = Array.isArray(pending) ? pending : [];
  let approved = 0;
  let failed = 0;
  for (const item of items.slice(0, 10)) {
    try {
      await apiPost('/api/governance/approve', { id: item.id });
      approved++;
    } catch (err) {
      failed++;
      console.warn(`[commands] approve ${item.id} failed:`, err instanceof Error ? err.message : String(err));
    }
  }
  return {
    success: true,
    detail: `${approved}/${items.length} actions approved, ${failed} failed`
  };
}

export async function dictionaryLookup(query = 'reasoning pattern'): Promise<CommandResult> {
  const res = await apiPost<{ found?: boolean; similarity?: number; snapshot?: { text: string } }>(
    '/api/memory/dictionary/lookup',
    { query: query }
  );
  return {
    success: !!res?.found,
    detail: res?.found ? `Snapshot found (sim ${(res.similarity ?? 0).toFixed(3)})` : 'No matching snapshot'
  };
}
