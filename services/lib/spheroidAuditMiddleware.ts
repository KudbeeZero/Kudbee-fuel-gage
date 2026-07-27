/**
 * services/lib/spheroidAuditMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — Spheroid Audit Ledger middleware.
 *
 * Automatically logs every mutating request (POST/PUT/PATCH/DELETE) to the
 * Spheroid audit ledger as a Redis stream. Captures agent identity, payload
 * hash, timestamp, and final response status. Distinct from Hermes (which
 * audits governance decisions) — Spheroid is the low-level operations ledger.
 *
 * Stream: kudbee:spheroid:audit (MAXLEN ~10000)
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { getRedisClient } from './redis.js';
import { MiddlewareGuard } from './middlewareGuard.ts';

export const spheroidGuard = new MiddlewareGuard('spheroid-audit', 5, 45_000);

const STREAM_KEY = 'kudbee:spheroid:audit';
const MAX_STREAM_LEN = 10000;
const PAYLOAD_TRUNCATE_BYTES = 4096;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface SpheroidAuditEntry {
  agentId: string;
  method: string;
  path: string;
  statusCode: string;
  durationMs: string;
  ip: string;
  userAgent: string;
  payloadHash: string;
  payloadTrunc: string;
  timestamp: string;
  traceId: string;
}

function hashPayload(payload: unknown): string {
  if (!payload) return '';
  try {
    if (typeof payload === 'string') return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
    const json = JSON.stringify(payload).slice(0, PAYLOAD_TRUNCATE_BYTES);
    return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  } catch {
    return 'hash-error';
  }
}

async function writeAuditEntry(redis: any, entry: SpheroidAuditEntry): Promise<void> {
  try {
    const fields: string[] = [];
    for (const [key, value] of Object.entries(entry)) {
      fields.push(key, value);
    }
    await redis.xadd(STREAM_KEY, '*', ...fields);
    await redis.xtrim(STREAM_KEY, 'MAXLEN', '~', String(MAX_STREAM_LEN));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[spheroid-audit] Failed to write audit entry: ${msg}`);
  }
}

export function spheroidAudit() {
  return spheroidGuard.wrap(async (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const start = Date.now();

    res.on('finish', async () => {
      try {
        const redis = getRedisClient({ label: 'spheroid-audit' });
        if (!redis) return;

        const entry: SpheroidAuditEntry = {
          agentId: ((req as any).agentId as string) || 'anonymous',
          method: req.method,
          path: req.path,
          statusCode: String(res.statusCode),
          durationMs: String(Date.now() - start),
          ip: (req.ip as string) || (req.socket?.remoteAddress as string) || 'unknown',
          userAgent: (req.headers['user-agent'] as string) || 'unknown',
          payloadHash: hashPayload(req.body),
          payloadTrunc: req.body ? JSON.stringify(req.body).slice(0, PAYLOAD_TRUNCATE_BYTES) : '',
          timestamp: new Date().toISOString(),
          traceId: (req.headers['x-trace-id'] as string) || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };

        await writeAuditEntry(redis, entry);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[spheroid-audit] Audit write degraded: ${msg}`);
      }
    });

    return next();
  });
}

export function getSpheroidAuditStats() {
  return spheroidGuard.stats();
}

export { STREAM_KEY, MAX_STREAM_LEN };
