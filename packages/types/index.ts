import { z } from 'zod';

export const TelemetryStatusSchema = z.string().min(1).default('OK');
export type TelemetryStatus = z.infer<typeof TelemetryStatusSchema>;

export const TelemetryTraceSchema = z.object({
  trace_id: z.string().min(1),
  model: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  status: TelemetryStatusSchema.default('OK'),
  provider: z.string().default('unknown'),
  project_name: z.string().default('kilo-fuel-gauge'),
  timestamp: z.string().optional()
});
export type TelemetryTrace = z.infer<typeof TelemetryTraceSchema>;

export const IngestRequestSchema = TelemetryTraceSchema;
export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const CsvInjectItemSchema = TelemetryTraceSchema.partial({
  trace_id: true,
  status: true,
  provider: true,
  project_name: true,
  timestamp: true
});
export const CsvInjectRequestSchema = z.object({
  logs: z.array(CsvInjectItemSchema)
});
export type CsvInjectRequest = z.infer<typeof CsvInjectRequestSchema>;

export const DashboardSummarySchema = z.object({
  total_24h_cost: z.number(),
  total_historical_tokens: z.number(),
  total_active_models: z.number(),
  health_matrix: z.array(z.unknown())
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const ProxyResolveSchema = z.object({
  success: z.boolean()
});
export type ProxyResolve = z.infer<typeof ProxyResolveSchema>;
