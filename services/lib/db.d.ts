/**
 * services/lib/db.d.ts
 * ---------------------------------------------------------------------------
 * Ambient module declaration for the resilient Neon Postgres connection
 * factory (services/lib/db.js). The runtime module is plain JS; this lets
 * strict TypeScript consumers (e.g. @kudbee/memory) import it without an
 * implicit `any`. Only the surface used by the vector layer is typed.
 * ---------------------------------------------------------------------------
 */

declare module '../lib/db.js' {
  import type { Pool } from 'pg';

  export function getDbPool(): Pool | null;
  export function isDbHealthy(): boolean;
  export function closeDbPool(): Promise<void>;
  export async function runQuery(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  export async function runInsert(
    sql: string,
    params?: unknown[]
  ): Promise<{ id: unknown; changes: number }>;

  export const dbTelemetry: {
    primaryQueryCount: number;
    fallbackQueryCount: number;
    primaryInsertCount: number;
    fallbackInsertCount: number;
  };
}

export {};
