/**
 * services/lib/capabilityTelemetry.ts
 * ---------------------------------------------------------------------------
 * Phase 5B — in-memory capability decision telemetry (observability only).
 *
 * Records capability resolutions without denying anything. No credentials,
 * tokens, or authorization headers are ever stored. Aggregates counts only.
 * ---------------------------------------------------------------------------
 */

import { REGISTRY_VERSION } from './capabilityRegistry.ts';

interface CapabilityDecision {
  agent: string | null;
  route: string;
  required: string | null;
  allowed: boolean;
  enforcement: 'observe';
  ts: number;
}

const state = {
  registryVersion: REGISTRY_VERSION,
  enforcement: 'observe' as 'observe',
  resolutions: 0,
  denials: 0,
  missing: 0,
  missingByCapability: {} as Record<string, number>,
  last: null as CapabilityDecision | null,
};

export function recordCapabilityDecision(d: CapabilityDecision): void {
  state.resolutions++;
  if (!d.allowed) {
    state.missing++;
    if (d.required) {
      state.missingByCapability[d.required] = (state.missingByCapability[d.required] || 0) + 1;
    }
  }
  // Keep only the most recent decision (no history of sensitive data).
  state.last = d;
}

export function getCapabilityTelemetry() {
  return {
    registryVersion: state.registryVersion,
    enforcement: state.enforcement,
    resolutions: state.resolutions,
    denials: state.denials,
    missing: state.missing,
    missingByCapability: state.missingByCapability,
  };
}
