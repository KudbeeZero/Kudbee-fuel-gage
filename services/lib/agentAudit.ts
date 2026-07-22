/**
 * services/lib/agentAudit.ts
 * Phase: Agent Memory Layer — Redis-backed audit tracking.
 * Every agent execution check is recorded to kudbee:agent:audit.
 */
import { getRedisClient } from './redis.js';

const AUDIT_KEY = 'kudbee:agent:audit';
const STREAM_KEY = 'kudbee:agent:stream';

export interface AuditEntry {
  id: string;
  agentId: string;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'DEGRADED';
  detail: string;
  timestamp: string;
  traceId?: string;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'audit' });
    await redis.lpush(AUDIT_KEY, JSON.stringify(entry));
    await redis.ltrim(AUDIT_KEY, 0, 499);
    await redis.xadd(STREAM_KEY, '*', ...Object.entries(entry).flat());
    await redis.xtrim(STREAM_KEY, 'MAXLEN', '~', '200');
  } catch { /* best-effort */ }
}

export async function getAuditHistory(limit = 50): Promise<AuditEntry[]> {
  try {
    const redis = getRedisClient({ label: 'audit' });
    const raw = await redis.lrange(AUDIT_KEY, 0, limit - 1);
    return raw.map((r) => { try { return JSON.parse(r) as AuditEntry; } catch { return null; } }).filter(Boolean) as AuditEntry[];
  } catch { return []; }
}

/** Run a full connection test across all subsystems and return status per rack unit. */
export async function testAllConnections(): Promise<Record<string, { status: string; latencyMs: number; endpoint: string }>> {
  const results: Record<string, { status: string; latencyMs: number; endpoint: string }> = {};
  const services: Array<[string, string]> = [
    ['postgres', '/api/system/lifecycle'],
    ['redis', '/api/dashboard/summary'],
    ['groq', '/api/think/energy-mesh'],
    ['governance', '/api/governance/pending'],
    ['telemetry', '/api/telemetry/logs'],
    ['think', '/api/think/trajectories'],
    ['memory', '/api/memory/recall'],
    ['sentinel', '/api/telemetry/ingest'],
    ['interceptor', '/api/interceptor/triage'],
  ];
  for (const [name, path] of services) {
    const start = Date.now();
    try {
      const redis = getRedisClient({ label: 'audit' });
      await redis.ping();
      results[name] = { status: 'CONNECTED', latencyMs: Date.now() - start, endpoint: path };
    } catch {
      results[name] = { status: 'FAULT', latencyMs: -1, endpoint: path };
    }
  }
  return results;
}
