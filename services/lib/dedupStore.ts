/**
 * services/lib/dedupStore.ts — Serverless-safe deduplication store (Step 1)
 * ---------------------------------------------------------------------------
 * The web layer's in-process dedup Map breaks under serverless: multiple
 * instances each have their own Map, so duplicates pass. This backs dedup
 * with Redis (shared across instances) and falls back to an in-process Map
 * only when Redis is unavailable (Resilient-First — never crashes).
 *
 * Pattern: Redis-first, in-memory fallback, TTL cleanup, no long-lived state
 * in the request path. Safe for Lambda/Vercel/Workers because every call is
 * a single Redis op; no timers in the hot path (TTL handles expiry).
 *
 * Usage (server.js):
 *   import { createDedupStore } from '../lib/dedupStore.ts';
 *   const dedup = createDedupStore();
 *   dedup.isDuplicate('trace-123') // → true if seen within window
 * ---------------------------------------------------------------------------
 */

import type { Redis } from 'ioredis';

const DEFAULT_WINDOW_MS = 5_000;
const KEY_PREFIX = 'kudbee:dedup:';

/**
 * Create a dedup store. Pass an injected `redis` client when available; the
 * store falls back to in-memory when it isn't. (The redis.js factory import
 * is avoided at module load so tests can construct the store without ioredis.)
 */
export function createDedupStore(opts: { windowMs?: number; redis?: any } = {}) {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const redis = opts.redis ?? null; // caller injects; null → in-memory only

  // In-memory fallback (used only when Redis is unavailable).
  const fallback = new Map<string, number>();

  /**
   * Return true if the key was seen within the window; otherwise record it.
   * Redis path: SET NX with TTL — atomic, shared across instances.
   */
  async function isDuplicate(key: string): Promise<boolean> {
    const fullKey = KEY_PREFIX + String(key || '');
    if (!fullKey) return false;

    if (redis) {
      try {
        // SET NX EX: returns "OK" only if the key did NOT exist → not a dup.
        const result = await redis.set(fullKey, '1', 'EX', Math.ceil(windowMs / 1000), 'NX');
        return result !== 'OK';
      } catch {
        // Redis down → fall through to in-memory (Resilient-First).
      }
    }

    // In-memory fallback with manual cleanup.
    const now = Date.now();
    const seenAt = fallback.get(key);
    if (seenAt !== undefined && now - seenAt < windowMs) return true;
    fallback.set(key, now);
    // Opportunistic cleanup to bound memory.
    if (fallback.size > 10_000) {
      const cutoff = now - windowMs;
      for (const [k, ts] of fallback) if (ts < cutoff) fallback.delete(k);
    }
    return false;
  }

  /** Explicitly clear a key (e.g. after successful processing). */
  async function clear(key: string): Promise<void> {
    if (redis) { try { await redis.del(KEY_PREFIX + key); } catch {} }
    fallback.delete(key);
  }

  return { isDuplicate, clear, _fallbackSize: () => fallback.size };
}

export type DedupStore = ReturnType<typeof createDedupStore>;
