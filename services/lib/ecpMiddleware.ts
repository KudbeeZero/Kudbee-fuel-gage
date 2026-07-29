/**
 * services/lib/ecpMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — ECP Singleflight Cache middleware.
 *
 * Deduplicates concurrent identical GET requests. If N identical requests
 * arrive simultaneously, only 1 executes; the other N-1 receive the
 * identical response replayed from the original.
 *
 * Cache key: `${method}:${path}:${hash(body)}`
 * TTL: 5s per entry (evicted on resolution, timeout, or periodic sweep)
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { MiddlewareGuard } from './middlewareGuard.ts';

export const ecpGuard = new MiddlewareGuard('ecp-singleflight', 3, 60_000);

const IN_FLIGHT_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 500;
const PERIODIC_SWEEP_MS = 30_000;

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface CacheEntry {
  promise: Promise<CachedResponse | null>;
  createdAt: number;
  key: string;
}

const inFlight = new Map<string, CacheEntry>();

const ecpMetrics = { hits: 0, misses: 0, coalesced: 0, errors: 0 };

function resetEcpMetrics(): void {
  ecpMetrics.hits = 0;
  ecpMetrics.misses = 0;
  ecpMetrics.coalesced = 0;
  ecpMetrics.errors = 0;
}

function hashPayload(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  try {
    const sorted = JSON.stringify(body, Object.keys(body as Record<string, unknown>).sort());
    return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 12);
  } catch {
    return '';
  }
}

function buildCacheKey(req: Request): string {
  const bodyHash = hashPayload(req.body);
  return `${req.method}:${req.path}:${bodyHash}`;
}

function replayResponse(res: Response, cached: CachedResponse): void {
  for (const [name, value] of Object.entries(cached.headers)) {
    if (value !== undefined && name.toLowerCase() !== 'content-length') {
      res.setHeader(name, value as any);
    }
  }
  res.status(cached.statusCode).json(cached.body);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inFlight.entries()) {
    if (now - entry.createdAt > IN_FLIGHT_TTL_MS) {
      inFlight.delete(key);
    }
  }
}, PERIODIC_SWEEP_MS);

export function ecpSingleflight() {
  return ecpGuard.wrap(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = buildCacheKey(req);

    const existing = inFlight.get(key);
    if (existing) {
      const elapsed = Date.now() - existing.createdAt;
      if (elapsed < IN_FLIGHT_TTL_MS) {
        let cached: CachedResponse | null = null;
        try {
          cached = await existing.promise;
        } catch {
          ecpMetrics.errors++;
          inFlight.delete(key);
          return next();
        }
        if (cached) {
          ecpMetrics.coalesced++;
          replayResponse(res, cached);
          return;
        }
        ecpMetrics.errors++;
        return next();
      }
      ecpMetrics.errors++;
      inFlight.delete(key);
    }

    ecpMetrics.misses++;

    if (inFlight.size >= MAX_CACHE_ENTRIES) {
      return next();
    }

    const capturedHeaders: Record<string, string | string[] | undefined> = {};
    let capturedStatusCode = 200;
    let capturedBody: unknown = null;

    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = function (name: string, value: any) {
      capturedHeaders[name.toLowerCase()] = value;
      return originalSetHeader(name, value);
    };

    const originalStatus = res.status.bind(res);
    res.status = function (code: number) {
      capturedStatusCode = code;
      return originalStatus(code);
    };

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      capturedBody = body;
      return originalJson(body);
    };

    let resolvePromise: (result: CachedResponse | null) => void = () => {};
    let settled = false;

    const promise = new Promise<CachedResponse | null>((resolve) => {
      resolvePromise = resolve;
    });

    const entry: CacheEntry = { promise, createdAt: Date.now(), key };
    inFlight.set(key, entry);

    res.on('finish', () => {
      if (!settled) {
        settled = true;
        resolvePromise({
          statusCode: capturedStatusCode,
          headers: capturedHeaders,
          body: capturedBody,
        });
        inFlight.delete(key);
      }
    });

    res.on('close', () => {
      if (!settled) {
        settled = true;
        resolvePromise(null);
        inFlight.delete(key);
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolvePromise(null);
        inFlight.delete(key);
      }
    }, IN_FLIGHT_TTL_MS);

    return next();
  });
}

export function getEcpStats() {
  return {
    guard: ecpGuard.stats(),
    inFlightSize: inFlight.size,
    maxEntries: MAX_CACHE_ENTRIES,
    metrics: { ...ecpMetrics },
    hitRatio: ecpMetrics.misses + ecpMetrics.coalesced > 0
      ? (ecpMetrics.coalesced / (ecpMetrics.misses + ecpMetrics.coalesced) * 100).toFixed(1) + '%'
      : '0.0%',
  };
}

export { ecpMetrics, resetEcpMetrics };
