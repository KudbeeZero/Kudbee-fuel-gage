#!/usr/bin/env node
/**
 * scripts/extract-codebase-knowledge.mjs
 * ---------------------------------------------------------------------------
 * Extracts structured knowledge tokens from the codebase and writes them as
 * text injection files for the Think Token Forge (pgvector RAG system).
 *
 * Output: .kilo/memory/tokens/*.token
 * Each file contains:
 *   - Pattern signature (what it does)
 *   - File location
 *   - Usage context (how/when it's used)
 *   - Dependencies (what it imports/needs)
 *   - Category tag (middleware, schema, route, component, hook, agent, config)
 *
 * These tokens are semantically searchable via the Token Forge's
 * getRelevantThinkTokens() for future session context injection.
 * ---------------------------------------------------------------------------
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const TOKENS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'tokens');

mkdirSync(TOKENS_DIR, { recursive: true });

function writeToken(id, content) {
  const filename = join(TOKENS_DIR, `${id}.token`);
  writeFileSync(filename, content.trim() + '\n', 'utf8');
  return filename;
}

const TOKENS = [];

// ─── Middleware Pipeline ────────────────────────────────────────────────────

TOKENS.push({
  id: 'middleware-pipeline-architecture',
  payload: `## Middleware Pipeline Architecture (11 layers)
All middleware in kudbee uses the MiddlewareGuard fail-open pattern.
The pipeline runs sequentially in services/ingestion/server.js.

LAYER 1: Request Duration Tracker
  File: services/ingestion/server.js (inline)
  Records per-route latency. Feeds route-latency buffer for observability.

LAYER 2: Spheroid Audit
  File: services/lib/spheroidAuditMiddleware.ts
  Guard: spheroid-audit (5 failures, 45s cooldown)
  Logs all POST/PUT/PATCH/DELETE to Redis stream kudbee:spheroid:audit

LAYER 3: Rate Limiter
  File: services/lib/rateLimiter.ts
  Guard: rate-limiter (5 failures, 30s cooldown)
  In-memory sliding-window Map. Atomic fallback via Redis EVAL Lua ZADD/ZCARD.

LAYER 4: 15s Timeout
  Guard: timeout (3 failures, 60s cooldown)
  Returns 503 on timeout. Prevents Heroku H27.

LAYER 5: CORS Handler
  Sets Access-Control-Allow-Origin from CORS_ALLOW_ORIGINS env.

LAYER 6: Body Parser
  express.json({ limit: '10mb' })

LAYER 7: Bearer Auth
  File: services/lib/bearerAuthMiddleware.ts
  Guard: bearer-auth (3 failures, 30s cooldown)
  HMAC SHA-256 + Ed25519 agent pass + x-agent-pass header.
  Sets req.agentId, req.authenticated, req.agentRoles.

LAYER 8: KiloBridge Budget
  File: services/lib/kiloBridgeMiddleware.ts
  Guard: kilo-bridge (3 failures, 30s cooldown)
  Per-tenant token budget via Redis INCRBY. Daily cap default 1M tokens.

LAYER 9: ECP Singleflight
  File: services/lib/ecpMiddleware.ts
  Guard: ecp-singleflight (3 failures, 60s cooldown)
  Deduplicates concurrent GETs. Captures and replays responses.
  5s TTL, periodic 30s sweep.

LAYER 10: API Rate Limiter
  express-rate-limit: 100 req/min general, 25 req/min ingest.

LAYER 11: Zod Validation
  File: services/lib/zodValidationMiddleware.ts
  Guard: zod-validator (2 failures, 30s cooldown)
  Per-route schema validation. Returns 400 with structured field errors.

GLOBAL: Error Handler
  File: services/lib/globalErrorMiddleware.ts
  4-arg Express error handler. Structured JSON with traceId + breadcrumbs.`
});

// ─── API Endpoints ──────────────────────────────────────────────────────────

TOKENS.push({
  id: 'api-route-catalog',
  payload: `## API Route Catalog
All routes are mounted in services/ingestion/server.js.

SUB-ROUTERS:
  /api/audit       -> services/ingestion/routes/audit.ts
  /api/governance  -> services/ingestion/routes/governance.ts
  /api/telemetry   -> services/ingestion/routes/telemetry.ts
  /api/system      -> services/ingestion/routes/system.ts
  /api/agents      -> inline in server.js

KEY ENDPOINTS:
  GET  /health                          -> Health check
  GET  /api/system/health-deep          -> Deep dependency probes (PG + Redis latency)
  GET  /api/system/diagnostics          -> Full system diagnostics rollup
  GET  /api/system/route-latencies      -> Middleware guard stats + per-route percentiles
  POST /api/telemetry/ingest            -> Primary telemetry ingestion (batch up to 100)
  GET  /api/os-stream                   -> SSE event stream (os:snapshot every 5s)
  POST /api/governance/mint-think-token -> Token Forge minting
  GET  /api/governance/hermes-logs      -> HERMES audit log retrieval
  POST /api/agents/verify               -> Agent payload verification
  POST /api/interceptor/verify          -> Payload interception verification

RATE LIMITS:
  General API: 100 req/min
  Ingest:      25 req/min
  UI polling:  600 req/min
  Global IP:   300 req/min
  Token budget: 1,000,000/day per tenant`
});

// ─── Middleware Patterns ─────────────────────────────────────────────────────

TOKENS.push({
  id: 'middleware-patterns',
  payload: `## Middleware Development Patterns

### Creating a New Middleware:
1. Create file: services/lib/{name}Middleware.ts
2. Instantiate guard: const guard = new MiddlewareGuard('name', failures, cooldownMs)
3. Export factory: export function myMiddleware() { return guard.wrap(async (req, res, next) => {...}) }
4. Export stats: export function getStats() { return guard.stats() }
5. Register in server.js: import + registerGuard(guard) + app.use(myMiddleware())
6. Add test: services/lib/test/middlewarePipeline.test.ts

### MiddlewareGuard API:
  new MiddlewareGuard(name, threshold=5, cooldownMs=30000)
  guard.wrap(fn)  -> returns fail-open wrapped handler
  guard.stats()    -> returns MiddlewareStats { name, healthy, state, failures, successes, bypassed, ... }
  guard.reset()    -> resets failure tracking

### Fail-Open Semantics:
If middleware throws threshold consecutive times, it enters BYPASSED state.
Requests pass through uncounted during cooldown.
Auto-recovery after cooldown expires.
All middleware catches errors: never throws to Express.

### Observability:
MiddlewareGuard registry tracks all guards via registerGuard().
Stats exposed at GET /api/system/route-latencies.
Dashboard: OBSERVABILITY tab shows live cards + latency table.`
});

// ─── Database Schema ────────────────────────────────────────────────────────

TOKENS.push({
  id: 'database-schema',
  payload: `## Database Schema (Neon Postgres + pgvector)

CONNECTION POOL:
  max: 20, idleTimeout: 10s, connectTimeout: 5s, keepAlive: true
  DB_TIMEOUT_MS: 10s, VECTOR_QUERY_TIMEOUT_MS: 25s

TABLES:
  telemetry_traces     (id BIGSERIAL PK, trace_id TEXT, model, tokens_in/out, cost, status, provider, project_name, value_score, timestamp)
  telemetry_logs       (id BIGSERIAL PK, trace_id TEXT, same fields + created_at)
  security_violations  (id BIGSERIAL PK, payload TEXT, violation_reason TEXT, timestamp)
  telemetry_vectors    (id BIGSERIAL PK, trace_id, thought_summary, reasoning, model, vector JSONB, timestamp)
  user_memories        (id BIGSERIAL PK, agent_id, thought_summary, reasoning, model, embedding JSONB, created_at)
  governance_actions   (id BIGSERIAL PK, trace_id, action, type, agent_id, signature, signed_payload, value_score, note, timestamp)
  think                (id BIGSERIAL PK, agent_id, task, phase, thought, tokens_in/out, model, created_at)
  think_tokens         (id UUID PK DEFAULT gen_random_uuid(), original_trace_id, task_context JSONB, failed_state JSONB, correction_delta, embedding VECTOR(1536), status, token_cost, kd, efficacy, locked_by, created_at)
  vector_memory        (id UUID PK DEFAULT gen_random_uuid(), text, embedding VECTOR(1536), metadata JSONB, created_at)

INDEXES:
  idx_trace_timestamp, idx_trace_model, idx_think_created_at
  pgvector extension enabled

RESILIENCE:
  withTimeout() wrapper on all raw pool.query calls
  In-memory fallback store when pool is unhealthy
  isDbHealthy() gate before writes`
});

// ─── Redis Patterns ─────────────────────────────────────────────────────────

TOKENS.push({
  id: 'redis-patterns',
  payload: `## Redis Patterns (Upstash Redis)

CONNECTION:
  getRedisClient(opts)  -> shared ioredis client (TLS if Upstash)
  getBlockingRedisClient() -> for BRPOP/BLPOP loops
  getSubscriberClient() -> dedicated pub/sub connection
  Adaptive circuit breaker: opens at 500k requests, 30s backoff

CLIENTS:
  _client            -> general command client
  _subClient         -> pub/sub subscriber
  _blockingClient    -> BRPOP/BLPOP polling
  _workerClient      -> dedicated worker REDIS_WORKER_URL

KEY PATTERNS:
  kudbee:ratelimit:{key}            -> ZSET sliding window
  kudbee:budget:{tenant}:daily:{d}  -> STRING INCRBY token counter
  kudbee:spheroid:audit             -> STREAM MAXLEN 10000
  kudbee:breadcrumbs                -> STREAM MAXLEN 500
  kudbee-governance-tasks           -> LIST BRPOP (worker polling)
  kudbee-governance-tasks-failed    -> LIST (DLQ)
  kudbee:events                     -> PUB/SUB general channel

ERROR HANDLING:
  isRedisQuotaError(err) -> detects MAX_REQUESTS_LIMIT / 429
  applyRedisQuotaBackoff() -> exponential (2s base, 30s max)
  resetRedisQuotaBackoff() -> reset on success
  quotaBackoffState -> enabled, backoffMs, untilTs, consecutiveErrors`
});

// ─── Frontend Component Patterns ────────────────────────────────────────────

TOKENS.push({
  id: 'frontend-patterns',
  payload: `## Frontend Component Patterns

TAB ARCHITECTURE (17 tabs):
  App.tsx sidebar -> activeTab state -> conditional rendering
  Primary nav: STUDIO, TELEMETRY, OBSERVABILITY, THINK, GOVERNANCE, CONTROL TOWER, HERMES, SENTINEL, PLAYGROUND
  Secondary nav: TERMINAL, FIREWALL, GATEWAY, INTERCEPTOR, HISTORY, ALERTS, INTELLIGENCE, SETTINGS

HOOK PATTERNS:
  useSystemDiagnostics() -> GET /api/system/diagnostics every 15s
  useMiddlewareStatus()  -> GET /api/system/route-latencies every 5s
  useOsSnapshot()        -> OsStreamProvider context (SSE os:snapshot)
  useGovernanceHealth()  -> GET /api/governance/health

API CLIENT:
  apiGet<T>(path)        -> 15s timeout, exponential backoff on 429/503
  apiPost<T>(path, body) -> 30s timeout
  NetworkError class     -> status + isRateLimit flag

ACCESSIBILITY (a11y):
  useFocusTrap(active)   -> traps Tab within container, restores focus
  All drawers: role="dialog", aria-modal="true", aria-label
  Escape key handlers on all modals
  Null guards (?? []) on all async data reads

OBSERVABILITY PAGE:
  File: apps/web/src/pages/observability.tsx
  Components: MiddlewareInspector, RouteLatencyMonitor
  Hook: useMiddlewareStatus() polling /api/system/route-latencies
  Shows: 11 guard status cards + per-route latency percentile table`
});

// ─── Agent Ecosystem ────────────────────────────────────────────────────────

TOKENS.push({
  id: 'agent-ecosystem',
  payload: `## Backend Agent Ecosystem

Governance Worker:
  File: services/agents/worker.ts
  Pattern: TCP BRPOP on kudbee-governance-tasks, 5s timeout
  Retry: 3 attempts -> DLQ kudbee-governance-tasks-failed
  States: QUEUED -> PROCESSING -> SUCCESS/FAILED/DEAD_LETTERED/RETRY_QUEUED/DISCARDED
  Events: broadcast via kudbee:events Redis pub/sub

HERMES Auditor:
  File: services/agents/hermes.js
  Audit sweep, probe, log filter, Crucible integration

Monitor Worker:
  File: services/monitor/agent.js
  BLPOP on kudbee:telemetry_feed, 5s timeout

Agent Context Factory:
  File: services/agents/src/context-factory.ts
  Builds hierarchical prompts for LLM agents
  Token Forge RAG injection for few-shot grounding

Token Forge (Think Tokens):
  File: services/memory/thinkTokenGenerator.ts
  pgvector recall via getRelevantThinkTokens()
  Gemini embedding for semantic search
  renderThinkTokenContext() for prompt injection

Job Queue:
  File: services/lib/jobQueue.ts
  enqueueJob(), dequeueJob(), retryJob()
  Jittered exponential backoff, dead-letter queue

Circuit Breakers:
  File: services/lib/circuitBreaker.ts
  groqBreaker + geminiBreaker
  5 failures trigger, 30s reset

Token Bucket:
  File: services/lib/tokenBucket.ts
  Redis rate limiter: Groq (30/5rps), Gemini (100/10rps), Neon (100/20rps)`
});

// ─── Verification Patterns ──────────────────────────────────────────────────

TOKENS.push({
  id: 'verification-patterns',
  payload: `## CI Verification Patterns

GATES (run sequentially):
  1. npm run typecheck         -> 12 Turbo tasks, must be zero errors
  2. bun test test/            -> 46 tests, services/lib
  3. npm run build             -> Vite build, chunk < 500 kB
  4. node scripts/verify-e2e.mjs -> 38 checks

BREADCRUMBS:
  Each gate drops a breadcrumb (services/lib/breadcrumbs.ts)
  Trace ID: verify-{date}-{run} (shared across all gates)
  Stream: kudbee:breadcrumbs MAXLEN 500
  Replay: getBreadcrumbs(traceId) for Groq diagnosis

SESSION MEMORY:
  File: .kilo/memory/journal.json
  Tracks: session, date, actions, ciStatus, bugsFixed, breadcrumbTraceId
  Read at session start for context resumption
  Updated after each significant action

TOKEN INJECTION:
  Knowledge extraction writes .token files to .kilo/memory/tokens/
  Each token: ID, pattern signature, file location, usage context, dependencies
  Injected into Think Token Forge via pgvector embedding
  Semantic search: getRelevantThinkTokens(query) returns top matches`
});

for (const token of TOKENS) {
  const filename = writeToken(token.id, token.payload);
  console.log(`  [+] ${token.id}`);
}

console.log(`\n  Wrote ${TOKENS.length} knowledge tokens to ${TOKENS_DIR}`);
console.log(`  Inject with: node scripts/inject-knowledge-tokens.mjs`);
