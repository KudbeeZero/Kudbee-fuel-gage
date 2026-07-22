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

// --- HITL Governance Gate (Human-in-the-Loop) -------------------------------
// A proposed agent action awaiting human approval before execution. Surfaced
// in the dashboard as a high-priority "Governance Intervention Required" card.
// Strictly typed: every field is concrete, NO `any`. Union status enforces the
// only three legal lifecycle states at the type level.

export const ApprovalStatusSchema = z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().min(1),
  proposed_model: z.string().default('unknown'),
  estimated_cost: z.number().nonnegative().default(0),
  reasoning_tokens: z.number().int().nonnegative().default(0),
  status: ApprovalStatusSchema.default('PENDING_APPROVAL'),
  agent_id: z.string().optional(),
  task: z.string().optional(),
  reasoning: z.string().optional(),
  created_at: z.string().optional()
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// The only valid decisions a human can return to the HITL gate.
export type ApprovalDecision = 'APPROVE' | 'REJECT';

export const ApprovalDecisionSchema = z.enum(['APPROVE', 'REJECT']);
export type ApprovalDecisionType = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalResolutionSchema = z.object({
  id: z.string().min(1),
  decision: ApprovalDecisionSchema,
  success: z.boolean(),
  action: z.unknown().optional()
});
export type ApprovalResolution = z.infer<typeof ApprovalResolutionSchema>;

// --- Think: Stream (chain-of-thought reasoning tokens) ---------------------
// A single archived reasoning block returned by GET /api/think/archive.
export const ThinkThoughtSchema = z.object({
  id: z.number().int(),
  agent_id: z.string(),
  task: z.string().nullable().optional(),
  phase: z.string().nullable().optional(),
  thought: z.string(),
  tokens_in: z.number().int().nonnegative().default(0),
  tokens_out: z.number().int().nonnegative().default(0),
  model: z.string().default('reasoning'),
  created_at: z.string().optional()
});
export type ThinkThought = z.infer<typeof ThinkThoughtSchema>;

export const ThinkArchiveResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  thoughts: z.array(ThinkThoughtSchema)
});
export type ThinkArchiveResponse = z.infer<typeof ThinkArchiveResponseSchema>;

// --- Plugin registry definitions (re-exported for root-level import) ----------
export * from './plugin.ts';

// --- Phase 5: Self-Aware Architecture / Vector Memory Chunk -------------------
// Canonical contract for a single embedded unit of system topology (laws,
// routing maps, schema definitions). Ingested by services/memory and stored in
// the system_topology_embeddings pgvector table. Strictly typed — no any.

export const VectorMemoryChunkSchema = z.object({
  chunk_text: z.string().min(1),
  metadata: z.object({
    category: z.enum(['law', 'router', 'schema', 'layout', 'config', 'doc', 'prompt']),
    file_path: z.string().min(1),
    version: z.string().default('1.0.0'),
    tags: z.array(z.string()).default([]),
    chunk_index: z.string().optional(),
    chunk_total: z.string().optional()
  }),
  embedding: z.array(z.number()).min(1)
});
export type VectorMemoryChunk = z.infer<typeof VectorMemoryChunkSchema>;

// --- Phase 6: Agent Context Factory & Dynamic Skills Tagging -----------------
// Dynamic prompt assembly: instead of one static system prompt, the agent
// context is assembled per-task from a BASE_IDENTITY, the IMMUTABLE_LAWS (NEVER
// omitted), the DYNAMIC_SKILLS injected by the active SkillTags, and an
// automatic GOVERNANCE_GATE when any active skill mutates/destroys state.

// The canonical identifiers of our Immutable Laws, exactly as codified in
// packages/utils/src/prompts/agent-core.ts (PRIMARY_AGENT_SYSTEM_PROMPT).
export const ImmutableLawIdSchema = z.enum([
  'NODE22_ESM_EXT',
  'ZERO_ANY',
  'EXPLICIT_ESM_EXTENSION',
  'STRICT_TYPECHECK',
  'BLUEPRINT_FIRST'
]);
export type ImmutableLawId = z.infer<typeof ImmutableLawIdSchema>;

// The immutable law catalog: id -> human-readable summary. Used by the
// context factory to render only the laws referenced by the active skills.
export const IMMUTABLE_LAWS: ReadonlyArray<{
  id: ImmutableLawId;
  summary: string;
}> = [
  {
    id: 'NODE22_ESM_EXT',
    summary:
      'NODE 22 ESM .ts vs .js LAW — type stripping only works in .ts files; .js files are 100% vanilla ES modules with no type annotations.'
  },
  {
    id: 'ZERO_ANY',
    summary:
      'ZERO any LAW — the `any` type is strictly forbidden; prefer concrete interfaces, literal unions, and `unknown` + narrowing. No @ts-ignore/@ts-expect-error.'
  },
  {
    id: 'EXPLICIT_ESM_EXTENSION',
    summary:
      'EXPLICIT ESM EXTENSION LAW — all cross-workspace relative imports MUST use explicit .ts extensions; workspace subpaths resolve via the package "exports" map.'
  },
  {
    id: 'STRICT_TYPECHECK',
    summary:
      'STRICT TYPECHECK LAW — every change MUST pass `tsc --noEmit` with zero errors; narrow uncertain types instead of widening to any.'
  },
  {
    id: 'BLUEPRINT_FIRST',
    summary:
      'BLUEPRINT-FIRST LAW — before writing routes, modifying schemas, or changing infrastructure, query the vector memory layer to inspect the verified architecture.'
  }
];

// A single dynamic Skill Tag. Each tag injects only the context fragments and
// schema definitions required for that capability, keeping the context window
// lean. `destructive` flags skills whose activation must trigger the Governance
// Gate with the Phase 5 GOVERNANCE_GATE_COT_PROMPT risk calculus.
export const SkillTagSchema = z.object({
  id: z.string().min(1).describe('Stable identifier, e.g. DATABASE_MUTATION, REACT_UI_COMPONENT, EDGE_TELEMETRY'),
  description: z.string().min(1),
  requiredLaws: z.array(ImmutableLawIdSchema).default([]),
  injectedContext: z.string().min(1).describe('Prompt fragment or schema definition injected by this skill'),
  destructive: z.boolean().default(false).describe('True when the skill mutates or destroys state')
});
export type SkillTag = z.infer<typeof SkillTagSchema>;

export const SkillTagListSchema = z.array(SkillTagSchema);
export type SkillTagList = z.infer<typeof SkillTagListSchema>;

// --- Phase 28: Manual Task Dispatch & Live OS Telemetry ----------------------

export const CrucibleDispatchResponseSchema = z.object({
  success: z.boolean(),
  cycle: z.number(),
  maxCycles: z.number(),
  traceId: z.string().optional(),
  taskId: z.string().optional(),
  message: z.string()
});
export type CrucibleDispatchResponse = z.infer<typeof CrucibleDispatchResponseSchema>;

export const TelemetryStatsSchema = z.object({
  vector_memory_count: z.number(),
  think_tokens_minted: z.number(),
  crucible: z.object({
    cycleCount: z.number(),
    maxCycles: z.number(),
    status: z.string()
  }),
  timestamp: z.string()
});
export type TelemetryStats = z.infer<typeof TelemetryStatsSchema>;

export const ThinkTokenSchema = z.object({
  id: z.string().min(1),
  original_trace_id: z.string().optional(),
  task_context: z.record(z.unknown()).optional(),
  failed_state: z.record(z.unknown()).optional(),
  correction_delta: z.string().default(''),
  embedding: z.array(z.number()).min(1),
  status: z.enum(['PENDING_APPROVAL', 'VERIFIED', 'RECYCLED']).default('PENDING_APPROVAL'),
  created_at: z.string().optional(),
  kd: z.number().min(0).default(0).describe('Gating affinity threshold (Kd → 0 = near-perfect binding similarity)'),
  efficacy: z.number().min(0).max(1).default(0).describe('Intrinsic activity/mutation weight (0.0–1.0)'),
  locked_by: z.string().nullable().default(null).describe('ID/hash of the high-affinity Guard Token occupying the coordinate slot')
});
export type ThinkToken = z.infer<typeof ThinkTokenSchema>;

export const ThinkTrajectorySchema = z.object({
  id: z.string().min(1),
  token_hash: z.string().min(1),
  spatial_coordinates: z.array(z.number()).min(1),
  similarity_score: z.number(),
  confidence_score: z.number().min(0).max(1).optional(),
  status: z.enum(['PENDING_APPROVAL', 'VERIFIED', 'RECYCLED']),
  task_context: z.record(z.unknown()).optional(),
  failed_state: z.record(z.unknown()).optional(),
  correction_delta: z.string().default(''),
  created_at: z.string().optional(),
  kd: z.number().min(0).default(0).describe('Gating affinity threshold'),
  efficacy: z.number().min(0).max(1).default(0).describe('Intrinsic activity weight (0.0–1.0)'),
  locked_by: z.string().nullable().default(null).describe('Guard Token hash occupying the coordinate slot')
});
export type ThinkTrajectory = z.infer<typeof ThinkTrajectorySchema>;

export const ThinkTrajectoryResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  trajectories: z.array(ThinkTrajectorySchema)
});
export type ThinkTrajectoryResponse = z.infer<typeof ThinkTrajectoryResponseSchema>;

// --- Phase 28: Probabilistic Uncertainty Gating -------------------------------

export const UNCERTAINTY_THRESHOLD = 0.8;

export const AgentPayloadSchema = z.object({
  action: z.string().min(1).describe('The proposed agent action / emitted code or command'),
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .describe('Self-reported probability (0.0-1.0) the action is correct and grounded'),
  uncertainty_flag: z
    .boolean()
    .describe('Hard boolean the router guard reads; true forces PENDING_APPROVAL routing'),
  reasoning: z.string().default(''),
  trace_id: z.string().optional(),
  model: z.string().optional()
});
export type AgentPayload = z.infer<typeof AgentPayloadSchema>;
