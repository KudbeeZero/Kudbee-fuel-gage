/**
 * services/lib/ecpMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — ECP Singleflight Cache middleware.
 *
 * Deduplicates concurrent identical requests. If N identical requests
 * arrive simultaneously, only 1 executes the handler; the other N-1
 * await the same Promise and receive the identical response.
 *
 * Cache key: `${method}:${path}:${hash(body)}`
 * TTL: 5s per in-flight promise (evicted on resolution or timeout)
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { MiddlewareGuard } from './middlewareGuard.ts';

export const ecpGuard = new MiddlewareGuard('ecp-singleflight', 3, 60_000);

const IN_FLIGHT_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  promise: Promise<void>;
  createdAt: number;
  key: string;
}

const inFlight = new Map<string, CacheEntry>();

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

function pruneStaleEntries(): void {
  const now = Date.now();
  if (inFlight.size > MAX_CACHE_ENTRIES) {
    for (const [key, entry] of inFlight.entries()) {
      if (now - entry.createdAt > IN_FLIGHT_TTL_MS) {
        inFlight.delete(key);
      }
    }
  }
}

export function ecpSingleflight() {
  return ecpGuard.wrap(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    pruneStaleEntries();

    const key = buildCacheKey(req);

    const existing = inFlight.get(key);
    if (existing) {
      const elapsed = Date.now() - existing.createdAt;
      if (elapsed < IN_FLIGHT_TTL_MS) {
        try {
          await existing.promise;
        } catch {
          // If the in-flight request errored, proceed normally
          inFlight.delete(key);
          return next();
        }
        return;
      }
      inFlight.delete(key);
    }

    if (inFlight.size >= MAX_CACHE_ENTRIES) {
      return next();
    }

    let resolvePromise: () => void;
    let rejectPromise: (err: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const entry: CacheEntry = {
      promise,
      createdAt: Date.now(),
      key,
    };
    inFlight.set(key, entry);

    const originalEnd = res.end.bind(res);
    res.end = function (...args: any[]) {
      resolvePromise!();
      return originalEnd(...args);
    } as any;

    res.on('close', () => {
      resolvePromise!();
      inFlight.delete(key);
    });

    res.on('error', () => {
      rejectPromise!(new Error('Response error'));
      inFlight.delete(key);
    });

    setTimeout(() => {
      rejectPromise!(new Error('ECP timeout'));
      inFlight.delete(key);
    }, IN_FLIGHT_TTL_MS);

    return next();
  });
}

export function getEcpStats() {
  return {
    guard: ecpGuard.stats(),
    inFlightSize: inFlight.size,
    maxEntries: MAX_CACHE_ENTRIES,
  };
}
