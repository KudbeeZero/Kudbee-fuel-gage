/**
 * services/lib/energyMesh.ts
 * ---------------------------------------------------------------------------
 * Phase 54 — Quantitative Energy Mesh.
 *
 * Every token flowing through FTWB → Receptor Gate → Victory Gate is stamped
 * with an energyScore between 0.0 (minimal thermodynamic waste) and 1.0
 * (maximum entropy — should have been sunk).
 *
 * Energy function:
 *   E(token) = α·(1 - kd)·ε + β·(1 - similarity) + γ·sinkPressure + δ·threatLevel
 *
 * Weights α, β, γ, δ are configurable per-tenant via
 * PATCH /api/settings/tenant/:id with field `energyWeights`.
 * ---------------------------------------------------------------------------
 */

export interface EnergyWeights {
  alpha: number;  // receptor affinity weight
  beta: number;   // similarity mismatch weight
  gamma: number;  // sink pressure weight
  delta: number;  // threat level weight
}

const defaultWeights: EnergyWeights = { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 };

let currentWeights: EnergyWeights = { ...defaultWeights };

export function setEnergyWeights(w: Partial<EnergyWeights>): void {
  if (typeof w.alpha === 'number') currentWeights.alpha = w.alpha;
  if (typeof w.beta === 'number') currentWeights.beta = w.beta;
  if (typeof w.gamma === 'number') currentWeights.gamma = w.gamma;
  if (typeof w.delta === 'number') currentWeights.delta = w.delta;
}

export function getEnergyWeights(): EnergyWeights {
  return { ...currentWeights };
}

export interface TokenEnergyInput {
  kd: number;
  efficacy: number;
  similarityScore: number;
  sinkPressure: number;
  threatLevel: number;
}

export function computeEnergy(t: TokenEnergyInput): number {
  const w = currentWeights;
  const term1 = w.alpha * (1 - Math.abs(t.kd)) * t.efficacy;
  const term2 = w.beta * (1 - Math.max(0, Math.min(1, t.similarityScore)));
  const term3 = w.gamma * t.sinkPressure;
  const term4 = w.delta * t.threatLevel;
  return Math.max(0, Math.min(1, term1 + term2 + term3 + term4));
}

export interface EnergySnapshot {
  timestamp: string;
  model: string;
  energyScore: number;
  kd: number;
  efficacy: number;
  similarity: number;
}

const snapshots: EnergySnapshot[] = [];
const MAX_SNAPSHOTS = 200;

export function recordEnergySnapshot(snapshot: EnergySnapshot): void {
  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
}

export function getEnergyHeatmap(): { snapshots: EnergySnapshot[]; weights: EnergyWeights; averageEnergy: number } {
  const avg = snapshots.length > 0
    ? snapshots.reduce((s, e) => s + e.energyScore, 0) / snapshots.length
    : 0;
  return { snapshots: [...snapshots], weights: { ...currentWeights }, averageEnergy: avg };
}
