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

export const SecurityViolationSchema = z.object({
  id: z.number().int(),
  payload: z.unknown(),
  violation_reason: z.string(),
  timestamp: z.string()
});
export type SecurityViolation = z.infer<typeof SecurityViolationSchema>;

export const TriageQueueSchema = z.array(SecurityViolationSchema);
export type TriageQueue = z.infer<typeof TriageQueueSchema>;

export const ZodIssueSchema = z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string()
});
export type ZodIssue = z.infer<typeof ZodIssueSchema>;

export const AgentPassSchema = z.object({
  agentId: z.string().min(1),
  issuedAt: z.number().int(),
  signature: z.string().min(1)
});
export type AgentPass = z.infer<typeof AgentPassSchema>;

export const RegisteredAgentSchema = z.object({
  agentId: z.string().min(1),
  publicKey: z.string().min(1),
  status: z.string().default('active'),
  createdAt: z.string().optional()
});
export type RegisteredAgent = z.infer<typeof RegisteredAgentSchema>;

export const AgentRegistrySchema = z.object({
  registry: z.array(RegisteredAgentSchema)
});
export type AgentRegistry = z.infer<typeof AgentRegistrySchema>;

export const MemoryRecallSchema = z.object({
  trace_id: z.string().min(1),
  thought_summary: z.string().default(''),
  reasoning: z.string().default(''),
  model: z.string().default('unknown'),
  similarity: z.number()
});
export type MemoryRecall = z.infer<typeof MemoryRecallSchema>;

export const MemoryRecallListSchema = z.array(MemoryRecallSchema);
export type MemoryRecallList = z.infer<typeof MemoryRecallListSchema>;

export const MemoryRecallQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(20).default(3)
});
export type MemoryRecallQuery = z.infer<typeof MemoryRecallQuerySchema>;
