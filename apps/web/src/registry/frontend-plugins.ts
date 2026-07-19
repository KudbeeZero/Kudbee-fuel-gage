/**
 * apps/web/src/registry/frontend-plugins.ts
 * ---------------------------------------------------------------------------
 * The "Agentic Rack System" registry. Centralizes plugin metadata and live
 * status so the dashboard motherboard (RackLayout) and the plugins themselves
 * share a single source of truth.
 *
 * This module is framework-agnostic (pure types + helpers). Components read
 * `PLUGIN_REGISTRY` to know each plugin's grid span, category, and current
 * status; the rack re-derives CSS grid-column spans from `gridSpan.colSpan`.
 *
 * Strictly typed: every field is concrete, NO `any`.
 */
import type { IKudbeePlugin, PluginCategory, PluginStatus } from '@kudbee/types';

export type PluginId = 'think-storm' | 'think-stream' | 'think-storage' | 'governance-gate';

export interface RegisteredPlugin extends IKudbeePlugin {
  /** Human-facing subtitle shown under the plugin title in the rack. */
  subtitle: string;
}

const BASE_PLUGINS: RegisteredPlugin[] = [
  {
    id: 'think-storm',
    title: 'Think: Storm',
    subtitle: 'Reasoning intensity · cognitive load',
    category: 'storm',
    status: 'active',
    gridSpan: { colSpan: 4 }
  },
  {
    id: 'think-stream',
    title: 'Think: Stream',
    subtitle: 'Live chain-of-thought · telemetry',
    category: 'stream',
    status: 'active',
    gridSpan: { colSpan: 4 }
  },
  {
    id: 'think-storage',
    title: 'Think: Storage',
    subtitle: 'Neon DB capacity',
    category: 'storage',
    status: 'active',
    gridSpan: { colSpan: 4 }
  },
  {
    id: 'governance-gate',
    title: 'Governance Gate',
    subtitle: 'Human-in-the-Loop approvals',
    category: 'governance',
    status: 'pending',
    requiresApprovalGate: true,
    gridSpan: { colSpan: 8 }
  }
];

/**
 * In-memory registry. A single mutable copy lets plugins update their own
 * status (e.g. governance-gate flips to 'active' when a PENDING_APPROVAL
 * exists) and the rack react. Kept module-scoped so all consumers share state.
 */
const registry: Map<PluginId, RegisteredPlugin> = new Map(
  BASE_PLUGINS.map((p) => [p.id, { ...p }])
);

export function getPluginRegistry(): RegisteredPlugin[] {
  return Array.from(registry.values()).map((p) => ({ ...p }));
}

export function getPlugin(id: PluginId): RegisteredPlugin | undefined {
  const p = registry.get(id);
  return p ? { ...p } : undefined;
}

/** Update a single plugin's status (Resilient-First: unknown ids are ignored). */
export function setPluginStatus(id: PluginId, status: PluginStatus): void {
  const p = registry.get(id);
  if (p) p.status = status;
}

/** Bulk status update, e.g. when a downstream stream connects/disconnects. */
export function setPluginStatuses(updates: Partial<Record<PluginId, PluginStatus>>): void {
  (Object.keys(updates) as PluginId[]).forEach((id) => {
    const next = updates[id];
    if (next) setPluginStatus(id, next);
  });
}

export function categoryOf(id: PluginId): PluginCategory | undefined {
  return getPlugin(id)?.category;
}

export const RACK_COLUMNS = 12;
