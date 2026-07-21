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
 * Authenticates the request via the X-Agent-Pass header against
 * EDGE_AGENT_PASS, then accepts the payload. On successful ingestion,
 * auto-mints a Think Token when the blast-radius evaluation indicates
 * high confidence. Risky or high-latency events are tagged as
 * PENDING_APPROVAL for the Governance Queue Tray.
 */
export const handleTelemetryIngest = async (req: Request, res: Response): Promise<void> => {
  try {
    const agentPass = req.headers['x-agent-pass'];
    const expectedPass = process.env.EDGE_AGENT_PASS;

    if (typeof agentPass !== 'string' || agentPass !== expectedPass) {
      res.status(401).json({ error: 'Unauthorized: Invalid Sentinel Pass' });
      return;
    }

    const payload = (req.body ?? {}) as IngestBody;

    void payload;
    void EDGE_SENTINEL_SYSTEM_PROMPT;

    const cost = Number(payload.cost) || 0;
    const latencyMs = Number(payload.latency_ms) || 0;
    const isRisky = cost > 0.1 || latencyMs > 2000 || payload.status === 'FAILED';
    const tokenStatus = isRisky ? 'PENDING_APPROVAL' : 'VERIFIED';

    void mintThinkToken({
      traceId: String(payload.trace_id || `edge-${Date.now()}`),
      taskContext: { source: 'edge-sentinel', model: payload.model },
      failedState: isRisky ? { reason: 'high_cost_or_latency', cost, latencyMs } : {},
      correctionDelta: 'Edge Sentinel ingestion accepted via blast-radius evaluation.',
      reasoningSteps: [`status=${payload.status || 'OK'}`, `cost=${cost}`, `latencyMs=${latencyMs}`],
      cost,
      latencyMs,
      status: tokenStatus
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
