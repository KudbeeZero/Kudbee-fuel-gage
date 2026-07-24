// services/agents/router.ts
// ---------------------------------------------------------------------------
// Phase 28 — Intelligence Router: Uncertainty Guard.
//
// Sits between the agent worker (which normalizes the confidence circuit) and
// LLM/execution. Before a payload is allowed to execute, `routeAgentPayload`
// checks the uncertainty circuit:
//
//   IF confidence_score < UNCERTAINTY_THRESHOLD (0.80)
//      OR uncertainty_flag === true
//   THEN intercept the payload BEFORE it executes and route it directly to the
//   PENDING_APPROVAL Governance queue (or the new DLQ), tagged
//   `REASON: HIGH_UNCERTAINTY`.
//
// This is the hard anti-hallucination gate. An agent that is "guessing" can
// never silently execute a destructive action — it is always trapped and
// surfaced for Human-in-the-Loop review.
//
// Resilient-First: a failure to write the proposed action to the governance
// store is caught and reported in the route result; it NEVER throws. The
// route decision itself is deterministic and computed before any I/O.
// ---------------------------------------------------------------------------

import { UNCERTAINTY_THRESHOLD, type AgentPayload } from '@kudbee/types';
import { evaluateAgentPayload, type EvaluatedPayload } from './worker.ts';

/** The tag applied to every uncertainty-trapped governance action. */
export const HIGH_UNCERTAINTY_TAG = 'REASON: HIGH_UNCERTAINTY';

export type RouteDecision = 'EXECUTE' | 'PENDING_APPROVAL';

export interface RouteResult {
  decision: RouteDecision;
  intercepted: boolean;
  confidence_score: number;
  uncertainty_flag: boolean;
  reason: string;
  /** The governance action id when the payload was trapped (else null). */
  governance_action_id: string | null;
  /** The proposed governance entry (for the DLQ / dashboard tray). */
  proposed: unknown | null;
  evaluation: EvaluatedPayload;
}

/** The minimum contract the router needs from the governance store. */
export interface GovernanceSink {
  proposeAction(input: {
    action: string;
    tags?: string[];
    prompt?: string;
    id?: string;
  }): Promise<{ id: string } & Record<string, unknown>>;
}

/**
 * Decide whether an agent payload must be intercepted by the Uncertainty Gate.
 * Pure + deterministic — no I/O — so the decision is auditable before routing.
 */
export function shouldIntercept(evaluation: EvaluatedPayload): boolean {
  return evaluation.below_threshold || evaluation.payload.uncertainty_flag;
}

/**
 * Route an agent payload through the Uncertainty Gate.
 *
 * - High confidence (>= 0.80 AND uncertainty_flag false) -> EXECUTE.
 * - Otherwise intercept, write a PENDING_APPROVAL governance action tagged
 *   `REASON: HIGH_UNCERTAINTY`, and return the route decision so the caller
 *   can short-circuit execution and surface the trap to the dashboard.
 *
 * @param raw The raw agent output (object or JSON string).
 * @param sink The governance store used to enqueue trapped payloads.
 */
export async function routeAgentPayload(
  raw: unknown,
  sink: GovernanceSink
): Promise<RouteResult> {
  const evaluation = evaluateAgentPayload(raw);
  const payload: AgentPayload = evaluation.payload;
  const intercepted = shouldIntercept(evaluation);

  if (!intercepted) {
    return {
      decision: 'EXECUTE',
      intercepted: false,
      confidence_score: payload.confidence_score,
      uncertainty_flag: false,
      reason: 'Confidence above threshold — cleared for execution.',
      governance_action_id: null,
      proposed: null,
      evaluation
    };
  }

  const reason =
    evaluation.degraded && payload.confidence_score === 0
      ? 'HIGH_UNCERTAINTY: agent output unparseable — trapped as safest default.'
      : `HIGH_UNCERTAINTY: confidence_score ${payload.confidence_score.toFixed(4)} < ${UNCERTAINTY_THRESHOLD}.`;

  const actionLabel = `HOLD:${String(payload.action).slice(0, 80)}`;
  const prompt = payload.reasoning || payload.action;

  let governance_action_id: string | null = null;
  let proposed: unknown | null = null;
  try {
    const entry = await sink.proposeAction({
      action: actionLabel,
      tags: [HIGH_UNCERTAINTY_TAG, 'uncertainty-gate', 'pending-approval'],
      prompt,
      id: `uncertainty-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    });
    governance_action_id = entry?.id ?? null;
    proposed = entry ?? null;
  } catch (err: unknown) {
    // Resilient-First: a sink failure must NOT let the payload execute.
    // We still return PENDING_APPROVAL so the caller halts; the failed
    // enqueue is reported in the reason.
    return {
      decision: 'PENDING_APPROVAL',
      intercepted: true,
      confidence_score: payload.confidence_score,
      uncertainty_flag: true,
      reason: `${reason} (governance enqueue failed: ${err instanceof Error ? err.message : String(err)} — held locally)`,
      governance_action_id: null,
      proposed: null,
      evaluation
    };
  }

  return {
    decision: 'PENDING_APPROVAL',
    intercepted: true,
    confidence_score: payload.confidence_score,
    uncertainty_flag: true,
    reason,
    governance_action_id,
    proposed,
    evaluation
  };
}

export { UNCERTAINTY_THRESHOLD };
export default routeAgentPayload;
