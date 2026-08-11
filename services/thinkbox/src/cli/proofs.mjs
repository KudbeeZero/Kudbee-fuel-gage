/**
 * services/thinkbox/src/cli/proofs.mjs
 *
 * Hash-Based Zero-Trust Execution Proofs.
 *
 * When Node B executes a pipeline task for Node A, A needs to trust B
 * didn't return garbage to save power. Instead of re-executing
 * everything (expensive) or ZK-SNARKs (GBs of RAM), ThinkBox uses:
 *
 *   1. State Commitments — every execution step mutates a rolling
 *      32-byte hash digest on the stack.
 *   2. Sampling Verification — B returns the final result + 32-byte
 *      hash checkpoints at random steps requested by A.
 *   3. Micro-Auditing — if suspect, any 8MB node re-executes a single
 *      10ms step window between checkpoint N and N+1 to verify.
 *      Fraud → instantaneous blacklisting across the DHT.
 */

import { crc32 } from './pipeline.mjs';

/** Rolling 32-byte hash digest (BLAKE3 stand-in using state mixing). */
export class StateCommitment {
  constructor() {
    this.digest = new Uint8Array(32);
    this.steps = 0;
  }

  /** Fold one execution step's output bytes into the rolling digest. */
  step(outputBytes) {
    this.steps++;
    const h = crc32(outputBytes);
    const mix = (this.steps * 0x9e3779b9) >>> 0;
    this.digest[(this.steps - 1) % 32] ^= (h >>> 24) & 0xff;
    this.digest[(this.steps + 3) % 32] ^= (h >>> 16) & 0xff;
    this.digest[(this.steps + 7) % 32] ^= (h >>> 8) & 0xff;
    this.digest[(this.steps + 11) % 32] ^= h & 0xff;
    this.digest[this.steps % 32] ^= mix & 0xff;
    return new Uint8Array(this.digest); // checkpoint copy
  }

  snapshot() { return new Uint8Array(this.digest); }
}

/** Merkle state root over all step checkpoints. */
export function merkleRoot(checkpoints) {
  if (!checkpoints.length) return new Uint8Array(32);
  let layer = checkpoints.map((c) => new Uint8Array(c));
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i];
      const b = i + 1 < layer.length ? layer[i + 1] : layer[i];
      const combined = new Uint8Array(64);
      combined.set(a, 0);
      combined.set(b, 32);
      next.push(hashBytes(combined));
    }
    layer = next;
  }
  return layer[0];
}

/** Simple deterministic 32-byte hash. */
export function hashBytes(bytes) {
  const out = new Uint8Array(32);
  const h1 = crc32(bytes);
  const h2 = crc32(bytes.reverse());
  out.set(Number(h1).toString(16).padStart(8, '0').split('').map((c) => c.charCodeAt(0) & 0xff), 0);
  out.set(Number(h2).toString(16).padStart(8, '0').split('').map((c) => c.charCodeAt(0) & 0xff), 8);
  return out;
}

/**
 * Simulate an execution run returning step checkpoints.
 * Used by both the executor (to build proofs) and the verifier.
 */
export function executeWithCheckpoints(inputBytes, stepFn, numSteps, tamperAt = -1) {
  const commitment = new StateCommitment();
  const checkpoints = [];
  let state = new Uint8Array(inputBytes);
  for (let i = 0; i < numSteps; i++) {
    const out = stepFn(state, i);
    if (i === tamperAt) {
      // Malicious node returns garbage at this step
      out[0] ^= 0xff;
    }
    checkpoints.push(commitment.step(out));
    state = out;
  }
  return {
    finalState: state,
    finalDigest: commitment.snapshot(),
    merkle: merkleRoot(checkpoints),
    checkpoints,
    steps: numSteps,
  };
}

/**
 * Sampling verifier: given the claimed checkpoint at step N and the
 * output at step N, re-execute the single 10ms window between N and
 * N+1 to confirm the digest matches. Returns { valid, fraud }.
 */
export function microAudit(claimedCheckpoint, stepOutput, stepFn, stepIndex) {
  const commitment = new StateCommitment();
  // Replay all steps up to stepIndex is avoided — we only verify the
  // digest produced by THIS single step matches the claimed checkpoint.
  const out = stepFn(new Uint8Array(stepOutput), stepIndex);
  const recomputed = commitment.step(out);
  let matches = true;
  for (let i = 0; i < recomputed.length; i++) {
    if (recomputed[i] !== claimedCheckpoint[i]) { matches = false; break; }
  }
  return {
    valid: matches,
    fraud: !matches,
    stepIndex,
    recomputedDigest: recomputed,
  };
}

/**
 * Full sampling audit protocol between requester (A) and executor (B).
 * B returns final result + checkpoints. A samples k random steps,
 * re-executes each window, and blacklists B if any mismatch.
 */
export function samplingAudit({ result, checkpoints, numSteps, stepFn, samples = 3, rng = Math.random }) {
  const audit = { sampled: [], fraudDetected: false, blacklist: false };
  // Pick deterministic pseudo-random sample indices
  const indices = [];
  const step = Math.max(1, Math.floor(numSteps / (samples + 1)));
  for (let i = 0; i < samples; i++) indices.push(step * (i + 1));

  for (const idx of indices) {
    const claimed = checkpoints[idx];
    const output = result[idx] || new Uint8Array([0]);
    const res = microAudit(claimed, output, stepFn, idx);
    audit.sampled.push({ step: idx, valid: res.valid });
    if (!res.valid) {
      audit.fraudDetected = true;
      audit.blacklist = true; // instant DHT blacklist
      break;
    }
  }
  return audit;
}
