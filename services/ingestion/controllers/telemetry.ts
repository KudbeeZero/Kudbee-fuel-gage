// services/ingestion/controllers/telemetry.ts
import type { Request, Response } from 'express';
import { EDGE_SENTINEL_SYSTEM_PROMPT } from '@kudbee/utils/prompts/edge-sentinel';
import { mintThinkToken } from '@kudbee/memory/thinkTokenGenerator';

interface IngestBody {
  [key: string]: unknown;
}

/**
 * Edge Sentinel telemetry ingestion webhook.
 *
 * Phase 5L — authorization is enforced by the capability middleware (agent
 * identity + ingest:telemetry). This handler no longer trusts a static
 * EDGE_AGENT_PASS shared secret. A defensive re-check of the resolved
 * capability set provides defense in depth.
 *
 * On successful ingestion it auto-mints a PENDING_APPROVAL Think Token.
 * Risky or high-latency events are tagged for the Governance Queue Tray.
 */
export const handleTelemetryIngest = async (req: Request, res: Response): Promise<void> => {
  try {
    // Defense in depth: the capability middleware already enforced
    // ingest:telemetry (401 anonymous / 403 no-capability). Re-check here so
    // this handler is safe even if middleware wiring changes.
    const caps: string[] = (req as any).kudbeeCapabilities || [];
    if (!caps.includes('ingest:telemetry')) {
      res.status(403).json({ error: 'Forbidden: ingest:telemetry capability required' });
      return;
    }

    const agentId = (req as any).agentId || 'edge-sentinel';
    const payload = (req.body ?? {}) as IngestBody;

    void payload;
    void EDGE_SENTINEL_SYSTEM_PROMPT;

    const cost = Number(payload.cost) || 0;
    const latencyMs = Number(payload.latency_ms) || 0;
    const isRisky = cost > 0.1 || latencyMs > 2000 || payload.status === 'FAILED';

    // Phase 5M — mint always creates PENDING_APPROVAL (lifecycle invariant).
    // Risk scoring is preserved as evidence for the later approval workflow
    // (Phase 5L) rather than directly conferring VERIFIED state.
    void mintThinkToken({
      agentId,
      traceId: String(payload.trace_id || `edge-${Date.now()}`),
      taskContext: {
        source: 'edge-sentinel',
        model: payload.model,
        risk: isRisky ? 'risky' : 'ok',
        cost,
        latencyMs,
      },
      failedState: isRisky ? { reason: 'high_cost_or_latency', cost, latencyMs } : {},
      correctionDelta: 'Edge Sentinel ingestion accepted via blast-radius evaluation.',
      reasoningSteps: [`status=${payload.status || 'OK'}`, `cost=${cost}`, `latencyMs=${latencyMs}`],
      cost,
      latencyMs,
    }).catch(() => {
      // best-effort; never block ingestion on think token minting
    });

    res.status(202).json({
      status: 'INGESTED',
      message: 'Telemetry received by Edge Sentinel layer.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Sentinel] Ingestion Error:', message);
    res.status(500).json({ error: 'Internal Sentinel Failure' });
  }
};
