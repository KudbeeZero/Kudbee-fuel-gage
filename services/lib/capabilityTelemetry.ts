/**
 * services/lib/capabilityTelemetry.ts
 * ---------------------------------------------------------------------------
 * Phase 5C — in-memory capability decision telemetry.
 *
 * Records capability resolutions without storing any credentials, tokens, or
 * authorization headers. Aggregates counts only.
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
  };
}
