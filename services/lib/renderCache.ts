/**
 * services/lib/renderCache.ts
 * ---------------------------------------------------------------------------
 * Render Postgres hot cache — same-region private-network speed for small,
 * high-frequency reads. The user provisions RENDER_PG_URL (Render Postgres,
 * free tier = 1GB disk). This module is STRICTLY guarded:
 *
 *   - Active ONLY when RENDER_PG_URL is set. Otherwise it is a no-op that
 *     falls back to the caller's fetcher (never throws, never crashes boot).
 *   - Hard size caps keep the 1GB disk safe: max payload per row, max total
 *     rows, and TTL cleanup on every write. Rows are deleted lazily as they
 *     expire; nothing is ever written without a TTL.
 *   - Connection is a single lazy pg.Pool with a tiny max (2) — free-tier
 *     Render Postgres caps connections, so never open per-request clients.
 *
 * Pattern for callers (mirrors services/lib/cache.ts):
 *   const data = await withRenderCache('rate:ip:1.2.3.4', 300, () => fetchCount());
 * ---------------------------------------------------------------------------
 */

import { Pool } from 'pg';

const RENDER_PG_URL = process.env.RENDER_PG_URL || '';
const MAX_PAYLOAD_BYTES = 8 * 1024; // 8KB per value — keeps the 1GB disk small
const MAX_ROWS = 10_000; // hard ceiling on total cached rows
const CLEANUP_PCT = 0.2; // when at MAX_ROWS, delete 20% oldest rows first

let _pool: Pool | null = null;
let _enabled = false;
let _tableReady: Promise<boolean> | null = null;

const renderCacheTelemetry = { reads: 0, writes: 0, evictions: 0, disabled: 0 };

function getPool(): Pool | null {
  if (!RENDER_PG_URL) {
    renderCacheTelemetry.disabled++;
    return null;
  }
  if (!_pool) {
    _pool = new Pool({ connectionString: RENDER_PG_URL, max: 2, idleTimeoutMillis: 30_000 });
  }
  return _pool;
}

async function ensureTable(pool: Pool): Promise<boolean> {
  if (!_tableReady) {
    _tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS render_cache (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL,
           expires_at BIGINT NOT NULL,
           created_at BIGINT NOT NULL
         )`
      )
      .then(() => true)
      .catch((err) => {
        console.warn('[renderCache] table init failed — cache disabled:', err instanceof Error ? err.message : String(err));
        return false;
      });
  }
  return _tableReady;
}

async function enforceBudget(pool: Pool): Promise<void> {
  try {
    const now = Date.now();
    const expired = await pool.query('DELETE FROM render_cache WHERE expires_at <= $1', [now]);
    if ((expired.rowCount ?? 0) > 0) renderCacheTelemetry.evictions += expired.rowCount ?? 0;
    const count = await pool.query('SELECT count(*)::int AS n FROM render_cache');
    if (count.rows[0]?.n > MAX_ROWS) {
      const excess = count.rows[0].n - Math.floor(MAX_ROWS * (1 - CLEANUP_PCT));
      const removed = await pool.query(
        'DELETE FROM render_cache WHERE key IN (SELECT key FROM render_cache ORDER BY created_at ASC LIMIT $1)',
        [Math.max(excess, 1)]
      );
      if ((removed.rowCount ?? 0) > 0) renderCacheTelemetry.evictions += removed.rowCount ?? 0;
    }
  } catch {
    /* best-effort budget enforcement */
  }
}

/**
 * Cached read-through with TTL. Active only when RENDER_PG_URL is set;
 * otherwise (or on any error) transparently falls back to fetcher().
 */
export async function withRenderCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const pool = getPool();
  if (!pool) return fetcher();

  try {
    if (!(await ensureTable(pool))) return fetcher();
    const now = Date.now();
    const hit = await pool.query('SELECT value FROM render_cache WHERE key = $1 AND expires_at > $2', [key, now]);
    if (hit.rows[0]?.value !== undefined) {
      renderCacheTelemetry.reads++;
      return JSON.parse(hit.rows[0].value) as T;
    }

    const result = await fetcher();
    const payload = JSON.stringify(result);
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      // Too big for the hot cache — serve it but do not store it.
      return result;
    }

    await enforceBudget(pool);
    await pool.query(
      `INSERT INTO render_cache (key, value, expires_at, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, created_at = EXCLUDED.created_at`,
      [key, payload, now + ttlSeconds * 1000, now]
    );
    renderCacheTelemetry.writes++;
    return result;
  } catch {
    return fetcher();
  }
}

/** Remove a single key (for invalidation on write-through). */
export async function invalidateRenderCache(key: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    if (!(await ensureTable(pool))) return;
    await pool.query('DELETE FROM render_cache WHERE key = $1', [key]);
  } catch {
    /* best-effort */
  }
}

/** Cheap health probe: 1 if the cache is live, 0 otherwise. */
export async function renderCacheHealth(): Promise<{ enabled: boolean; status: string; rows?: number }> {
  const pool = getPool();
  if (!pool) return { enabled: false, status: 'disabled' };
  try {
    if (!(await ensureTable(pool))) return { enabled: false, status: 'unavailable' };
    const count = await pool.query('SELECT count(*)::int AS n FROM render_cache');
    return { enabled: true, status: 'ok', rows: count.rows[0]?.n ?? 0 };
  } catch {
    return { enabled: false, status: 'unavailable' };
  }
}

export { renderCacheTelemetry };
