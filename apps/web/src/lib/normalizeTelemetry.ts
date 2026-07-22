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
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => normalizeTelemetryLog(row as RawTelemetryLog));
}