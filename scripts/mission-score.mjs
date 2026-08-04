#!/usr/bin/env node
/**
 * scripts/mission-score.mjs — INT-042 Mission Scoring Model
 * ---------------------------------------------------------------------------
 * Deterministic scoring for candidate engineering missions. Every candidate
 * is scored on seven evidence-derived dimensions; the weighted composite is
 * the mission priority.
 *
 * Dimensions (0-100 each):
 *   impact     — reliability / operational cost effect
 *   evidence   — how much recorded evidence supports it
 *   risk       — LOW risk = HIGH score (risk is inverted)
 *   complexity — LOW complexity = HIGH score (inverted)
 *   cost       — LOW cost = HIGH score (inverted)
 *   learning   — learning value / evidence quality gain
 *   confidence — confidence the mission is correct and needed
 *
 * Priority = weighted sum, normalized to 0-100.
 *
 * Pure function — identical inputs produce identical outputs.
 * ---------------------------------------------------------------------------
 */

const WEIGHTS = {
  impact: 0.25,
  evidence: 0.20,
  risk: 0.15, // inverted: low risk → high score
  complexity: 0.10, // inverted: low complexity → high score
  cost: 0.05, // inverted: low cost → high score
  learning: 0.15,
  confidence: 0.10,
};

/** Invert a 0-100 "cost/risk/complexity" into a 0-100 score (low → high). */
function invert(v) {
  return Math.max(0, Math.min(100, 100 - v));
}

/**
 * Score a candidate mission.
 * @param {Object} c candidate with 0-100 fields impact, evidence, risk,
 *   complexity, cost, learning, confidence
 * @returns {{priority:number, scores:Object}}
 */
export function scoreMission(c) {
  const scores = {
    impact: c.impact ?? 0,
    evidence: c.evidence ?? 0,
    risk: invert(c.risk ?? 50),
    complexity: invert(c.complexity ?? 50),
    cost: invert(c.cost ?? 50),
    learning: c.learning ?? 0,
    confidence: c.confidence ?? 0,
  };

  let priority = 0;
  for (const [dim, w] of Object.entries(WEIGHTS)) {
    priority += w * scores[dim];
  }
  priority = Math.round(priority * 10) / 10;

  return { priority, scores, weights: WEIGHTS };
}
