/**
 * services/lib/breadcrumbs.ts
 * ---------------------------------------------------------------------------
 * Phase 49 — Groq Auto-Diagnostic Engine ("Trunk Breadcrumbs").
 *
 * Lightweight error tracing: every error, degradation, or anomaly in the
 * ingestion pipeline drops a breadcrumb into the Redis stream
 * kudbee:breadcrumbs. The diagnose endpoint replays breadcrumbs through
 * Groq for instant root-cause analysis.
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from './redis.js';

const STREAM_KEY = 'kudbee:breadcrumbs';
const MAX_LEN = 500;

export interface Breadcrumb {
  traceId: string;
  source: string;
  errorDelta: string;
  stackTrace: string;
  serviceState: string;
  timestamp: string;
}

export async function logBreadcrumb(
  source: string,
  error: unknown,
  traceId?: string
): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'breadcrumbs' });
    const entry: Breadcrumb = {
      traceId: traceId || `trace-${Date.now()}`,
      source,
      errorDelta: error instanceof Error ? error.message : String(error),
      stackTrace: error instanceof Error ? (error.stack || '').split('\n').slice(0, 3).join(' | ') : '',
      serviceState: 'active',
      timestamp: new Date().toISOString()
    };
    await redis.xadd(STREAM_KEY, '*', ...Object.entries(entry).flat());
    await redis.xtrim(STREAM_KEY, 'MAXLEN', '~', String(MAX_LEN));
  } catch { /* best-effort */ }
}

export async function getBreadcrumbs(traceId: string, count = 20): Promise<Breadcrumb[]> {
  try {
    const redis = getRedisClient({ label: 'breadcrumbs' });
    const results = await redis.xrange(STREAM_KEY, '-', '+', 'COUNT', count);
    const crumbs: Breadcrumb[] = [];
    for (const [, fields] of results) {
      const c: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) c[fields[i]] = fields[i + 1];
      if (!traceId || c.traceId === traceId) {
        crumbs.push(c as unknown as Breadcrumb);
      }
    }
    return crumbs;
  } catch {
    return [];
  }
}
