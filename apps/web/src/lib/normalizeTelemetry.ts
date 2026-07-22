/**
 * Normalize telemetry log rows from GET /api/telemetry/logs.
 *
 * The Neon schema / ingestion server emits:
 *   model, tokens_in, tokens_out, cost, trace_id, project_name, …
 *
 * Older UI code expected a different shape:
 *   model_name, input_tokens, output_tokens, calculated_cost, …
 *
 * Reading only the legacy names makes every token cell render blank (0 / —)
 * even when the backend is healthy and returning real data. This helper
 * accepts either shape (and either an array or a wrapped { logs|data|results }
 * payload) and produces a single canonical client row.
 */

export interface TelemetryLogRow {
  id: number | string;
  user_id?: number;
  provider?: string;
  model_name: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  tokens_in?: number;
  tokens_out?: number;
  calculated_cost: number;
  cost?: number;
  project_name?: string;
  timestamp: string;
  status?: string;
  trace_id?: string;
  traceId?: string;
}

/** Loose row as returned by the API or an older client cache. */
export type RawTelemetryLog = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function coerceId(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    // Keep string form when the API returns BIGSERIAL as a string that may
    // exceed Number.MAX_SAFE_INTEGER; otherwise prefer numeric for UI keys.
    if (Number.isFinite(n) && String(n) === value.trim() && n <= Number.MAX_SAFE_INTEGER) {
      return n;
    }
    return value;
  }
  return 0;
}

/**
 * Unwrap telemetry log payloads. The API returns an array today, but the
 * modular sub-routers could be configured to return { logs, data, results }
 * wrappers. Accepting both keeps the UI resilient.
 */
export function unwrapTelemetryLogs(raw: unknown): unknown[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.logs)) return obj.logs;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [];
}

export function normalizeTelemetryLog(raw: RawTelemetryLog | null | undefined): TelemetryLogRow {
  const r = raw && typeof raw === 'object' ? raw : {};

  const tokensIn = num(r.tokens_in ?? r.input_tokens);
  const tokensOut = num(r.tokens_out ?? r.output_tokens);
  const cost = num(r.cost ?? r.calculated_cost);
  const model = str(r.model ?? r.model_name, 'unknown');

  return {
    id: coerceId(r.id),
    user_id: num(r.user_id, 0),
    provider: str(r.provider, 'unknown'),
    model_name: model,
    model,
    input_tokens: tokensIn,
    output_tokens: tokensOut,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    calculated_cost: cost,
    cost,
    project_name: str(r.project_name) || undefined,
    timestamp: str(r.timestamp, new Date().toISOString()),
    status: str(r.status, 'OK') || 'OK',
    trace_id: str(r.trace_id ?? r.traceId) || undefined,
    traceId: str(r.traceId ?? r.trace_id) || undefined
  };
}

export function normalizeTelemetryLogs(raw: unknown): TelemetryLogRow[] {
  return unwrapTelemetryLogs(raw).map((row) => normalizeTelemetryLog(row as RawTelemetryLog));
}

/**
 * Normalize the dashboard summary payload. Accepts either the flat object
 * shape from GET /api/dashboard/summary or a wrapped { data | summary } form.
 */
export function normalizeDashboardSummary(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>;
  }
  if (obj.summary && typeof obj.summary === 'object' && !Array.isArray(obj.summary)) {
    return obj.summary as Record<string, unknown>;
  }
  return obj;
}
