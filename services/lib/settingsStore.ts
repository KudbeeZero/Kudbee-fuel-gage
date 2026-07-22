/**
 * services/lib/settingsStore.ts
 * Phase: Settings Persistence
 * In-memory + Redis settings store with per-tenant configuration.
 */
import { getRedisClient } from './redis.js';

const SETTINGS_PREFIX = 'kudbee:settings:';
const DEFAULT_TENANT = 'default';

export interface TenantSettings {
  theme?: string;
  density?: string;
  currency?: string;
  reducedMotion?: boolean;
  piiRedaction?: boolean;
  promptShield?: boolean;
  semanticRouting?: boolean;
  strictMode?: boolean;
  allowTelemetry?: boolean;
  deepPacketInspection?: boolean;
  costGateEnabled?: boolean;
  blockTools?: boolean;
  confidenceGateEnabled?: boolean;
}

const memory: Record<string, TenantSettings> = {};

export async function getSettings(tenantId = DEFAULT_TENANT): Promise<TenantSettings> {
  try {
    const redis = getRedisClient({ label: 'settings' });
    const raw = await redis.get(SETTINGS_PREFIX + tenantId);
    if (raw) return JSON.parse(raw);
  } catch {}
  return memory[tenantId] || {};
}

export async function saveSettings(tenantId: string, settings: TenantSettings): Promise<TenantSettings> {
  const existing = await getSettings(tenantId);
  const merged = { ...existing, ...settings, updatedAt: new Date().toISOString() } as TenantSettings;
  try {
    const redis = getRedisClient({ label: 'settings' });
    await redis.set(SETTINGS_PREFIX + tenantId, JSON.stringify(merged));
  } catch {}
  memory[tenantId] = merged;
  return merged;
}
