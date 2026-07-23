interface DbPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
}

declare module '../lib/db.js' {
  export function getDbPool(): DbPool | null;
  export function isDbHealthy(): boolean;
  export function closeDbPool(): Promise<void>;
  export function runQuery(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  export function runInsert(sql: string, params?: unknown[]): Promise<{ id: unknown; changes: number }>;
  export const dbTelemetry: {
    primaryQueryCount: number;
    fallbackQueryCount: number;
    primaryInsertCount: number;
    fallbackInsertCount: number;
  };
}

export {};
