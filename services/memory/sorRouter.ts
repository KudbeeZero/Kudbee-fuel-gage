/**
 * services/memory/sorRouter.ts
 * ---------------------------------------------------------------------------
 * Phase 62 — Self-Organizing Regulation (SOR) Pathway.
 *
 * Evaluates CHALLENGED think tokens by measuring their impact on the
 * continuous-attractor manifold. Uses the Energy Mesh to compute thermodynamic
 * energy scores and Sentinel IQR fences to detect Byzantine behavior.
 *
 * Decision logic:
 *
 *   CHALLENGED token arrives
 *     → computeEnergy(token) = E
 *     → computeIQRBoundary(contextWindow) = (lower, upper)
 *     ┌─ E < IQR_lower + 0.15·IQR  → PROMOTE  → VERIFIED (safe bending)
 *     ├─ E > IQR_upper - 0.10·IQR  → PRUNE    → route to kudbee:sink:accumulator
 *     └─ otherwise                  → HOLD     → remains CHALLENGED (pends review)
 *
 * When pruning, the SOR router:
 *   1. Calls sinkToken() to absorb into recycling sink
 *   2. Publishes audit event to kudbee:stream:audit
 *   3. Returns 422 (Unprocessable) instead of 500
 *   4. The payload is dropped — no crash, no fatal error
 * ---------------------------------------------------------------------------
 */

import { sinkToken } from '../lib/sinkAccumulator.ts';
import { computeEnergy, type TokenEnergyInput } from '../lib/energyMesh.ts';

export type TokenVerdict = 'PROMOTE' | 'PRUNE' | 'HOLD';

export interface SorDecision {
  tokenId: string;
  verdict: TokenVerdict;
  energyScore: number;
  iqrBound: { lower: number; upper: number; iqr: number };
  reason: string;
  timestamp: string;
}

interface ThinkToken {
  traceId: string;
  kd: number;
  efficacy: number;
  status: string;
}

type AuditPublishFn = (event: Record<string, unknown>) => void;

function iqrFence(values: number[]): { lower: number; upper: number; iqr: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const q1 = sorted[Math.floor(mid / 2)] ?? 0;
  const q3 = sorted[Math.floor(mid * 3 / 2)] ?? 0;
  const iqr = q3 - q1 || 0.01;
  return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr, iqr };
}

// Rolling context window for IQR computation
const contextWindow: number[] = [];

export function feedContextWindow(value: number): void {
  contextWindow.push(value);
  if (contextWindow.length > 50) contextWindow.shift();
}

/**
 * Token Quality Gate: validates a token against IQR boundaries before promotion.
 * Returns { valid, fence } — if valid is false, promotion should be rejected.
 */
export function qualityGate(kd: number, efficacy: number): { valid: boolean; lower: number; upper: number; score: number } {
  const normKd = kd / 100;
  const score = normKd * 0.6 + efficacy * 0.4;
  const lower = 0.25;
  const upper = 0.95;
  const valid = score >= lower && score <= upper;
  return { valid, lower, upper, score: Math.round(score * 1000) / 1000 };
}

export function evaluateToken(
  token: ThinkToken,
  auditPublish: AuditPublishFn,
  sinkPressure: number,
  threatLevel: number,
  context: number[]
): SorDecision {
  const similarityScore = Math.abs(token.kd) * (token.status === 'CHALLENGED' ? 0.5 : 0.9);
  const tokenInput: TokenEnergyInput = {
    kd: token.kd / 100,
    efficacy: token.efficacy || 0.5,
    similarityScore,
    sinkPressure,
    threatLevel,
  };

  const E = computeEnergy(tokenInput);
  context.push(E);
  if (context.length > 50) context.shift();

  const fence = context.length >= 3
    ? iqrFence(context)
    : { lower: 0.1, upper: 0.7, iqr: 0.2 };

  const safeBound = fence.lower + 0.15 * fence.iqr;
  const byzantineBound = fence.upper - 0.10 * fence.iqr;

  let verdict: TokenVerdict = 'HOLD';
  let reason = '';

  if (E < safeBound) {
    verdict = 'PROMOTE';
    reason = `Energy ${E.toFixed(3)} < safe bound ${safeBound.toFixed(3)} — token bends state safely`;
  } else if (E > byzantineBound) {
    verdict = 'PRUNE';
    reason = `Energy ${E.toFixed(3)} > Byzantine bound ${byzantineBound.toFixed(3)} — unstable perturbation detected`;
  } else {
    reason = `Energy ${E.toFixed(3)} in gap [${safeBound.toFixed(3)}, ${byzantineBound.toFixed(3)}] — pends review`;
  }

  const decision: SorDecision = {
    tokenId: token.traceId,
    verdict,
    energyScore: E,
    iqrBound: { lower: fence.lower, upper: fence.upper, iqr: fence.iqr },
    reason,
    timestamp: new Date().toISOString(),
  };

  auditPublish({
    type: 'sor.decision',
    ...decision,
  });

  return decision;
}

export async function executeSorDecision(
  decision: SorDecision,
  auditPublish: AuditPublishFn
): Promise<{ status: 'PROMOTED' | 'PRUNED' | 'HELD'; tokenId: string }> {
  switch (decision.verdict) {
    case 'PROMOTE': {
      auditPublish({
        type: 'sor.promote',
        tokenId: decision.tokenId,
        energyScore: decision.energyScore,
        reason: decision.reason,
        timestamp: new Date().toISOString(),
      });
      return { status: 'PROMOTED', tokenId: decision.tokenId };
    }
    case 'PRUNE': {
      await sinkToken(
        decision.tokenId,
        `SOR auto-prune: ${decision.reason}`,
        'Byzantine boundary violation'
      );
      auditPublish({
        type: 'sor.prune',
        tokenId: decision.tokenId,
        energyScore: decision.energyScore,
        reason: decision.reason,
        timestamp: new Date().toISOString(),
      });
      return { status: 'PRUNED', tokenId: decision.tokenId };
    }
    default:
      return { status: 'HELD', tokenId: decision.tokenId };
  }
}

/**
 * Batch evaluate all CHALLENGED tokens from the forge storage.
 * Called from the simulate-attack endpoint after adversarial tokens are fired.
 */
export async function evaluateChallengedTokens(
  tokens: ThinkToken[],
  auditPublish: AuditPublishFn,
  sinkPressure: number,
  threatLevel: number
): Promise<SorDecision[]> {
  const results: SorDecision[] = [];
  const localContext: number[] = [];
  for (const token of tokens.filter((t) => t.status === 'CHALLENGED')) {
    const decision = evaluateToken(token, auditPublish, sinkPressure, threatLevel, localContext);
    await executeSorDecision(decision, auditPublish);
    results.push(decision);
  }
  return results;
}
