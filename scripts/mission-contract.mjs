#!/usr/bin/env node
/**
 * scripts/mission-contract.mjs — EXEC-001 Mission Execution Contract
 * ---------------------------------------------------------------------------
 * Pure module: defines the mission lifecycle state machine and validates
 * execution contracts. No I/O — deterministic and unit-testable.
 *
 * Lifecycle (no skipping, every transition timestamped):
 *   PROPOSED → APPROVED → BRANCH_CREATED → IMPLEMENTING → VERIFYING →
 *   READY_FOR_PR → MERGED → OBSERVING → COMPLETE
 * ---------------------------------------------------------------------------
 */

export const LIFECYCLE = [
  'PROPOSED',
  'APPROVED',
  'BRANCH_CREATED',
  'IMPLEMENTING',
  'VERIFYING',
  'READY_FOR_PR',
  'MERGED',
  'OBSERVING',
  'COMPLETE',
];

/** Required fields for a valid execution contract. */
export const REQUIRED_FIELDS = [
  'mission',
  'objective',
  'owner',
  'branch',
  'estimated_files',
  'estimated_loc',
  'rollback',
  'verification',
  'success_metrics',
];

/** Validate a mission contract. Returns { valid, missing[] }. */
export function validateContract(contract) {
  const missing = REQUIRED_FIELDS.filter((f) => {
    const v = contract?.[f];
    if (v == null || v === '') return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
  return { valid: missing.length === 0, missing };
}

/** Whether a transition from → to is legal (no skipping). */
export function canTransition(from, to) {
  if (from == null) return to === 'PROPOSED';
  const fi = LIFECYCLE.indexOf(from);
  const ti = LIFECYCLE.indexOf(to);
  if (fi === -1 || ti === -1) return false;
  return ti === fi + 1;
}

/** Human-readable progress percentage for a lifecycle state. */
export function progressFor(state) {
  const i = LIFECYCLE.indexOf(state);
  if (i === -1) return 0;
  return Math.round((i / (LIFECYCLE.length - 1)) * 100);
}

/** Guardian checks the executor must satisfy before entering a state. */
export function guardFor(state) {
  switch (state) {
    case 'BRANCH_CREATED':
      return ['branch_exists', 'remote_branch_exists'];
    case 'IMPLEMENTING':
      return ['branch_exists', 'remote_branch_exists', 'rollback_documented'];
    case 'VERIFYING':
      return ['branch_exists', 'rollback_documented', 'verification_commands_defined', 'success_metrics_defined'];
    case 'READY_FOR_PR':
      return ['branch_exists', 'verification_passed'];
    case 'MERGED':
      return ['branch_exists', 'verification_passed', 'pr_merged'];
    default:
      return [];
  }
}

/** Example contract shape (used for reference and seeding). */
export function exampleContract() {
  return {
    mission: 'STAB-002',
    objective: 'Connect orphan THINK tokens to incidents/decisions/benchmarks',
    owner: 'KILO',
    branch: 'feature/stab-002',
    estimated_files: 4,
    estimated_loc: 220,
    rollback: 'git revert <sha>',
    verification: ['knowledge:audit', 'graph:audit'],
    success_metrics: ['orphan_nodes < 5', 'graph_edges increased', 'retrieval unchanged or improved'],
  };
}
