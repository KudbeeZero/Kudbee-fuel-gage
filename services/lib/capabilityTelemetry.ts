/**
 * services/lib/capabilityTelemetry.ts
 * ---------------------------------------------------------------------------
 * Phase 5C/D — in-memory capability decision telemetry (observation window).
 *
 * Records capability resolutions without storing any credentials, tokens, or
 * authorization headers. Aggregates counts only.
 *
 * Tracks:
 *   - aggregate resolutions/allowed/denials/missing
 *   - per-agent breakdown (allowed/denied per capability)
 *   - per-endpoint breakdown (allowed/denied + required capability)
 *
 * Overall enforcement mode is 'partial' — the three high-risk capability
 * classes (terminal/fs/shell) are enforced; everything else is observe-only.
 * ---------------------------------------------------------------------------
 */

import { REGISTRY_VERSION, ENFORCED_CAPABILITIES } from './capabilityRegistry.ts';

interface CapabilityDecision {
  agent: string | null;
  route: string;
  required: string | null;
  allowed: boolean;
  enforcement: 'observe' | 'enforce';
  ts: number;
}

const state = {
  registryVersion: REGISTRY_VERSION,
  enforcement: 'partial' as 'partial',
  enforcedCapabilities: ENFORCED_CAPABILITIES,
  resolutions: 0,
  allowed: 0,
  denials: 0,
  missing: 0,
  missingByCapability: {} as Record<string, number>,
  byAgent: {} as Record<string, { allowed: number; denied: number; byCapability: Record<string, number> }>,
  byEndpoint: {} as Record<string, { required: string | null; allowed: number; denied: number }>,
  last: null as CapabilityDecision | null,
};

export function recordCapabilityDecision(d: CapabilityDecision): void {
  state.resolutions++;
  if (d.allowed) {
    state.allowed++;
  } else {
    state.denials++;
    state.missing++;
    if (d.required) {
      state.missingByCapability[d.required] = (state.missingByCapability[d.required] || 0) + 1;
    }
  }

  // Per-agent breakdown.
  const agentKey = d.agent || 'anonymous';
  const a = (state.byAgent[agentKey] = state.byAgent[agentKey] || { allowed: 0, denied: 0, byCapability: {} });
  if (d.allowed) a.allowed++;
  else a.denied++;
  if (d.required) {
    a.byCapability[d.required] = (a.byCapability[d.required] || 0) + 1;
  }

  // Per-endpoint breakdown.
  const e = (state.byEndpoint[d.route] = state.byEndpoint[d.route] || { required: d.required, allowed: 0, denied: 0 });
  if (d.allowed) e.allowed++;
  else e.denied++;

  state.last = d;
}

export function getCapabilityTelemetry() {
  return {
    registryVersion: state.registryVersion,
    enforcement: state.enforcement,
    enforcedCapabilities: state.enforcedCapabilities,
    resolutions: state.resolutions,
    allowed: state.allowed,
    denials: state.denials,
    missing: state.missing,
    missingByCapability: state.missingByCapability,
    byAgent: state.byAgent,
    byEndpoint: state.byEndpoint,
  };
}

export function resetCapabilityTelemetry(): void {
  state.resolutions = 0;
  state.allowed = 0;
  state.denials = 0;
  state.missing = 0;
  state.missingByCapability = {};
  state.byAgent = {};
  state.byEndpoint = {};
  state.last = null;
}
