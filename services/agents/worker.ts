// services/agents/worker.ts
// ---------------------------------------------------------------------------
// Phase 28 — Agent Worker: Probabilistic Uncertainty Circuit.
//
// Every agent turn MUST reduce its output to the canonical `AgentPayload`
// schema (defined in @kudbee/types) before the payload is allowed to execute.
// This module is the authoritative place where the raw LLM/agent output is
// parsed, the `confidence_score` is normalized to [0.0, 1.0], and the
// `uncertainty_flag` is computed from the UNCERTAINTY_THRESHOLD (0.80).
//
// Resilient-First: a malformed or missing confidence NEVER crashes the worker.
// It degrades to the safest possible interpretation — a low confidence with
// `uncertainty_flag = true` — so the router guard downstream traps it in the
// PENDING_APPROVAL Governance queue instead of letting an ungrounded action
// execute. This is the anti-hallucination circuit.
//
// Zero runtime side-effects: this module only parses and normalizes. The
// router guard (services/agents/router.ts) is what intercepts and reroutes.
// ---------------------------------------------------------------------------

import {
  AgentPayloadSchema,
  UNCERTAINTY_THRESHOLD,
  type AgentPayload
} from '@kudbee/types';

/** A confidence reading that has been normalized but not yet routed. */
export interface EvaluatedPayload {
  payload: AgentPayload;
  confidence_score: number;
  uncertainty_flag: boolean;
  /** True when confidence_score < UNCERTAINTY_THRESHOLD (the gate trigger). */
  below_threshold: boolean;
  /** True when the input was malformed and we fell back to the safe default. */
  degraded: boolean;
}

/** Default low-confidence payload used when the input is unparseable. */
export const DEGRADED_PAYLOAD: AgentPayload = {
  action: 'UNKNOWN',
  confidence_score: 0,
  uncertainty_flag: true,
  reasoning: 'Worker could not parse agent output — defaulting to safest low-confidence interpretation.'
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Normalize a raw agent output blob into the canonical AgentPayload.
 *
 * Accepts either a pre-shaped `AgentPayload`-like object or a JSON string.
 * When the confidence is missing/unparseable we degrade to the safe default
 * (confidence 0, uncertainty_flag true) rather than throwing — the
 * Uncertainty Gate downstream will route it to PENDING_APPROVAL.
 */
export function parseAgentPayload(raw: unknown): AgentPayload {
  if (raw === null || raw === undefined) return { ...DEGRADED_PAYLOAD };

  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { ...DEGRADED_PAYLOAD };
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return { ...DEGRADED_PAYLOAD, reasoning: `Unparseable agent JSON: ${trimmed.slice(0, 120)}` };
    }
  }

  if (typeof candidate !== 'object' || candidate === null) {
    return { ...DEGRADED_PAYLOAD };
  }

  const obj = candidate as Record<string, unknown>;
  const action =
    typeof obj.action === 'string' && obj.action.length > 0
      ? obj.action
      : typeof obj.task === 'string' && obj.task.length > 0
        ? obj.task
        : 'UNKNOWN';

  const rawConfidence = Number(obj.confidence_score);
  const confidence_score = Number.isFinite(rawConfidence) ? clamp01(rawConfidence) : 0;

  // uncertainty_flag is computed from the threshold but also honors an
  // explicit true the agent may emit when it knows it is guessing.
  const explicit = obj.uncertainty_flag === true;
  const uncertainty_flag = explicit || confidence_score < UNCERTAINTY_THRESHOLD;

  const reasoning =
    typeof obj.reasoning === 'string' ? obj.reasoning : typeof obj.reason === 'string' ? obj.reason : '';

  const trace_id = typeof obj.trace_id === 'string' ? obj.trace_id : undefined;
  const model = typeof obj.model === 'string' ? obj.model : undefined;

  const payload: AgentPayload = {
    action,
    confidence_score,
    uncertainty_flag,
    reasoning,
    ...(trace_id !== undefined ? { trace_id } : {}),
    ...(model !== undefined ? { model } : {})
  };

  // Validate against the canonical schema. On a validation failure we still
  // return the payload (best-effort) but force the uncertainty flag on so the
  // gate traps it — never throw.
  const parsed = AgentPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : { ...payload, uncertainty_flag: true };
}

/**
 * Evaluate a raw agent output blob through the uncertainty circuit.
 *
 * Returns the normalized payload plus the derived gate signals the router
 * guard reads to decide whether to intercept and reroute to PENDING_APPROVAL.
 */
export function evaluateAgentPayload(raw: unknown): EvaluatedPayload {
  const payload = parseAgentPayload(raw);
  const degraded =
    payload.action === DEGRADED_PAYLOAD.action && payload.confidence_score === 0;
  const below_threshold = payload.confidence_score < UNCERTAINTY_THRESHOLD;
  return {
    payload,
    confidence_score: payload.confidence_score,
    uncertainty_flag: payload.uncertainty_flag || below_threshold,
    below_threshold,
    degraded
  };
}

export { UNCERTAINTY_THRESHOLD };
export default evaluateAgentPayload;
