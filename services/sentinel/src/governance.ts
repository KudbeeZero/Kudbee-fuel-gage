/**
 * services/sentinel/src/governance.ts
 * ---------------------------------------------------------------------------
 * Edge Sentinel — Blast Radius Governance Trigger.
 *
 * Calculates a deterministic mock risk score from an observed anomaly and, when
 * the threshold is breached, produces a precise HITL hand-off payload. The
 * Sentinel NEVER autonomously remediates critical infrastructure degradation —
 * it only escalates. Cost-zero guardrails: pure functions, no I/O, no loops.
 * ---------------------------------------------------------------------------
 */

export type RiskTier = 'none' | 'local_cache' | 'db_write' | 'schema_env';

export interface AnomalySignal {
  mutationRisk: RiskTier;
  dataDestructionRisk: 'none' | 'soft_delete' | 'hard_delete' | 'widespread_drop';
  observedLatencyMs: number;
  detail: string;
}

export interface GovernancePayload {
  id: string;
  status: 'PENDING_APPROVAL';
  agentId: 'EDGE_SENTINEL';
  action: string;
  calculatedRisk: number;
  reason: string;
}

const MUTATION_WEIGHT: Record<RiskTier, number> = {
  none: 0,
  local_cache: 1,
  db_write: 2,
  schema_env: 3
};

const DESTRUCTION_WEIGHT: Record<AnomalySignal['dataDestructionRisk'], number> = {
  none: 0,
  soft_delete: 1,
  hard_delete: 2,
  widespread_drop: 3
};

const RISK_THRESHOLD = 2;

/** Deterministic blast-radius risk score (0–6). Pure, no side effects. */
export function calculateRiskScore(signal: AnomalySignal): number {
  return MUTATION_WEIGHT[signal.mutationRisk] + DESTRUCTION_WEIGHT[signal.dataDestructionRisk];
}

/**
 * If the risk breaches the threshold, return the precise HITL hand-off payload.
 * Otherwise returns null — the Sentinel takes no autonomous action.
 */
export function evaluateBlastRadius(signal: AnomalySignal, action: string): GovernancePayload | null {
  const calculatedRisk = calculateRiskScore(signal);
  if (calculatedRisk < RISK_THRESHOLD) return null;

  const payload: GovernancePayload = {
    id: `gov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'PENDING_APPROVAL',
    agentId: 'EDGE_SENTINEL',
    action,
    calculatedRisk,
    reason: `[${signal.mutationRisk}/${signal.dataDestructionRisk}] ${signal.detail}`
  };
  return payload;
}
