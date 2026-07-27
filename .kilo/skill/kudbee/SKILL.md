---
name: kudbee
description: Kudbee monorepo architecture, middleware pipeline, CI gates, and interactive development workflow
---

# Kudbee Project Skill

## Interactive Workflow Menu

When activated, present this numbered menu to the user at the start of the session:

```
╔══════════════════════════════════════════╗
║         KUDBEE CONTROL TOWER            ║
╠══════════════════════════════════════════╣
║  VERIFY                                 ║
║  [1] Verify all CI gates                ║
║  [2] Run typecheck                      ║
║  [3] Run tests (services/lib)           ║
║  [4] Build web app                      ║
║  [5] Run E2E verification (38 checks)   ║
║                                         ║
║  INSPECT                                ║
║  [6] Inspect middleware pipeline        ║
║  [7] Inspect route latencies            ║
║  [8] Audit production fixes            ║
║  [9] Review OUTING_PLAN.md             ║
║                                         ║
║  PR LIFECYCLE                           ║
║  [A] Show PR status (open/closed)       ║
║  [B] Review current branch changes      ║
║  [C] Create PR from current branch      ║
║  [D] Run CI + create PR in one shot     ║
║  [E] Merge PR and cleanup               ║
║                                         ║
║  COMMANDS (terminal↔UI bridge)          ║
║  [/sync]     Real-time terminal↔UI sync ║
║  [/report]   Standardized agent report  ║
║  [/handoff]  Human-in-the-loop procedur ║
║  [/broadcast] Multi-agent bus broadcast ║
║  [/patch]    Live UI state patch        ║
║  [/memory]   Full memory recall         ║
║  [/continue] Full session resume        ║
║  [/verify]   All CI gates               ║
║  [/pr]       PR lifecycle               ║
║                                         ║
║  [0] Full health check (all of above)   ║
╚══════════════════════════════════════════╝
```

Wait for user to select a letter or number, then execute the corresponding action.

## Menu Actions

### [1] Verify all CI gates
Run `/verify` — typecheck + tests + build + e2e with **embedded breadcrumbs**.

Each gate drops a breadcrumb into the `kudbee:breadcrumbs` Redis stream with a shared trace ID for replay. The verify command produces a single `verify-{date}-{run}` trace spanning all gates.

If a gate fails, the breadcrumb includes the error stack for Groq root-cause diagnosis. After verification, report the trace ID so the user can replay via `getBreadcrumbs(traceId)`.

The breadcrumb audit trail surfaces in the HERMES audit panel under the same trace context.

### [2] Run typecheck
`npm run typecheck` — must pass 12/12 tasks.

### [3] Run tests
`cd services/lib && bun test test/` — 46 tests across middleware, rate limiter, and Redis backoff.

### [4] Build web app
`npm run build --workspace=@kudbee/web` — output in `apps/web/dist/`, main chunk must stay under 500 kB.

### [5] Run E2E verification
`node scripts/verify-e2e.mjs` — 38 checks covering telemetry, governance, DLQ, Redis, and middleware.

### [6] Inspect middleware pipeline
Read `services/lib/middlewareGuard.ts` for guard stats, then read the middleware files in order:
- `services/lib/spheroidAuditMiddleware.ts`
- `services/lib/rateLimiter.ts`
- `services/lib/bearerAuthMiddleware.ts`
- `services/lib/kiloBridgeMiddleware.ts`
- `services/lib/ecpMiddleware.ts`
- `services/lib/zodValidationMiddleware.ts`
- `services/lib/globalErrorMiddleware.ts`
Report guard statuses, failure counts, and any degraded layers.

### [7] Inspect route latencies
Read the route-latency buffer from the request duration tracker in `services/ingestion/server.js` and the `/api/system/route-latencies` endpoint in `services/ingestion/routes/system.ts`. Report the top 10 slowest routes.

### [8] Audit production fixes
Read `STATE_OF_THE_OS.md` — list the 25 documented production fixes with severities.

### [9] Review OUTING_PLAN.md
Read `OUTING_PLAN.md` — list the 20 phases and identify which are complete vs pending.

## Interactive Verification Suite

### Full CI Gate Run (interactive)

When running `[1] Verify all CI gates` or `[0] Full health check`, run each gate **interactively**:

1. **Typecheck**: Run `npm run typecheck`. If passed, report "12/12 tasks ✓". If failed, show the first 5 errors and ask: "Continue or stop?"
2. **Tests**: Run `cd services/lib && bun test test/`. Report pass/fail count. If any fail, show failing test names and ask: "Debug tests or continue?"
3. **Build**: Run `npm run build --workspace=@kudbee/web`. Report chunk size. Warn if >500 kB threshold.
4. **E2E**: Run `node scripts/verify-e2e.mjs`. Show results count. If < 38 passes, list failed checks.

After each gate, present a micro-menu:
```
  Gate passed. Next:
  [C] Continue to next gate
  [S] Stop and review
  [R] Retry this gate
```

## Session Memory (Conscience)

At the start of every session, BEFORE presenting the menu:

1. Read `.kilo/memory/journal.json` to recall last session state.
2. Compare current state to last known state:
   - Check `git log --oneline origin/main..HEAD` — are there new commits?
   - Check `gh pr list --state open` — any new PRs?
   - Check `git status --short` — any uncommitted changes?
3. Present a **situational brief** before the menu:

```
  Last session: 2026-07-27 — Phase 66 completed (7 middleware, observability, PR tools)
  CI health:   GREEN (12/12 typecheck, 46 tests, 38 e2e)
  Branch:      session/agent_xxx (3 commits ahead of main)
  PRs:         0 open
  Uncommitted: 0 files

  ⚠ PRD: 3 unmerged commits — suggest creating PR with [D]
```

After every significant action (verify, create PR, fix bug, add feature), UPDATE `.kilo/memory/journal.json`:
- Append a journal entry with: session, date, summary, actions, ciStatus, filesChanged, bugsFixed, **breadcrumbTraceId**
- Update trends (increment session count, track CI pass rate)
- Update health (overall status, any known issues)
- Keep only the last 10 journal entries (prune older ones)

**Breadcrumb traceability**: Every verification run gets a trace ID (`verify-{date}-{run}`). This ID links the memory journal to the Redis breadcrumb stream for replayable audit. The HERMES auditor can surface these traces alongside governance audit events.

### Interactive Verification Console

When running any verification action, operate with **consciousness**:

1. **Before running**: Check memory journal for last known CI state. If last session was GREEN and nothing changed, suggest: "No changes since last GREEN build — skip verification?" Only skip if user confirms.

2. **While running**: Report each gate in real-time with progress indicators.

3. **After running**: Compare results to previous session. If a gate that was GREEN is now RED, flag: "⚠ Regression: typecheck was 12/12 last session, now failing. Suspect recent changes in:" and list changed files.

4. **On failure**: Do NOT just report the error. Diagnose:
   - Read the failing file
   - Check if the error is in code we changed this session
   - Suggest the most likely fix
   - Ask: "Fix, skip, or abort?"

5. **On success**: Update memory journal. Report trend: "CI stable: 3 consecutive GREEN runs."

### [A] Show PR status
Run `gh pr list --state open` and `gh pr list --state closed --limit 5`.
Report: number of open PRs, number of recently closed PRs, and whether the current branch can be PR'd.

### [B] Review current branch changes
Run `git log --oneline origin/main..HEAD` to show commits ahead of main.
Run `git diff origin/main..HEAD --stat` to show changed files.
Run `git status --short` to show working tree state.
Identify if there are uncommitted changes that need staging.

### [C] Create PR from current branch
1. Verify all CI gates pass (`/verify`).
2. If uncommitted changes exist, commit them with a conventional commit message summarizing the branch work.
3. Push the branch to origin.
4. Run `gh pr create --base main --title "..." --body "..."` with a title derived from the branch commits and a body listing changed files and verification status.
5. Report the PR URL.

### [D] Run CI + create PR in one shot
Combine [1] and [C]: run full verify first, then create the PR only if all gates pass.
If any gate fails, stop and report the failure — do not create the PR.

### [E] Merge PR and cleanup
1. If on a session branch, confirm the associated PR is merged.
2. Run `gh pr list --state merged --limit 5` to verify.
3. Switch to main: `git checkout main && git pull origin main`.
4. Report merged PR numbers and suggest deleting stale remote branches.

## Project Architecture

### Repository
```
kudbee/
  apps/web/          # Control Tower dashboard (Vite + React + TypeScript)
  services/
    ingestion/       # Express monolith (server.js, 5639 lines)
    memory/          # Think Token Forge + pgvector
    lib/             # Shared runtime (db, redis, groq, middleware)
    agents/          # Governance worker, receptor gating
  packages/
    opencode/        # Safe-Zone Engine (schema, gateway, mint, telemetry)
    types/           # Zod schemas
    utils/           # Crypto identity, LLM providers
  scripts/
    verify-e2e.mjs   # 38-check end-to-end verifier
  .kilo/
    command/         # Custom slash commands
    agent/           # Specialized subagents
    skill/kudbee/    # This skill
```

### CI Gates
- `npm run typecheck` — Turbo-routed, 12 tasks
- `bun test` — 46 tests in services/lib
- `npm run build` — Vite production build, main chunk 290 kB (target: <500 kB)
- `node scripts/verify-e2e.mjs` — 38 checks

### Key Config Files
- `kilo.json` — Project-level Kilo configuration
- `.mcp.json` — MCP server definitions
- `turbo.json` — Turborepo task pipeline
- `tsconfig.json` — Root TypeScript config
- `Procfile` — Heroku process definitions

---

## End-to-End Request Flow

```
Client (Vite SPA)
  │
  ├─→ Express Server (services/ingestion/server.js, port 3000)
  │     │
  │     ├─ [1] Request Duration Tracker ─ records per-route latency
  │     ├─ [2] Spheroid Audit ─ Redis stream kudbee:spheroid:audit
  │     ├─ [3] Rate Limiter ─ sliding-window + atomic Redis EVAL
  │     ├─ [4] 15s Timeout Guard ─ Heroku H27 protection
  │     ├─ [5] CORS Handler
  │     ├─ [6] Body Parser (express.json, 10mb limit)
  │     ├─ [7] Bearer Auth ─ HMAC + Ed25519 agent pass
  │     ├─ [8] KiloBridge Budget ─ Redis INCRBY token tracking
  │     ├─ [9] ECP Singleflight ─ GET dedup with response replay
  │     ├─ [10] API Rate Limiter (express-rate-limit)
  │     ├─ [11] Zod Validation ─ per-route schema checks
  │     │
  │     ├─ Sub-Routers:
  │     │   ├─ /api/audit       → auditRouter  (audit trail engine)
  │     │   ├─ /api/governance  → governanceRouter (HITL approval)
  │     │   ├─ /api/telemetry   → telemetryRouter + degradationRouter
  │     │   ├─ /api/system      → systemRouter (diagnostics, latencies)
  │     │   └─ /api/agents      → agentsRouter (LLM agent orchestration)
  │     │
  │     ├─ Neon Postgres ─ connection pool (max 20, pgvector)
  │     └─ Upstash Redis ─ adaptive circuit breaker (500k limit)
  │
  └─ SSE Stream: GET /api/os-stream ─ 5s os:snapshot events
```

---

## Middleware Pipeline (11 layers, all fail-open)

Each layer is wrapped with `MiddlewareGuard` — N consecutive failures trigger auto-bypass (fail-open). Guards auto-recover after cooldown (30s default).

| # | Name | File | Guard Threshold | What It Does |
|:--|:---|:---|:---|:---|
| 1 | Duration Tracker | `server.js` inline | — | Logs `[PERF_WARN]` (>3s) and `[http]` (>1s). Feeds route-latency buffer. |
| 2 | Spheroid Audit | `spheroidAuditMiddleware.ts` | 5/45s | Logs POST/PUT/PATCH/DELETE to Redis stream `kudbee:spheroid:audit` (MAXLEN 10000) |
| 3 | Rate Limiter | `rateLimiter.ts` | 5/30s | Sliding-window (in-memory Map). Atomic fallback via Redis EVAL Lua. Excludes health/static. |
| 4 | Timeout | `server.js` inline | 3/60s | 15s request timeout → 503. Prevents Heroku H27 SIGTERM. |
| 5 | CORS | `server.js` inline | — | `Access-Control-Allow-Origin` from `CORS_ALLOW_ORIGINS` env |
| 6 | Body Parser | `server.js` inline | — | `express.json({ limit: '10mb' })` |
| 7 | Bearer Auth | `bearerAuthMiddleware.ts` | 3/30s | HMAC SHA-256 + Ed25519 agent pass + `x-agent-pass` header. Sets `req.agentId`, `req.authenticated`. |
| 8 | KiloBridge | `kiloBridgeMiddleware.ts` | 3/30s | Atomic `INCRBY` token budget tracking per tenant. Daily cap (1M default). Headers: `X-Token-Budget-*` |
| 9 | ECP Singleflight | `ecpMiddleware.ts` | 3/60s | Dedup concurrent identical GETs. Captures + replays response status/headers/body. 5s TTL, periodic sweep 30s. |
| 10 | API Rate Limiter | `server.js` inline | — | `express-rate-limit`: 100 req/min general, 25 req/min ingest |
| 11 | Zod Validation | `zodValidationMiddleware.ts` | 2/30s | Per-route `safeParse` on body/query/params. Returns 400 with structured field errors. |

**Global Error Handler** (`globalErrorMiddleware.ts`) — last in chain. 4-arg Express error handler. Structured JSON with `traceId` + breadcrumbs. Self-healing catch.

---

## Redis Key Catalog

| Key Pattern | Type | TTL | Purpose |
|:---|:---|:---|:---|
| `kudbee:ratelimit:{key}` | ZSET (atomic) | window_ms | Atomic sliding-window rate limit timestamps |
| `kudbee:budget:{tenant}:daily:{date}` | STRING (INCRBY) | 86400s | KiloBridge per-tenant token usage |
| `kudbee:spheroid:audit` | STREAM | MAXLEN ~10000 | Spheroid audit ledger entries |
| `kudbee:breadcrumbs` | STREAM | MAXLEN ~500 | Error tracing breadcrumbs for Groq diagnosis |
| `kudbee-governance-tasks` | LIST (BRPOP) | — | Governance task queue (worker polling) |
| `kudbee-governance-tasks-failed` | LIST | — | Dead Letter Queue (DLQ, 3-attempt policy) |
| `kudbee:events` | PUB/SUB | — | Shared event channel for state transitions |
| `kudbee:telemetry_feed` | LIST (BLPOP) | — | Monitor worker polling queue |
| `kudbee:jobs:{queue}` | LIST (BRPOP) | — | Generic job queue |
| `kudbee:buffer:ftwb` | — | — | FTWB staging buffer |

---

## Database Schema (Neon Postgres + pgvector)

```
telemetry_traces    — canonical trace storage (trace_id, model, tokens, cost, status, timestamp)
telemetry_logs      — log-level trace storage (same structure + created_at)
security_violations — payload + violation_reason for rejected traces
telemetry_vectors   — pgvector embeddings (trace_id, vector JSONB, reasoning)
user_memories       — agent memory store (agent_id, embedding JSONB)
governance_actions  — HITL governance audit (signature, signed_payload, value_score)
think               — chain-of-thought archival (agent_id, task, phase, thought)
think_tokens        — Token Forge pgvector store (correction_delta, embedding VECTOR(1536))
vector_memory       — Generic vector store (text, embedding VECTOR(1536), metadata JSONB)
```

Connection pool: `max: 20`, `idleTimeout: 10s`, `connectTimeout: 5s`, `keepAlive: true`.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|:---|:---|:---|:---|
| `DATABASE_URL` | Yes | — | Neon Postgres connection string |
| `REDIS_URL` | Yes | — | Upstash Redis (rediss://) |
| `REDIS_SLOW_URL` | No | `REDIS_URL` | Dedicated Redis for HERMES/governance workers |
| `REDIS_WORKER_URL` | No | `REDIS_URL` | Dedicated Redis for worker processes |
| `GROQ_API_KEY` | No | — | Groq API for threat detection + think token synthesis |
| `STREAM_SECRET` | Yes | fallback | HMAC secret for SSE ticket-granting + bearer auth |
| `CORS_ALLOW_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `SAMPLE_RATE` | No | — | Telemetry sampling rate (1=all, 5=20%) |
| `TOKEN_BUDGET_DAILY` | No | 1,000,000 | KiloBridge daily token budget cap |
| `AGENT_REGISTRY_PATH` | No | — | Path to `agents.json` Ed25519 registry |
| `NODE_ENV` | No | `development` | `production` / `test` / `development` |
| `PORT` | No | 3000 | Express server port |

---

## SSE / OS Stream Architecture

```
Client → GET /api/os-stream (SSE)
  │
  ├─ EventSource connects
  ├─ Server sets: Content-Type: text/event-stream, Cache-Control: no-cache
  │
  ├─ Every 5s: event: os:snapshot
  │   data: { db, redis, governance, think, memory, alerts }
  │
  └─ Frontend: OsStreamProvider (React context) + useOsSnapshot() hook
       Wraps <App /> in main.tsx. All panels consume via context.
```

---

## Control Tower Tab Architecture (15 tabs)

| # | Tab | Icon | File | Route |
|:--|:---|:---|:---|:---|
| 0 | STUDIO | Monitor | `layouts/StudioRouter.tsx` | /tower/* |
| 1 | TELEMETRY | Activity | `pages/telemetry.tsx` | — |
| 2 | OBSERVABILITY | Gauge | `pages/observability.tsx` | — |
| 3 | THINK | Zap | `pages/think.tsx` | — |
| 4 | GOVERNANCE | Scale | `pages/governance.tsx` | — |
| 5 | CONTROL TOWER | Shield | `ControlTowerPanel` | — |
| 6 | HERMES | TerminalSquare | `pages/hermes.tsx` | — |
| 7 | SENTINEL | Radio | `pages/sentinel.tsx` | — |
| 8 | PLAYGROUND | Calculator | `PlaygroundView` | — |
| 9 | TERMINAL | TerminalSquare | `OllamaChat` | — |
| 10 | FIREWALL | Shield | `pages/firewall.tsx` | — |
| 11 | GATEWAY | Globe | `GatewayView` | — |
| 12 | INTERCEPTOR | Network | `InterceptorView` | — |
| 13 | HISTORY | History | `pages/history.tsx` | — |
| 14 | ALERTS | Bell | `AlertsPanel` | — |
| 15 | INTELLIGENCE | Search | `IntelligenceView` | — |
| 16 | SETTINGS | Settings | `SettingsView` | — |

---

## Backend Agent Inventory

| Agent | File | Purpose |
|:---|:---|:---|
| Governance Worker | `services/agents/worker.ts` | TCP BRPOP on `kudbee-governance-tasks`, 5s timeout, 3-attempt DLQ |
| HERMES Auditor | `services/agents/hermes.js` | Audit sweep, probe, log filter, crucible integration |
| Monitor Worker | `services/monitor/agent.js` | BLPOP on `kudbee:telemetry_feed`, 5s timeout |
| Sentinel Agent | `services/sentinel/src/index.ts` | Edge egress monitor, blast radius gauge |
| Agent Context Factory | `services/agents/src/context-factory.ts` | Builds hierarchical prompts for LLM agents |
| Token Forge | `services/memory/thinkTokenGenerator.ts` | pgvector recall + Gemini embedding |
| Receptor Gate | `services/memory/src/receptorGating.ts` | Gating engine for telemetry ingestion |
| Groq Client | `services/lib/groqClient.ts` | Threat detection + token match evaluation |
| Job Queue | `services/lib/jobQueue.ts` | Redis-backed queue with retry + dead-letter |
| Token Bucket | `services/lib/tokenBucket.ts` | Redis rate limiter (Groq 30/5rps, Gemini 100/10rps, Neon 100/20rps) |
| Circuit Breaker | `services/lib/circuitBreaker.ts` | groqBreaker + geminiBreaker (5 failures, 30s reset) |

---

## Workers (Procfile)

```
web:     tsx services/ingestion/server.js --max-old-space-size=512
worker:  tsx worker.js --max-old-space-size=256
sentinel: npx tsx services/sentinel/src/index.ts --max-old-space-size=256
```

---

## Common Debugging Scenarios

**Redis circuit breaker open:** Check `services/lib/redis.js` adaptive backoff state. Run `quotaBackoffState` inspection. Reset with successful ping.

**DB connection pool exhausted:** Check `services/lib/db.js` pool metrics. Max 20 connections, 10s idle timeout. Use `isDbHealthy()` for status.

**Middleware guard bypassed:** Check `services/lib/middlewareGuard.ts` guard stats. Guards auto-recover after cooldown. Reset with `guard.reset()`.

**Rate limit 429:** Check `services/lib/rateLimiter.ts` `getRateLimiterStats()`. Sliding window per IP key. Excluded paths: health, diagnostics, static assets.

**Budget exceeded 429:** Check `TOKEN_BUDGET_DAILY` env. KiloBridge uses Redis `INCRBY`. Headers: `X-Token-Budget-Used`, `X-Token-Budget-Remaining`.

**EE2E verification failures:** Check `scripts/verify-e2e.mjs`. 38 checks. Most common: Check 28 DLQ polling timeout (30s), Check 36 Token Forge retrieval.

**SSE stream disconnected:** Check `apps/web/src/hooks/useOsStream.ts`. Exponential backoff: `1000 * 2^retries` capped at 30s. Resets on reconnect.

**Build chunk too large:** Target <500 kB. Check `apps/web/vite.config.ts` manualChunks: vendor-react, vendor-router, vendor-motion, vendor-zustand, vendor-crypto.

---

## Rate Limiting Tiers

| Tier | Window | Max | Scope |
|:---|:---|:---|:---|
| DEFAULT_RATE_LIMIT | 60s | 300 | Global per-IP ceiling |
| PER_ENDPOINT_RATE_LIMIT | 60s | 60 | Per individual API route |
| UI_POLL_RATE_LIMIT | 60s | 600 | UI polling endpoints |
| API General (express-rate-limit) | 60s | 100 | All /api/ routes |
| Ingest (express-rate-limit) | 60s | 25 | /api/telemetry/ingest |
| KiloBridge Budget | daily | 1,000,000 | Per-tenant LLM tokens
