# 04 — Database and Redis Architecture

## Overview

Kudbee uses a dual-store architecture: **Neon Postgres + pgvector** as the system of record, and **Redis (Upstash via ioredis)** as the state layer, cache, pub/sub bus, and distributed lock registry. All subsystems follow the **Resilient-First** pattern: if either dependency is unreachable, the system degrades to in-memory fallbacks rather than crashing.

---

## Postgres Schema (Neon)

All tables are created idempotently at boot in `services/ingestion/server.js:ensureSchema()`.

### `telemetry_traces` — Inbound telemetry events

| Column | Type | Constraints | Description |
|:---|:---|:---|:---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment row ID |
| `trace_id` | `TEXT` | `NOT NULL` | OTel trace identifier |
| `model` | `TEXT` | `NOT NULL DEFAULT 'unknown'` | LLM model name |
| `tokens_in` | `INTEGER` | `NOT NULL DEFAULT 0` | Input tokens consumed |
| `tokens_out` | `INTEGER` | `NOT NULL DEFAULT 0` | Output tokens generated |
| `cost` | `DOUBLE PRECISION` | `NOT NULL DEFAULT 0` | Estimated cost in USD |
| `status` | `TEXT` | `NOT NULL DEFAULT 'OK'` | `OK` or error status |
| `provider` | `TEXT` | | LLM provider name |
| `project_name` | `TEXT` | | Project identifier |
| `value_score` | `DOUBLE PRECISION` | `NOT NULL DEFAULT 0` | Community governance score |
| `timestamp` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Ingestion timestamp |
| `input_tokens` | `INTEGER` | `DEFAULT 0` | (Alias column) |
| `output_tokens` | `INTEGER` | `DEFAULT 0` | (Alias column) |

**Indexes:** `idx_trace_timestamp` (timestamp), `idx_trace_model` (model)

### `telemetry_logs` — Raw log storage (30-day TTL)

Same schema as `telemetry_traces` with `created_at` timestamp. Purged automatically via `pg_cron` after 30 days.

**TTL Policy:** Migration `002_telemetry_logs_and_user_memories_ttl.sql` schedules `purge_expired_rows()` via `pg_cron`.

### `telemetry_vectors` — Embedded telemetry vectors

| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `trace_id` | `TEXT NOT NULL` | |
| `thought_summary` | `TEXT NOT NULL DEFAULT ''` | AI-generated summary |
| `reasoning` | `TEXT NOT NULL DEFAULT ''` | Chain-of-thought reasoning |
| `model` | `TEXT NOT NULL DEFAULT 'unknown'` | |
| `vector` | `JSONB NOT NULL` | 1536-dim embedding array |
| `timestamp` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### `user_memories` — Semantic memory store (30-day TTL)

| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `agent_id` | `TEXT` | |
| `thought_summary` | `TEXT NOT NULL DEFAULT ''` | |
| `reasoning` | `TEXT NOT NULL DEFAULT ''` | |
| `model` | `TEXT NOT NULL DEFAULT 'unknown'` | |
| `embedding` | `JSONB` | 1536-dim embedding array |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### `security_violations` — Firewall triage queue

| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `payload` | `TEXT NOT NULL` | JSON-encoded offending payload |
| `violation_reason` | `TEXT NOT NULL` | Zod validation error message |
| `timestamp` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### `governance_actions` — Signed governance records

| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `trace_id` | `TEXT NOT NULL` | |
| `action` | `TEXT NOT NULL DEFAULT 'VERIFY'` | |
| `type` | `TEXT NOT NULL DEFAULT 'GOVERNANCE_ACTION'` | |
| `agent_id` | `TEXT NOT NULL` | |
| `signature` | `TEXT NOT NULL` | Cryptographic signature |
| `signed_payload` | `TEXT NOT NULL` | Signed payload content |
| `value_score` | `DOUBLE PRECISION NOT NULL DEFAULT 0` | |
| `note` | `TEXT` | Optional reviewer notes |
| `timestamp` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### `think` — Chain-of-thought archival (30-day TTL)

| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `agent_id` | `TEXT NOT NULL` | |
| `task` | `TEXT` | |
| `phase` | `TEXT` | |
| `thought` | `TEXT NOT NULL` | The reasoning block text |
| `tokens_in` | `INTEGER NOT NULL DEFAULT 0` | |
| `tokens_out` | `INTEGER NOT NULL DEFAULT 0` | |
| `model` | `TEXT NOT NULL DEFAULT 'reasoning'` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

**Index:** `idx_think_created_at`

### `think_tokens` — Semantic memory tokens (pgvector)

| Column | Type | Description |
|:---|:---|:---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `original_trace_id` | `VARCHAR` | |
| `task_context` | `JSONB` | Original task data |
| `failed_state` | `JSONB` | Pre-correction failure snapshot |
| `correction_delta` | `TEXT` | Correction applied |
| `embedding` | `VECTOR(1536)` | 1536-dim pgvector embedding |
| `status` | `VARCHAR NOT NULL DEFAULT 'PROVEN'` | `PENDING_APPROVAL` / `VERIFIED` / `RECYCLED` / `PROVEN` |
| `token_cost` | `NUMERIC DEFAULT 0` | Cost in compute tokens |
| `kd` | `NUMERIC DEFAULT 0` | Dissociation constant (Kd → 0 = near-perfect binding) |
| `efficacy` | `NUMERIC DEFAULT 0` | Intrinsic activity weight (0.0–1.0) |
| `locked_by` | `VARCHAR DEFAULT NULL` | Guard token hash if slot is locked |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### `vector_memory` — System topology blueprint (pgvector + HNSW)

| Column | Type | Description |
|:---|:---|:---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `text` | `TEXT NOT NULL` | Chunk text from topology documents |
| `embedding` | `VECTOR(1536) NOT NULL` | 1536-dim pgvector embedding |
| `metadata` | `JSONB NOT NULL DEFAULT '{}'` | `{ category, file_path, version, tags }` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

**Index:** `vector_memory_embedding_idx` — HNSW index with `m = 16, ef_construction = 64` using cosine distance operator (`vector_cosine_ops`).

### `reasoning_ledger` — Structured reasoning log

| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `context` | (varies) | Task context |
| `input` | (varies) | Input payload |
| `output` | (varies) | Output payload |
| `result_status` | (varies) | Result status |
| `provider` | (varies) | LLM provider |
| `event_type` | (varies) | Event classification |
| `reason` | (varies) | Failure reason |
| `created_at` | `TIMESTAMPTZ` | |

---

## Connection Pool Configuration

**Factory:** `services/lib/db.js` → `getDbPool()`

- Uses a single shared `pg.Pool` instance (not per-request clients)
- **Lazy + tolerant initialization:** reads `DATABASE_URL` env var; if missing, marks pool unhealthy and degrades to in-memory store
- **No SQLite:** local dev falls back to in-process memory store, not a file-backed DB
- Pool emits `error` events that are logged as warnings and mark the pool unhealthy
- SQL migrations live in `services/ingestion/migrations/*.sql` and are applied via Neon MCP or `pg_cron`, never at runtime boot

### Key Functions

| Function | Returns | Description |
|:---|:---|:---|
| `getDbPool()` | `pg.Pool` | Singleton pool instance |
| `isDbHealthy()` | `boolean` | Pool ready + no error flag |
| `runQuery(sql, params)` | `Array<Row>` | Query with in-memory fallback |
| `runInsert(sql, params)` | `{ id }` | Insert with returning ID |
| `closeDbPool()` | `void` | Graceful close |
| `teardownAll()` | `void` | Full cleanup (tests) |

---

## Redis Key Map

All keys are prefixed `kudbee:`. The Redis client factory is in `services/lib/redis.js` → `getRedisClient({ label, enableOfflineQueue })`.

### Core Data Structures

| Key | Type | Purpose | TTL |
|:---|:---|:---|:---|
| `kudbee:telemetry_feed` | List (`LPUSH/LTRIM`) | Telemetry event feed (trimmed to 10k) | None |
| `kudbee:governance_actions` | Sorted Set (`ZADD`) | Governance ledger (timestamp scored) | None |
| `kudbee:community_value_score` | String | Cumulative community score | None |
| `kudbee:governance_count` | Counter (`INCR`) | Total governance actions | None |
| `kudbee:verified_traces` | Set (`SADD`) | Verified trace IDs | None |
| `kudbee:system:context` | String | Agent system context blob | None |
| `kudbee:session_history` | List (`LPUSH`) | Session manifest log | None |
| `kudbee:alerts` | List (`LPUSH`) | Alert feed | None |
| `kudbee:throttle_factor` | String (`SET/DEL`) | Backpressure throttle factor | None |

### Pub/Sub Channels

| Channel | Published By | Consumed By |
|:---|:---|:---|
| `kudbee:events:v2` | `unifiedEvents.ts` (all subsystems) | SSE broadcast, dashboard |
| `kudbee:think:tokens` | `mintThinkToken` | Dashboard token stream |

### Subsystem-Specific Keys

| Key Pattern | Type | Purpose |
|:---|:---|:---|
| `kudbee:contract:*` | Various | AGC contract lease enforcement |
| `kudbee:circuit:*` | String (`INCR/EXPIRE`) | Circuit breaker state tracking |
| `kudbee:settings:*` | String (JSON) | Per-tenant configuration |
| `kudbee:agent:audit` | List (`LPUSH/LTRIM`) | Agent audit trail |
| `kudbee:agent:stream` | Stream (`XADD`) | Agent event stream |
| `kudbee:agent:state` | Hash (`HSET/HGETALL`) | Agent fleet state registry |
| `kudbee:probation:pending` | Sorted Set (`ZADD/ZRANGE`) | Pending probation cases |
| `kudbee:probation:resolved` | Sorted Set | Resolved probation cases |
| `kudbee:cache:*` | String (`SETEX`) | Expensive query cache |
| `kudbee:hermes:log` | List (`LPUSH/LRANGE`) | HERMES auditor log lines |
| `kudbee:groq:archives` | List (`LPUSH/LRANGE`) | Groq token archives |
| `kudbee:anomalies` | Set (`SADD/SMEMBERS`) | Low-confidence anomaly tokens |
| `kudbee:governance_counter` | Counter (`INCR`) | Monotonic governance ID |
| `kudbee:agents:hermes` | String (`SET EX 30`) | HERMES heartbeat (45s staleness threshold) |
| `kudbee-governance-tasks` | List | Active governance task queue |
| `kudbee-governance-tasks-failed` | List | Dead letter queue for failed tasks |
| `governance:proven:*` | String (JSON) | Proven/approved governance actions |

---

## Connection Pool & Timeout Values

### Postgres

| Setting | Value | Description |
|:---|:---|:---|
| Connection timeout | Default `pg` driver | |
| Idle timeout | Default `pg` driver | |
| Health check | `SELECT 1` via `isDbHealthy()` | Called on demand and in `/health` |
| Circuit breaker trigger | 5 consecutive failures | `services/lib/circuitBreaker.ts` |

### Redis

| Setting | Value | Description |
|:---|:---|:---|
| Client | `ioredis` v5 | |
| `enableOfflineQueue` | `true` | Queues commands when disconnected |
| Retry strategy | ioredis default | Exponential backoff |
| Heartbeat check | `redis.ping()` | Used in `/health` and lifecycle checks |
| Staleness threshold (HERMES) | `45_000ms` | Treat heartbeat as Offline if older |

---

## Circuit Breaker Configuration

Defined in `services/lib/circuitBreaker.ts`.

### Default Circuit Breaker

| Setting | Value |
|:---|:---|
| Failure threshold | 5 consecutive failures |
| Reset timeout | 30 seconds |
| Half-open probe | Single request allowed after reset timeout |
| State tracking | `kudbee:circuit:*` Redis keys with `INCR/EXPIRE` |

### Groq Breaker (`groqBreaker`)

Same default thresholds as the generic breaker. Opens when Groq LPU calls fail; all subsequent calls return `ok: false` with degraded results until the breaker resets.

---

## Resilient-First Degradation

Every database and Redis operation follows the Resilient-First pattern:

1. **Wrap in try/catch** — log a clear warning with subsystem, operation, and error message
2. **In-memory fallback** — Postgres operations degrade to in-memory JS arrays; Redis operations degrade to no-ops with empty returns
3. **Health endpoints** — `/health` returns `200` with `degraded` status, never `500`
4. **Boot tolerance** — Missing `DATABASE_URL` or `REDIS_URL` is a logged warning, not a crash

### Unified Event Bus

Publishes envelope `{ id, ts, source, kind, data }` to `kudbee:events:v2`.

Sources: `worker`, `sentinel`, `receptor`, `governance`, `hermes`, `system`, `groq`

Implementation: `services/lib/unifiedEvents.ts` — publishes to v2 channel + legacy channels for backward compatibility.

---

## Connection Pool Configuration

### Postgres Pool (`services/lib/db.js`)

| Setting | Value | Purpose |
|:---|:---|:---|
| `max` | 20 | Maximum connections in pool |
| `idleTimeoutMillis` | 10,000 | Close idle connections after 10s |
| `connectionTimeoutMillis` | 5,000 | Fail connection attempt after 5s |
| `keepAlive` | true | TCP keep-alive probes |
| `keepAliveInitialDelayMillis` | 10,000 | Wait 10s before first probe |
| `ssl` | `{ rejectUnauthorized: false }` | Required by Neon Postgres |

### Redis Client (`services/lib/redis.js`)

| Setting | Value | Purpose |
|:---|:---|:---|
| `connectTimeout` | 5,000 | Fail connect after 5s |
| `commandTimeout` | 3,000 | Fail command after 3s |
| `keepAlive` | 15,000 | TCP keep-alive interval |
| `maxRetriesPerRequest` | 0 | No automatic retry |
| `retryStrategy` | `() => null` | No reconnection (except subscriber) |

### Query Timeout Wrappers

All raw `pool.query()` calls are wrapped with `withTimeout()` (`services/lib/db.js`):

| Context | Timeout (ms) | Exported Constant |
|:---|:---|:---|
| Normal DB queries (SELECT, INSERT) | 10,000 | `DB_TIMEOUT_MS` |
| pgvector similarity search | 25,000 | `VECTOR_QUERY_TIMEOUT_MS` |
| pgvector INSERT (think_tokens) | 30,000 | `VECTOR_INSERT_TIMEOUT_MS` |

Callers using raw `pool.query()` (e.g., `thinkTokenGenerator.ts`, `vectorStore.ts`) use the exported `withTimeout()` with the appropriate constant.

---

## Prime-Lens Sampling Architecture

Four layers of defense applied on every `POST /api/telemetry/ingest`:

| Layer | Mechanism | Behavior |
|:---|:---|:---|
| 1. Heartbeat/Budget Firewall | Regex + token count filter | Drops heartbeat/ping/zero-token events |
| 2. Statistical Sampling | `SAMPLE_RATE` env var (1=all, 5=20%, 10=10%) | Random sampling; agents bypass |
| 3. In-Memory Dedup | 5s LRU window on `trace_id` | Rejects rapid duplicate events |
| 4. UPSERT | `ON CONFLICT (trace_id) DO UPDATE` | Duplicate trace_ids update existing row |
| 4.5. Skip Vector Writes | Skip `storeVector()` for ≤10 tokens AND status=OK | Saves 2 DB writes per filtered event |

### Batch Ingest Endpoint

`POST /api/telemetry/ingest/batch` accepts `{ events: [...] }` (max 100). Returns `{ received, persisted, filtered, sampled, deduped }`. The frontend `telemetryBatcher.ts` accumulates events for 1000ms and flushes through this endpoint.

---

## Shutdown Procedure

`teardownAll(redisClient)` in `services/lib/db.js` gracefully closes both DB pool and Redis connection via `Promise.allSettled`. Called on `SIGTERM`/`SIGINT` in `server.js`.

---

## Redis LangCache (Semantic Caching)

**Service**: `services/lib/semanticCache.ts`

Kudbee integrates with **Redis LangCache** (`b95111071db14e848cdbe9514138374d`) at the inference layer. Before any Groq/Gemini LLM call, the user prompt is checked against the semantic cache via `POST /entries/search`. On cache hit, the cached response is returned immediately — saving tokens, latency, and API costs. On cache miss, the LLM response is asynchronously saved back via `POST /entries`.

| Env Var | Purpose | Default |
|:---|:---|:---|
| `LANGCACHE_API_KEY` | Bearer token for LangCache auth | (required — disables cache if unset) |
| `LANGCACHE_ENDPOINT` | LangCache REST endpoint URL | `https://aws-us-east-1.langcache.redis.io/v1/caches/b95111071db14e848cdbe9514138374d` |

**Resilience**: Cache operations have a 3-second timeout and are non-blocking. If LangCache is unreachable, the LLM call proceeds normally — the cache degrades gracefully without impacting inference throughput.
