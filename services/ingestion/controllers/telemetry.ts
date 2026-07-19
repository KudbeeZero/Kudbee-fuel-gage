// services/ingestion/controllers/telemetry.ts
import type { Request, Response } from 'express';
import { EDGE_SENTINEL_SYSTEM_PROMPT } from '@kudbee/utils/prompts/edge-sentinel';

interface IngestBody {
  [key: string]: unknown;
}

/**
 * Edge Sentinel telemetry ingestion webhook.
 *
 * Authenticates the request via the X-Agent-Pass header against
 * EDGE_AGENT_PASS, then accepts the payload. The Gemini pipe (using
 * EDGE_SENTINEL_SYSTEM_PROMPT) is stubbed for this PR; routing is mocked to
 * keep the ingestion path clean and verifiable.
 */
export const handleTelemetryIngest = async (req: Request, res: Response): Promise<void> => {
  try {
    const agentPass = req.headers['x-agent-pass'];
    const expectedPass = process.env.EDGE_AGENT_PASS;

    // 1. Auth check (Edge Sentinel secure key)
    if (typeof agentPass !== 'string' || agentPass !== expectedPass) {
      res.status(401).json({ error: 'Unauthorized: Invalid Sentinel Pass' });
      return;
    }

    const payload = (req.body ?? {}) as IngestBody;

    // 2. Here we will eventually pipe the payload to Gemini using
    //    EDGE_SENTINEL_SYSTEM_PROMPT. For this PR we mock successful ingestion
    //    to ensure routing is clean.
    void payload;
    void EDGE_SENTINEL_SYSTEM_PROMPT;

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
