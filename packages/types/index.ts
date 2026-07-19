import { z } from 'zod';

export const TelemetryStatusSchema = z.string().min(1).default('OK');
export type TelemetryStatus = z.infer<typeof TelemetryStatusSchema>;

export const TelemetryTraceSchema = z.object({
  trace_id: z.string().min(1).max(255),
  model: z.string().min(1).max(100),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  status: TelemetryStatusSchema.default('OK'),
  provider: z.string().max(100).default('unknown'),
  project_name: z.string().max(100).default('kilo-fuel-gauge'),
  thought_summary: z.string().max(2000).default(''),
  reasoning: z.string().max(5000).default(''),
  timestamp: z.string().optional()
}).strict();
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

// --- Phase 6: Partner Portal / Governance ---

// Community value score attributed to a verified (signed-off) trace.
export const ValueScoreSchema = z.object({
  trace_id: z.string().min(1),
  value_score: z.number().min(0).max(100)
});
export type ValueScore = z.infer<typeof ValueScoreSchema>;

// A governance action is a cryptographically signed "verification" performed by a
// partner/agent against a telemetry trace. Persisted as type: 'GOVERNANCE_ACTION'.
export const GovernanceActionSchema = z.object({
  id: z.number().int(),
  trace_id: z.string().min(1),
  action: z.string().default('VERIFY'),
  type: z.string().default('GOVERNANCE_ACTION'),
  agent_id: z.string(),
  signature: z.string().min(1),
  signed_payload: z.string(),
  value_score: z.number().min(0).max(100).default(0),
  timestamp: z.string()
});
export type GovernanceAction = z.infer<typeof GovernanceActionSchema>;

export const GovernanceFeedSchema = z.array(GovernanceActionSchema);
export type GovernanceFeed = z.infer<typeof GovernanceFeedSchema>;

export const GovernanceVerifyRequestSchema = z.object({
  trace_id: z.string().min(1),
  agent_id: z.string().min(1),
  agent_pass: z.string().min(1),
  value_score: z.number().min(0).max(100).default(0),
  note: z.string().optional()
});
export type GovernanceVerifyRequest = z.infer<typeof GovernanceVerifyRequestSchema>;

export const CommunityValueResponseSchema = z.object({
  community_value_score: z.number(),
  verified_traces: z.number(),
  governance_actions: z.number()
});
export type CommunityValueResponse = z.infer<typeof CommunityValueResponseSchema>;
