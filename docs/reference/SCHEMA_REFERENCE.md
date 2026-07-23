# Schema Reference

All Zod schemas from `packages/types/index.ts` with field descriptions.

---

## Telemetry

### TelemetryTraceSchema / IngestRequestSchema

Canonical telemetry event shape. Validated by `IngestRequestSchema.safeParse()` in `POST /api/telemetry/ingest`.

| Field | Type | Constraints | Description |
|:---|:---|:---|:---|
| `trace_id` | `string` | `min(1).max(255)` | OTel trace identifier |
| `model` | `string` | `min(1).max(100)` | LLM model name |
| `tokens_in` | `number` | `int().nonnegative()` | Input tokens consumed |
| `tokens_out` | `number` | `int().nonnegative()` | Output tokens generated |
| `cost` | `number` | `nonnegative()` | Estimated cost in USD |
| `status` | `string` | `min(1).default('OK')` | Event status |
| `provider` | `string` | `max(100).default('unknown')` | LLM provider |
| `project_name` | `string` | `max(100).default('kilo-fuel-gauge')` | Project identifier |
| `thought_summary` | `string` | `max(2000).default('')` | AI-generated summary |
| `reasoning` | `string` | `max(5000).default('')` | Chain-of-thought |
| `timestamp` | `string` | `optional` | Event timestamp |

**Strict mode:** `strict()` — no additional properties allowed.

### CsvInjectRequestSchema

| Field | Type | Description |
|:---|:---|:---|
| `logs` | `CsvInjectItem[]` | Array of telemetry items (partial TelemetryTrace) |

### DashboardSummarySchema

| Field | Type | Description |
|:---|:---|:---|
| `total_24h_cost` | `number` | 24-hour cost total |
| `total_historical_tokens` | `number` | All-time token count |
| `total_input_tokens` | `number?` | All-time input tokens |
| `total_output_tokens` | `number?` | All-time output tokens |
| `total_active_models` | `number` | Distinct model count |
| `total_requests` | `number?` | Total request count |
| `error_rate` | `number?` | Error percentage |
| `sink_token_balance` | `number?` | Token sink balance |
| `postgres_size_bytes` | `number?` | Postgres database size |
| `redis_size_bytes` | `number?` | Redis memory usage |
| `health_matrix` | `unknown[]` | Health status array |

### TelemetryStatsSchema

| Field | Type | Description |
|:---|:---|:---|
| `vector_memory_count` | `number` | Topology chunks stored |
| `think_tokens_minted` | `number` | Total think tokens |
| `crucible` | `{ cycleCount, maxCycles, status }` | Crucible engine status |
| `timestamp` | `string` | Snapshot timestamp |

---

## Security

### SecurityViolationSchema

| Field | Type | Description |
|:---|:---|:---|
| `id` | `number` | `int()` |
| `payload` | `unknown` | Offending payload |
| `violation_reason` | `string` | Validation error |
| `timestamp` | `string` | Violation time |

### TriageQueueSchema

Type: `SecurityViolation[]`

### ZodIssueSchema

| Field | Type | Description |
|:---|:---|:---|
| `code` | `string` | Error code |
| `path` | `(string \| number)[]` | Field path |
| `message` | `string` | Error message |

---

## Agent Identity

### AgentPassSchema

Cryptographic agent identification token.

| Field | Type | Description |
|:---|:---|:---|
| `agentId` | `string` | `min(1)` |
| `issuedAt` | `number` | `int()` — Unix timestamp |
| `signature` | `string` | `min(1)` — Cryptographic signature |

### RegisteredAgentSchema

| Field | Type | Description |
|:---|:---|:---|
| `agentId` | `string` | `min(1)` |
| `publicKey` | `string` | `min(1)` — Ed25519 public key |
| `status` | `string` | `default('active')` |
| `createdAt` | `string` | `optional` |

### AgentRegistrySchema

| Field | Type | Description |
|:---|:---|:---|
| `registry` | `RegisteredAgent[]` | Active agent list |

---

## Memory

### MemoryRecallSchema

| Field | Type | Description |
|:---|:---|:---|
| `trace_id` | `string` | `min(1)` |
| `thought_summary` | `string` | `default('')` |
| `reasoning` | `string` | `default('')` |
| `model` | `string` | `default('unknown')` |
| `similarity` | `number` | Cosine similarity score |

### MemoryRecallQuerySchema

| Field | Type | Description |
|:---|:---|:---|
| `query` | `string` | `min(1)` — Search text |
| `limit` | `number` | `int().positive().max(20).default(3)` |

---

## Governance

### GovernanceActionSchema

Cryptographically signed verification action.

| Field | Type | Description |
|:---|:---|:---|
| `id` | `number` | `int()` |
| `trace_id` | `string` | `min(1)` |
| `action` | `string` | `default('VERIFY')` |
| `type` | `string` | `default('GOVERNANCE_ACTION')` |
| `agent_id` | `string` | Verifying agent ID |
| `signature` | `string` | `min(1)` — Cryptographic signature |
| `signed_payload` | `string` | Signed data |
| `value_score` | `number` | `min(0).max(100).default(0)` |
| `timestamp` | `string` | |

### GovernanceVerifyRequestSchema

| Field | Type | Description |
|:---|:---|:---|
| `trace_id` | `string` | `min(1)` |
| `agent_id` | `string` | `min(1)` |
| `agent_pass` | `string` | `min(1)` — Encoded agent pass |
| `value_score` | `number` | `min(0).max(100).default(0)` |
| `note` | `string` | `optional` |

### CommunityValueResponseSchema

| Field | Type | Description |
|:---|:---|:---|
| `community_value_score` | `number` | |
| `verified_traces` | `number` | |
| `governance_actions` | `number` | |

---

## HITL Approval Gate

### ApprovalRequestSchema

Proposed action awaiting human decision.

| Field | Type | Description |
|:---|:---|:---|
| `id` | `string` | `min(1)` |
| `proposed_model` | `string` | `default('unknown')` |
| `estimated_cost` | `number` | `nonnegative().default(0)` |
| `reasoning_tokens` | `number` | `int().nonnegative().default(0)` |
| `status` | `'PENDING_APPROVAL' \| 'APPROVED' \| 'REJECTED'` | `default('PENDING_APPROVAL')` |
| `agent_id` | `string?` | |
| `task` | `string?` | |
| `reasoning` | `string?` | |
| `created_at` | `string?` | |

### ApprovalDecisionSchema

```typescript
z.enum(['APPROVE', 'REJECT'])
```

### ApprovalResolutionSchema

| Field | Type | Description |
|:---|:---|:---|
| `id` | `string` | `min(1)` |
| `decision` | `'APPROVE' \| 'REJECT'` | |
| `success` | `boolean` | |
| `action` | `unknown?` | |

---

## Think: Stream

### ThinkThoughtSchema

Archived reasoning block.

| Field | Type | Description |
|:---|:---|:---|
| `id` | `number` | `int()` |
| `agent_id` | `string` | |
| `task` | `string?` | |
| `phase` | `string?` | |
| `thought` | `string` | Reasoning text |
| `tokens_in` | `number` | `int().nonnegative().default(0)` |
| `tokens_out` | `number` | `int().nonnegative().default(0)` |
| `model` | `string` | `default('reasoning')` |
| `created_at` | `string?` | |

### ThinkArchiveResponseSchema

| Field | Type | Description |
|:---|:---|:---|
| `count` | `number` | `int().nonnegative()` |
| `thoughts` | `ThinkThought[]` | |

---

## Think Tokens

### ThinkTokenSchema

Semantic memory token with receptor gating fields.

| Field | Type | Description |
|:---|:---|:---|
| `id` | `string` | `min(1)` — UUID |
| `original_trace_id` | `string?` | Source telemetry trace |
| `task_context` | `Record<string, unknown>?` | Original task data |
| `failed_state` | `Record<string, unknown>?` | Pre-correction snapshot |
| `correction_delta` | `string` | `default('')` — Correction applied |
| `embedding` | `number[]` | `min(1)` — 1536-dim vector |
| `status` | `'PENDING_APPROVAL' \| 'VERIFIED' \| 'RECYCLED' \| 'PROVEN'` | `default('PROVEN')` |
| `token_cost` | `number` | `min(0).default(0)` |
| `created_at` | `string?` | |
| `kd` | `number` | `min(0).default(0)` — Dissociation constant (→ 0 = perfect binding) |
| `efficacy` | `number` | `min(0).max(1).default(0)` — Activity weight (0.0–1.0) |
| `locked_by` | `string \| null` | `default(null)` — Guard token hash |

### ThinkTrajectorySchema

Token with spatial coordinates for 3D projection.

| Field | Type | Description |
|:---|:---|:---|
| `id` | `string` | `min(1)` |
| `token_hash` | `string` | `min(1)` |
| `spatial_coordinates` | `number[]` | `min(1)` — 3D point (x, y, z, ...) |
| `similarity_score` | `number` | |
| `confidence_score` | `number?` | `min(0).max(1)` |
| `status` | `'PENDING_APPROVAL' \| 'VERIFIED' \| 'RECYCLED' \| 'PROVEN'` | |
| `reasoning` | `string?` | |
| `task_context` | `Record<string, unknown>?` | |
| `failed_state` | `Record<string, unknown>?` | |
| `correction_delta` | `string` | `default('')` |
| `created_at` | `string?` | |
| `kd` | `number` | `min(0).default(0)` |
| `efficacy` | `number` | `min(0).max(1).default(0)` |
| `locked_by` | `string \| null` | `default(null)` |

### ThinkTrajectoryResponseSchema

| Field | Type | Description |
|:---|:---|:---|
| `count` | `number` | `int().nonnegative()` |
| `trajectories` | `ThinkTrajectory[]` | |

---

## Vector Memory

### VectorMemoryChunkSchema

System topology blueprint chunk.

| Field | Type | Description |
|:---|:---|:---|
| `chunk_text` | `string` | `min(1)` — Document chunk text |
| `metadata` | `object` | Metadata block |
| `metadata.category` | `'law' \| 'router' \| 'schema' \| 'layout' \| 'config' \| 'doc' \| 'prompt'` | Chunk classification |
| `metadata.file_path` | `string` | `min(1)` |
| `metadata.version` | `string` | `default('1.0.0')` |
| `metadata.tags` | `string[]` | `default([])` |
| `metadata.chunk_index` | `string?` | |
| `metadata.chunk_total` | `string?` | |
| `embedding` | `number[]` | `min(1)` — 1536-dim vector |

---

## Immutable Laws & Skills

### ImmutableLawIdSchema

```typescript
z.enum([
  'NODE22_ESM_EXT',
  'ZERO_ANY',
  'EXPLICIT_ESM_EXTENSION',
  'STRICT_TYPECHECK',
  'BLUEPRINT_FIRST'
])
```

### SkillTagSchema

Dynamic prompt assembly fragment.

| Field | Type | Description |
|:---|:---|:---|
| `id` | `string` | `min(1)` — Stable identifier |
| `description` | `string` | `min(1)` |
| `requiredLaws` | `ImmutableLawId[]` | `default([])` |
| `injectedContext` | `string` | `min(1)` — Prompt fragment injected |
| `destructive` | `boolean` | `default(false)` — Triggers governance gate when true |

---

## Agent Payload (Uncertainty Gating)

### AgentPayloadSchema

| Field | Type | Description |
|:---|:---|:---|
| `action` | `string` | `min(1)` — Proposed agent action |
| `confidence_score` | `number` | `min(0).max(1)` — Self-reported correctness probability |
| `uncertainty_flag` | `boolean` | Hard flag forcing `PENDING_APPROVAL` routing |
| `reasoning` | `string` | `default('')` |
| `trace_id` | `string?` | |
| `model` | `string?` | |

**Threshold:** `UNCERTAINTY_THRESHOLD = 0.8`. Scores below this OR `uncertainty_flag === true` route to HITL approval.

---

## Crucible

### CrucibleDispatchResponseSchema

| Field | Type | Description |
|:---|:---|:---|
| `success` | `boolean` | |
| `cycle` | `number` | Current cycle |
| `maxCycles` | `number` | Cycles per boot |
| `traceId` | `string?` | |
| `taskId` | `string?` | |
| `message` | `string` | |

---

## Plugin Registry

From `packages/types/plugin.ts`:

### IKudbeePlugin

```typescript
interface IKudbeePlugin {
  id: string;
  title: string;
  category: PluginCategory;
  status: PluginStatus;
  gridSpan: GridSpan;
  requiresApprovalGate?: boolean;
}
```

### Supporting Types

| Type | Values |
|:---|:---|
| `PluginStatus` | `'active' \| 'degraded' \| 'offline' \| 'pending' \| 'standby'` |
| `PluginCategory` | `'storm' \| 'stream' \| 'storage' \| 'trajectories' \| 'governance' \| 'metric' \| 'adapter' \| 'auditor'` |
| `GridSpan` | `{ colSpan: number; rowSpan?: number }` |
