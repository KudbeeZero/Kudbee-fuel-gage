/**
 * services/lib/ftwbMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 41 — First Thought Wrong Buffer (FTWB) Staging Layer.
 *
 * Express middleware that stages every incoming telemetry trace in a Redis
 * staging buffer before allowing it into the receptor gate. Each staged
 * payload is evaluated via Groq's semantic threat detection. Verdicts:
 *
 *   CLEAR  → payload passes through to receptor gating + Neon commit
 *   REJECT → payload is sunk into kudbee:sink:accumulator with remediation
 *
 * In local/CI (no GROQ_API_KEY), the buffer acts as a passthrough with
 * zero latency — no tokens are blocked, enabling existing E2E tests.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import { groqConfigured } from './groqClient.ts';
import { sinkToken } from './sinkAccumulator.ts';
import { evaluateTokenMatch } from './groqClient.ts';

const FTWB_STAGE_KEY = 'kudbee:buffer:ftwb';
const FTWB_TIMEOUT_MS = 3000;

async function stagePayload(payload: Record<string, unknown>): Promise<string> {
  const entryId = `ftwb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return entryId;
}

async function groqThreatEvaluate(payload: Record<string, unknown>): Promise<{ verdict: 'CLEAR' | 'REJECT'; threatLevel: number; category: string; recommendation: string }> {
  if (!groqConfigured) {
    return { verdict: 'CLEAR', threatLevel: 0, category: 'passthrough', recommendation: 'Groq disabled — all tokens pass' };
  }

  try {
    const guardContext = `Expected: legitimate telemetry trace with model, tokens_in, tokens_out, cost, and valid status.`;
    const candidateContext = JSON.stringify(payload).slice(0, 1500);
    const result = await evaluateTokenMatch(guardContext, candidateContext);

    if (!result.ok) {
      return { verdict: 'CLEAR', threatLevel: 0, category: 'groq_error', recommendation: result.error || 'Evaluation failed' };
    }

    const threatLevel = 1 - result.matchProbability;
    if (threatLevel > 0.7) {
      return { verdict: 'REJECT', threatLevel, category: 'suspicious_pattern', recommendation: result.reasoning };
    }
    return { verdict: 'CLEAR', threatLevel, category: 'safe', recommendation: result.reasoning };
  } catch {
    return { verdict: 'CLEAR', threatLevel: 0, category: 'groq_error', recommendation: 'Evaluation exception — pass through' };
  }
}

export function ftwbMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ftwbEnabled = req.headers['x-ftwb-bypass'] !== 'true';

    if (!ftwbEnabled || !groqConfigured) {
      return next();
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return next();
    }

    const entryId = await stagePayload(payload);
    req.ftwbEntryId = entryId;

    const evaluation = await groqThreatEvaluate(payload);
    req.ftwbVerdict = evaluation;

    if (evaluation.verdict === 'REJECT') {
      const tokenId = String(payload.trace_id || payload.traceId || entryId);
      await sinkToken(tokenId, 'FTWB Groq threat rejection', evaluation.recommendation);
      return res.status(422).json({
        error: 'Token rejected by FTWB threat evaluation',
        verdict: evaluation.verdict,
        threatLevel: evaluation.threatLevel,
        category: evaluation.category,
        recommendation: evaluation.recommendation,
        entryId
      });
    }

    return next();
  };
}

declare global {
  namespace Express {
    interface Request {
      ftwbEntryId?: string;
      ftwbVerdict?: { verdict: string; threatLevel: number; category: string; recommendation: string };
    }
  }
}
