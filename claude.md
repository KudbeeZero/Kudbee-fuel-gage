# Kudbee Constitutional Law

This document codifies the engineering standards for all future development on the Kudbee-fuel-gage repository. Every agent instance—whether Flash or Pro—must adhere to these principles.

## 0. Resilient-First Architecture (Canonical Standard)

All services MUST be built **Resilient-First**: a missing or unreachable external
dependency (Neon Postgres, Redis, Gemini) must never crash the process. The system
degrades to a safe degraded state, logs a clear warning, and continues serving.

> **Graceful exit vs. crash — the line:**
> - **Crash (process.exit / throw at boot) ONLY** when the failure is
>   unrecoverable and violates a hard invariant required for ANY request to be
>   served (e.g. a fatal syntax error in the server itself).
> - **Graceful degrade** for ALL I/O dependency failures: DB unreachable,
>   Redis unreachable, LLM key missing/unresponsive. Log a `[WARN]`/warning and
>   return a degraded-but-valid response (`503`/`degraded` health, empty
>   results, or in-memory fallback state).

### 0.1 Error Handling Policy

- Wrap every external I/O call (DB, Redis, LLM) in `try/catch` and log a clear,
  actionable warning: identify the dependency, the operation, and the error.
- Health endpoints (`/health`, `/api/health-check`) MUST NOT crash on dependency
  failure — they report `degraded`/`unhealthy` and return `200` or `503`, never `500`.
- Never let an unhandled promise rejection from a fire-and-forget Redis write take
  down the event loop. Use `.catch()` on queued writes.
- Connection init failures are logged as warnings, NOT thrown. The process boots
  and serves; it self-heals when the dependency returns.

### 0.2 Database Connection Factory Pattern

- **Neon Postgres is the system of record.** Use a single shared `pg.Pool`
  (`services/lib/db.js` → `getDbPool()`), not per-request clients.
- The factory is **lazy and tolerant**: it reads `DATABASE_URL`, and if the
  variable is missing or the pool emits `error`, it logs a warning and marks the
  pool unhealthy. Queries then fall back to an in-memory store so the server still
  runs locally and in CI (no SQLite — SQLite is fully removed).
- Never `require('sqlite3')`. If you need a local dev fallback, use the
  in-process memory store exported by the factory, not a file-backed DB.
- All SQL identifiers live in `services/ingestion/migrations/*.sql` and are
  applied via the Neon MCP server or `pg_cron`, never executed at runtime boot.

### 0.3 Telemetry Schema Compliance

Every inbound telemetry event MUST:

- Pass `IngestRequestSchema` (Zod) validation in `packages/types` before any
  persistence.
- Be filtered by the ingest firewall: low-value / heartbeat events are dropped;
  only **critical traces** (see `triageWithGemini` / the deterministic cost-token
  rule) are persisted.
- Land in `telemetry_traces` (Neon) or the in-memory fallback with the canonical
  columns: `trace_id, model, tokens_in, tokens_out, cost, status, provider,
  project_name, timestamp`.
- Respect the 30-day TTL policy (see migration `002_telemetry_logs_and_user_memories_ttl.sql`):
  `telemetry_logs` and `user_memories` are purged after 30 days via `pg_cron`.

### 0.4 PR Workflow (Release Engineering Standard)

For every task/feature the Release Engineer MUST:

1. **Branch** — `git checkout -b feature/<task-name>` off `main`. NO direct
   pushes to `main`.
2. **Implement** — code + tests, adhering to §0.1–§0.3.
3. **Commit** — descriptive, conventional-ish message.
4. **Push** — `git push -u origin feature/<task-name>`.
5. **PR** — open a pull request against `main` with a structured body that
   includes the mandatory `### Struggles & Friction` section (§4).
6. **Verify** — run `node scripts/verify-e2e.mjs` and
   `node scripts/diagnose-redis.mjs`. The E2E suite is 11 checks; ALL 11 must
   pass (`11/11`).
7. **Merge or Report** — if `11/11` pass, merge the PR and delete the feature
   branch (local + remote). If any check fails, attach the specific failing logs
   to the PR and STOP for human review — do NOT force-merge.

### 0.5 Think / Thought-Stream Archival (The Full Loop)

The agent must close the loop from **code → verification → archival**. Every
task the Release Engineer performs MUST archive its chain-of-thought reasoning
into the `think` database:

- Use `hermes.archive_thought(thought_block)` (services/agents/hermes.js). The
  block shape is `{ agent_id, task, phase, thought, tokens_in, tokens_out, model }`.
- `archive_thought` is **Resilient-First**: a persistence failure is logged as a
  warning and returns `{ ok: false }` — it NEVER crashes the process. A thought
  is diagnostic metadata, not a hard invariant.
- Storage: Neon `think` table (system of record) with in-memory fallback when
  `DATABASE_URL` is unset/unreachable. Best-effort live mirror to the
  `kudbee:think:stream` Redis key for the dashboard thought-stream.
- The `think` table is covered by the 30-day TTL policy
  (`purge_expired_rows()` in migration `002_…ttl.sql`) — reasoning older than
  30 days is purged automatically.
- HTTP surface: `POST /api/think/archive` (persist) and
  `GET /api/think/archive` (list last N, or persist via query args).
- Frontend: the `!recall` command in `AgentTerminal` reads semantic memory; the
  Thought-Stream Interceptor surfaces `think` archival in real time.

### 0.6 HITL Governance Gate + Strict TypeScript (Frontend Binding)

The backend intelligence is bridged to the React/Vite dashboard through a
**Human-in-the-Loop (HITL)** gate. Standards:

- **Strict Typings** — all shared contracts live in `packages/types` as Zod
  schemas + inferred types. The `ApprovalRequest` type (`id, proposed_model,
  estimated_cost, reasoning_tokens, status`) and `ThinkThought` type are the
  canonical shapes. **Absolutely NO `any` is permitted** in this implementation;
  prefer `unknown` + narrowing, and concrete unions (`ApprovalStatus`,
  `ApprovalDecision`) over stringly-typed fields.
- **Data Hooks** — `apps/web/src/hooks/useGovernanceStream.ts` polls
  `GET /api/governance/pending` and exposes `submitApproval(id, 'APPROVE' |
  'REJECT')`; `useThinkStream.ts` fetches `GET /api/think/archive` (Think:
  Stream). Both hooks are Resilient-First (failures degrade to empty state,
  never throw).
- **UI Binding** — when a `PENDING_APPROVAL` exists, the dashboard surfaces a
  high-priority **"Governance Intervention Required"** card showing the proposed
  model, estimated cost, reasoning tokens, and the agent's reasoning, with
  Approve/Reject controls. The live reasoning tokens stream into the
  `AgentTerminal` ("Think: Stream" block) via `useThinkStream`.
- **Backend HITL Interceptor** — `POST /api/governance/resolve`
  (`{ id, decision }`) routes to approve/reject; `GET /api/governance/pending`
  maps proposed actions to `ApprovalRequest`. Both degrade gracefully
  (Resilient-First) if the router/DB is unreachable, logging warnings without
  crashing.
- **Verification gate** — every HITL change MUST pass `npm run lint`,
  `npm run typecheck` (0 errors), and the 11/11 E2E suite before merge.

## 1. PR Lifecycle Protocol

Every task requires the complete PR lifecycle:
1. **Branch** — Create a feature branch off `main`
2. **Commit** — Stage and commit changes with descriptive messages
3. **Push** — Push the branch upstream
4. **PR** — Open a pull request with a structured body
5. **Merge** — Merge the PR into `main`
6. **Delete** — Delete both the local and remote branch

**NO direct pushes to `main`.** All changes must flow through the PR lifecycle.

## 2. State Management

Redis is the state layer. Never hardcode state. Always read/write to `kudbee:...` namespaces.

- **Telemetry Feed:** `kudbee:telemetry_feed` (LPUSH/LTRIM)
- **Governance Ledger:** `kudbee:governance_actions` (ZADD with timestamp score)
- **Community Metrics:** `kudbee:community_value_score`, `kudbee:governance_count`, `kudbee:verified_traces`
- **Agent Memory:** `kudbee:system:context` (no TTL, persists indefinitely)
- **Session History:** `kudbee:session_history` (LPUSH, no TTL)
- **Alerts:** `kudbee:alerts` (LPUSH)
- **Backpressure:** `kudbee:throttle_factor` (SET/DEL)

All backend services must use `ioredis` with connection pooling and retry strategies.

## 3. Type Safety

TypeScript + Zod schemas are mandatory. All telemetry events must be validated at runtime.

- Define schemas in `packages/types/index.ts`
- Validate all inbound payloads using Zod before processing
- Use TypeScript strict mode across all workspaces
- Never bypass type checking with `any` or `@ts-ignore`

### 3.1 Monorepo Package Export Pattern (MANDATORY)

Every internal `@kudbee/*` package MUST expose its public surface through an
explicit `exports` map in `package.json`. This is a hard, non-negotiable
standard for all future packages — do not rely on the bare `"main"`/`"types"`
resolution for subpath imports.

- **Always declare an explicit subpath export for every documented entrypoint.**
  If a package exposes a module (e.g. `plugin.ts`), the map MUST include it:
  ```json
  "exports": {
    ".": "./index.ts",
    "./plugin": "./plugin.ts"
  }
  ```
- **Every subpath module MUST be re-exported from the package root** (`index.ts`)
  via `export * from './plugin.js';` so that `import { X } from '@kudbee/types'`
  and `import { X } from '@kudbee/types/plugin'` BOTH resolve.
- **Why this is mandatory:** when an interface like `IKudbeePlugin` is imported
  from a subpath that is missing from the `exports` map, the compiler cannot
  resolve the type and silently falls back to `unknown`. That fallback makes
  every property in a downstream object literal throw a "known properties" error
  under strict mode. Explicit subpath mapping + root re-export eliminates the
  failure class entirely. (See archived thought `task=agentic-rack-assembly`.)
- Prefer importing shared types from the **package root** in app code
  (`@kudbee/types`) so the workspace symlink resolves the barrel file directly.

## 4. Memory Layer

Every successful PR must include a `### Struggles & Friction` section in the PR body to be consumed by the Session Logger.

This section must:
- List any obstacles encountered during implementation
- Describe workarounds or solutions applied
- Serve as training data for future agent instances

The Session Logger workflow (`.github/workflows/session-log.yml`) automatically extracts this section and persists it to `kudbee:session_history`.

## 5. Architecture Philosophy

**"Self-Observing, Self-Healing, Self-Logging."**

- **Self-Observing:** The system monitors its own health via `/api/health-check` and `/api/session-history`
- **Self-Healing:** The agent shell detects failure rates >50% and automatically throttles ingress via `kudbee:throttle_factor`
- **Self-Logging:** Every PR merge generates a session manifest with lessons learned for future agents

## 6. Performance Standards

- All cryptographic verification + Redis write loops must remain under **200ms**
- Dashboard polling interval: **5 seconds**
- Traffic simulator interval: **200ms** (throttle-aware)
- Rolling window for failure rate tracking: **60 seconds**

## 7. Deployment Standards

- **Heroku Procfile** must include both:
  - `web: node services/ingestion/server.js`
  - `worker: node services/monitor/agent.js`
- All environment variables must be injected via GitHub Actions secrets
- Never commit secrets or API keys to the repository

## 8. MCP-Native Integration Priority

All future tool integrations must prioritize MCP-native connections over custom REST API builds to keep the codebase lean and costs at zero.

- **MCP First:** Before building a custom REST endpoint for data retrieval, query, or reporting, evaluate if an MCP server can fulfill the requirement.
- **Neon Postgres:** The Neon MCP server (`@neondatabase/mcp-server`) is configured in `.mcp.json` and provides natural-language database access. Use it for ad-hoc reporting, analytics, and data exploration instead of building custom GET endpoints.
- **Deprecation Policy:** Custom REST endpoints built before this standard remain functional but should not be extended. New features must use MCP where possible.
- **Cost Discipline:** MCP connections reuse existing infrastructure (Neon Postgres, Redis) and do not introduce new service costs. Avoid building standalone microservices for simple data access patterns.
