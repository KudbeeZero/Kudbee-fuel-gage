/**
 * services/thinkbox/src/cli/cw-kad.mjs
 *
 * Capability-Weighted Distance Metric (CW-Kad).
 *
 * Standard Kademlia routes purely by XOR distance, blind to whether a
 * peer is on fiber or a dying 2G battery. CW-Kad combines raw XOR
 * distance with a packed CapabilityVector so tasks route to the closest
 * node that can actually execute them.
 *
 * Capability vector (packed into 2 bytes of the peer entry):
 *   execution_tier: u4 — 0=Relay Only, 1=INT8, 2=FP16, 3=FP32
 *   battery_state:  u2 — 0=Wall, 1=High, 2=Low
 *   latency_class:  u2 — 0=<10ms, 1=<50ms, 2=<200ms, 3=>200ms
 *   throughput_kbps:u8 — quantized bandwidth tier
 */

import { makeNodeId } from './dht-table.mjs';

export const EXECUTION_TIER = {
  RELAY_ONLY: 0,
  INT8: 1,
  FP16: 2,
  FP32: 3,
};

export const BATTERY = { WALL: 0, HIGH: 1, LOW: 2 };
export const LATENCY = { LT10: 0, LT50: 1, LT200: 2, GT200: 3 };

/** Pack 4 capability fields into a single 16-bit value (u4|u2|u2|u8). */
export function packCapabilities(executionTier, battery, latency, throughputKbps) {
  return (
    ((executionTier & 0xf) << 12) |
    ((battery & 0x3) << 10) |
    ((latency & 0x3) << 8) |
    (throughputKbps & 0xff)
  );
}

export function unpackCapabilities(packed) {
  return {
    executionTier: (packed >> 12) & 0xf,
    battery: (packed >> 10) & 0x3,
    latency: (packed >> 8) & 0x3,
    throughputKbps: packed & 0xff,
  };
}

/**
 * Capability requirements for a task.
 *   requiresCompute: needs an execution tier ≥ threshold
 *   requiresPower: needs battery ≥ threshold (0=wall,1=high ok; 2=low excluded)
 *   latencyBudget: needs latency ≤ budget class
 *   minThroughput: needs throughput ≥ kbps
 */
export class TaskCapability {
  constructor({ requiresCompute = EXECUTION_TIER.INT8, requiresPower = BATTERY.HIGH, latencyBudget = LATENCY.LT200, minThroughput = 64 } = {}) {
    this.requiresCompute = requiresCompute;
    this.requiresPower = requiresPower;
    this.latencyBudget = latencyBudget;
    this.minThroughput = minThroughput;
  }
}

/** Capability-gate: can this peer execute the task? */
export function canExecute(peerCaps, task) {
  if (peerCaps.executionTier < task.requiresCompute) return false;
  if (peerCaps.battery > task.requiresPower) return false; // battery worse than required
  if (peerCaps.latency > task.latencyBudget) return false;
  if (peerCaps.throughputKbps < task.minThroughput) return false;
  return true;
}

/** XOR distance between two node ids (as Uint8Array). */
export function xorDistance(a, b) {
  let dist = 0n;
  for (let i = 0; i < a.length; i++) {
    dist = (dist << 8n) | BigInt(a[i] ^ b[i]);
  }
  return dist;
}

/**
 * Capability-weighted distance: candidates failing the capability gate
 * always sort AFTER eligible peers (tiered), and within each tier rank
 * by raw XOR distance. Returns sorted candidates + eligibility.
 */
export function cwRankPeers(candidates, targetId, task) {
  const enriched = candidates.map((c) => {
    const caps = c.caps ?? { executionTier: 0, battery: 2, latency: 3, throughputKbps: 0 };
    const eligible = canExecute(caps, task);
    const rawDist = xorDistance(targetId, c.nodeId);
    return { ...c, caps, eligible, rawDist: rawDist.toString() };
  });

  return enriched.sort((a, b) => {
    // Tier 1: eligible before ineligible
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    // Tier 2: within same eligibility, nearest XOR distance first
    const ad = BigInt(a.rawDist);
    const bd = BigInt(b.rawDist);
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
}

/** Pick the best eligible peer for a task (first eligible in ranked list). */
export function routeToPeer(ranked, task) {
  return ranked.find((r) => r.eligible) || null;
}

export { makeNodeId };
