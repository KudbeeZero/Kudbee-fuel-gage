# Kudbee Agentic Rack System — Kilo Agent Guide

## Mission

This document is the single source of truth for autonomous and semi-autonomous contributors (agents, Kilo, CI jobs, and human reviewers) operating inside the Kudbee monorepo. It encodes architecture, contracts, patterns, and anti-patterns discovered through production incidents and CI failures.

---

## 1. Repository Topology

```
kudbee/
  apps/
    web/            # Control Tower dashboard (Vite + React)
    mobile/         # React Native companion
  services/
    ingestion/      # Canonical Express monolith (server.js)
    memory/         # Think Token Forge + pgvector store
    sentinel/       # Edge polling agent
    agents/         # Governance worker, receptor gating
    lib/            # Shared runtime (db, redis, groq, circuit breaker)
  packages/
    types/          # Zod schemas + shared types
    utils/          # Crypto identity, LLM providers, prompts
  config/
    agents.json     # Ed25519 public-key registry (NO private keys)
   scripts/
     verify-*.mjs    # E2E and subsystem verifiers
     cloud-agent.mjs  # Inter-agent P2P calls, voicemail, emergency interrupts
     session-bootstrap.mjs  # Agent startup voicemail replay
     think-compact.mjs # Zero-waste token compaction & DPO annotation
     bus-debouncer.mjs # Serial bus event deduplication
     bus-to-cache.mjs  # Interrupt-driven BUS→CACHE bridge
   .kilo/
     memory/
       voicemails/    # Per-agent voicemail JSON storage
       local-calls/   # Emergency interrupt records
       decisions/     # DPO preference pair annotations
   .github/
    workflows/      # CI gates
```

### Canonical Server

- **Single source of truth:** `services/ingestion/server.js`
- **Do not create** `server.ts`, `server.mjs`, or duplicate entrypoints.
- The `server.js` file is the transpiled runtime entrypoint executed by `tsx` in development and CI.
- All routes, middleware, and sub-routers are mounted inside this file.

---

## 2. Runtime & Environment Contracts

### Node & Package Manager

- **Node:** `>=22.0.0` (enforced in root `package.json` engines).
- **Package manager:** `npm@10.9.8` (workspace-aware, turbo monorepo).
- Install dependencies at the **repo root** with `npm install`. Do not run `npm install` inside individual workspace packages unless debugging isolated dependency trees.

### Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | Yes (for persistence) |
| `REDIS_URL` | Primary Redis (telemetry, pub/sub, rate-limit) | Yes (for full fidelity) |
| `GROQ_API_KEY` | Groq LPU inference API key | No (graceful degrade) |
| `GROQ_MODEL` | Groq model override (default: `llama-3.1-8b-instant`) | No |
| `STREAM_SECRET` | HMAC signing key for SSE stream tickets | Yes (for SSE auth) |
| `EDGE_AGENT_PASS` | Authentication pass for edge sentinel | No |
| `SENTINEL_AGENT_PASS` | Authentication pass for sentinel agent | No |
| `NODE_ENV` | Runtime environment (`test`, `production`) | Yes |
| `PORT` | HTTP server port (Heroku dynamic binding) | Yes |

### Loading `.env` Locally

- **Always** add `try { process.loadEnvFile('.env'); } catch {}` at the top of standalone `.mjs` scripts that need local secrets.
- Do not rely on `dotenv` package unless already present in the workspace.
- Never commit `.env` files. Use `config/.env.example` as the canonical reference.

---

## 3. Authentication & Authorization

### Agent Pass Protocol (`X-Agent-Pass`)

The ingestion server authenticates mutating endpoints via an Ed25519-signed `AgentPass` passed in the `X-Agent-Pass` header.

**Flow:**
1. Generate an Ed25519 key pair (`crypto.generateKeyPairSync`).
2. Add the **public key** to `config/agents.json` under `registry[]` with `status: "active"`.
3. **Never** commit the private key. Hold it only in memory or secure storage.
4. Create a pass: `sign(privateKey, "${agentId}:${issuedAt}")` → base64.
5. Serialize: `Buffer.from(JSON.stringify({ agentId, issuedAt, signature })).toString('base64')`.
6. Send as `X-Agent-Pass` header.

**Verification:**
- `deserializePass` → parse base64 JSON.
- `AGENT_REGISTRY.get(agentId)` → fetch public key.
- `verifyAgentPass` → check `Math.abs(Date.now() - issuedAt) < 60_000` and `crypto.verify`.

### Stream Ticket Auth (`Authorization` / SSE)

- `STREAM_SECRET` is used **only** for SSE stream ticket HMAC signing.
- The `/api/auth/stream-ticket` endpoint signs single-use tokens with `crypto.createHmac('sha256', STREAM_SECRET)`.
- **Do not** confuse `STREAM_SECRET` with `X-Agent-Pass`. They serve different auth planes.

### Test-Mode Auth Helpers

When writing verification scripts that need to call authenticated endpoints:
- Generate a throwaway Ed25519 identity at script startup.
- Write the public key to `config/agents.json` **before** starting the server.
- Start the server with `NODE_ENV: 'test'`.
- Use the signed pass in `X-Agent-Pass` for all requests.
- Restore `config/agents.json` to its original state after the test if needed.

---

## 4. Database Patterns (Neon Postgres + pgvector)

### Connection

- Use the shared `getDbPool()` from `services/lib/db.js`.
- The pool is initialized lazily from `DATABASE_URL`.
- All queries must be wrapped in `withTimeout(promise, ms, label)` to prevent connection leaks.
- On query failure, degrade to `runInsert` / `runQuery` fallbacks; never throw to the HTTP layer.

### Schema Migrations

- Migrations live in `services/ingestion/migrations/`.
- The server auto-runs migrations on boot (`ensureSchema` / `ensureLedgerSchema`).
- Key tables: `think_tokens`, `vector_memory`, `telemetry_logs`, `audit_anchors`, `governance_actions`, `system_topology_embeddings`.

### pgvector Usage

- Embeddings are **always** 1536-dimensional (`EMBEDDING_DIM = 1536`).
- Store as `vector` literal: `[${coords.join(',')}]`.
- Similarity search: `1 - (embedding <=> $1::vector) AS similarity`.
- **Think Tokens** live in `think_tokens` with `status` in `('PENDING_APPROVAL', 'VERIFIED', 'RECYCLED')`.
- **General vector memory** lives in `vector_memory` with `metadata` JSONB.

### Think Token Minting Contract

```typescript
mintThinkToken({
  traceId, taskContext, failedState, correctionDelta,
  reasoningSteps, status, kd, efficacy, locked_by
}): Promise<MintThinkTokenResult>
```

- **Never** blocks on Redis for telemetry (best-effort `publishEvent`).
- Inserts into `think_tokens` with a 1536-dim trajectory embedding.
- Broadcasts `think_token_minted` on `kudbee:think:tokens` Redis channel.

---

## 5. Redis Patterns

### Connection Resilience

- Redis is **optional** for many subsystems. The codebase uses `Resilient-First`:
  - If `REDIS_URL` is unreachable, the server starts in degraded mode.
  - Pub/sub, rate-limiting, and worker loops degrade gracefully.
  - Health endpoint reports `redis: "unhealthy"` but still returns `200`.

### Channels

| Channel | Purpose |
|---|---|
| `kudbee:events` | Unified event bus (SSE + audit) |
| `kudbee:think:tokens` | Think token mint telemetry |
| `kudbee:governance:*` | Governance action lifecycle |

### Rate Limiting

- `apiLimiter`: 100 req/min (1000 in `test`).
- `ingestLimiter`: 25 req/min (500 in `test`).
- Both use `express-rate-limit` with `keyGenerator: ipFromRequest`.

---

## 6. Groq LPU Inference

### Client

- Module: `services/lib/groqClient.ts`
- Endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Default model: `llama-3.1-8b-instant` (override with `GROQ_MODEL`).
- **Resilient-First:** if `GROQ_API_KEY` is missing, all synthesize/evaluate functions return `{ ok: false, error: 'Groq not configured' }` without throwing.

### Budget Gate

- `services/lib/budgetGate.ts` enforces monthly spend caps.
- `checkBudgetOrThrow(tokensIn, tokensOut, model)` throws `BudgetExceededError` (HTTP 402) if projected spend exceeds `MONTHLY_BUDGET_USD`.
- Always call `checkBudgetOrThrow` **before** `provider.complete()`.

### Known Import Pitfall

- `groqClient.ts` imports `./budgetGate` using explicit `.ts` extension: `from './budgetGate.ts'`.
- Other modules in `services/lib/` import `.js` extensions (e.g., `./redis.js`) because they have hand-written JS counterparts.
- **Never** change `groqClient.ts` to import `./budgetGate.js` — the `.js` file does not exist and tsx will fail to resolve it.

---

## 7. Testing & Verification Strategy

### Local Verification Scripts

All scripts live in `scripts/` and are `.mjs` (native ESM).

| Script | Purpose | Port |
|---|---|---|
| `verify-e2e.mjs` | Full 36-check E2E suite | 9876 |
| `verify-think-loop.mjs` | Think token mint + vector retrieval | 9878 |
| `verify-governance-loop.mjs` | Governance promotion + recycling | 9877 |
| `mint-root-token.mjs` | Mint official Token #001 with Groq | 9879 |
| `diagnose-groq.mjs` | Verify Groq LPU connectivity | — |
| `verify-agents.mjs` | Agent identity + pass verification | — |

### How to Run Verifiers

1. **Install deps:** `npm install` at repo root.
2. **Ensure Neon:** `DATABASE_URL` must be set.
3. **Run individually:** `node scripts/<name>.mjs`.
4. **Run E2E:** `node scripts/verify-e2e.mjs` (must pass 36/36).

### CI Gates (must pass before PR merge)

1. `npm run typecheck` — Turbo-routed TypeScript strict check.
2. `npm run lint` — Turbo-routed linting.
3. `node scripts/verify-e2e.mjs` — 43/43 checks (38 core + 5 inter-agent phone tree).

### Common Test Failure Causes

- **Missing `npm install`:** server.js fails with `ERR_MODULE_NOT_FOUND` for `express`, `pg`, `ioredis`.
- **Wrong import extensions:** `groqClient.ts` must import `./budgetGate.ts`, not `.js`.
- **Redis not running:** Many checks degrade gracefully, but `verify-e2e.mjs` check 28 (DLQ) and check 27 (worker) need Redis. In CI, Redis is provided as a service.
- **Auth missing:** `/api/governance/mint-think-token` requires `X-Agent-Pass`. Unauthenticated calls return `401`.
- **Receptor gate:** Mints with `kd > 0` or `efficacy === 0` trigger receptor gating and may return `423` if the slot is locked. For tests, omit gating params or use `kd: 0`.
- **Agent registry stale:** If you generate a new key pair but forget to update `config/agents.json`, signature verification fails with `401`.

---

## 7a. Inter-Agent Phone Tree (Phase: Phone Tree Hardening)

### P2P Calls (`scripts/cloud-agent.mjs`)

- **Entrypoint:** `node scripts/cloud-agent.mjs call <agentId> [--priority=LEVEL]`
- **Live call timeout:** 3000ms → voicemail fallback on timeout or offline detection (>45s heartbeat gap).
- **Voicemail storage:** `.kilo/memory/voicemails/<agentId>.json` with strict schema (id, callerId, timestamp, urgency, transcript, requiredAction, read).
- **Emergency interrupt:** `--priority=CRITICAL` publishes `agent:interrupt:<targetAgentId>` over `kudbee:agent:interrupt:*` Redis pub/sub, appends to `.kilo/memory/local-calls/interrupts.json`, emits `system:interrupt`.

### Session Bootstrap (`scripts/session-bootstrap.mjs`)

- On agent startup, inspects `.kilo/memory/voicemails/<agentId>.json`.
- Replays unread voicemails to stdout, marks them `read: true` / `deliveredAt: <ISO>`, emits `agent:voicemail:replayed` to `kudbee:events`.

### BUS→CACHE Bridge (`scripts/bus-to-cache.mjs`)

- `--listen` subscribes to `kudbee:agent:interrupt:*` and flushes `agent-state`, `dashboard`, `decisions-recent` L1/L2 caches on interrupt.

### Bus Debouncer (`scripts/bus-debouncer.mjs`)

- `deduplicateEvents(events)` suppresses duplicate status checks within a 5s window.
- Exports `{ isDuplicate, deduplicateEvents, isNoise }`.

### DPO Preference Annotation

- P2P completions tagged `trajectory_quality: OPTIMAL` (CHOSEN).
- Voicemail/interrupt fallbacks tagged `trajectory_quality: ESCALATED` (REJECTED).
- Annotations written to `.kilo/memory/decisions/dpo_<category>_<ts>.json`.

### Token Compaction (`scripts/think-compact.mjs`)

- `compactTrajectory(payload)` minifies keys, converts ISO to ms deltas, strips null/empty noise.
- Pipe via stdin: `echo '<json>' | node scripts/think-compact.mjs`.

---

## 8. Governance & Worker Patterns

### Task Queue (Redis BRPOP)

- Queue: `kudbee-governance-tasks`
- Worker: `services/agents/worker.ts`
- Poll interval: 5-second blocking timeout (`BRPOP`).
- Max attempts: 3. After 3 failures → Dead Letter Queue (`kudbee-governance-tasks-failed`).

### State Transitions

```
QUEUED → PROCESSING → SUCCESS / FAILED / DEAD_LETTERED / RETRY_QUEUED / DISCARDED
```

All transitions are broadcast on `kudbee:events` Redis pub/sub.

### Receptor Gating

- Token types: `ORDINARY`, `CHALLENGE_TOKEN`, `ADMIN`.
- Admission evaluated by `services/memory/src/receptorGating.ts`.
- Slots are locked per `(tokenType, x, y, z)` coordinate.
- `x-admin-bypass: true` header admits ADMIN tokens unconditionally.

---

## 9. Think Token Forge (Phase 28+)

### Minting

- Endpoint: `POST /api/governance/mint-think-token`
- Auth: `X-Agent-Pass` required.
- Body: `traceId`, `taskContext`, `failedState`, `correctionDelta`, optional `reasoningSteps`, `status`, `kd`, `efficacy`.
- Returns: `tokenId`, `embedding_dim` (always 1536).

### Retrieval

- Endpoint: `GET /api/memory/think-tokens?prompt=...&limit=...`
- Backed by `getRelevantThinkTokens()` in `services/memory/vectorStore.ts`.
- Queries `think_tokens` via `1 - (embedding <=> $1::vector) similarity`.
- Prefers `VERIFIED` tokens; falls back to all tokens if none are verified.

### Vector Memory Sync

- `think_tokens` stores the canonical token + trajectory embedding.
- `vector_memory` stores arbitrary text+embedding pairs for general semantic recall.
- Use `storeMemoryText(text, metadata)` from `vectorStore.ts` to write to `vector_memory`.
- **Minting does NOT auto-sync to `vector_memory`.** Call `storeMemoryText` explicitly if needed.

---

## 10. Frontend & Build

### Dashboard

- Built with Vite in `apps/web/`.
- API base URL resolved from `REACT_APP_API_URL` or same-origin.
- Lazy-loaded chunks are emitted to `apps/web/dist/assets/`.

### Mobile

- React Native app in `apps/mobile/`.
- Type-checked in CI via `cd apps/mobile && npx tsc --noEmit`.

---

## 11. Security & Secrets

### Private Keys

- **Never** commit private keys. `config/agents.json` contains **only** public keys.
- Private keys are generated at runtime by agents and held in memory or secure storage.

### API Keys

- `GROQ_API_KEY`, `GEMINI_API_KEY`, `LANGCACHE_API_KEY` are runtime secrets.
- In AI Studio / Heroku, inject via Secrets panel or config vars.
- In local dev, use `.env` (git-ignored).

### Stream Secret

- `STREAM_SECRET` is used for HMAC signing of SSE tickets.
- Rotate via config var; no code deploy required.
- In CI, generated as `ci-generated-stream-secret-key-32b`.

---

## 12. Common Pitfalls & Lessons Learned

1. **`groqClient.ts` import path:** Must be `./budgetGate.ts`. The `.js` counterpart does not exist. tsx resolves `.ts` extensions correctly but fails on missing `.js` files.

2. **Agent registry is loaded at boot:** Modifying `config/agents.json` after `server.js` starts has no effect. Always write the registry **before** spawning the server.

3. **Key pair regeneration breaks auth:** If you generate a new Ed25519 key pair but forget to update `config/agents.json`, signature verification fails silently (returns `401`). Always sync the public key to the registry.

4. **Redis is optional but noisy:** Without Redis, expect `ECONNREFUSED` logs. This is expected behavior. The server degrades gracefully.

5. **Receptor gate rejects high-kd tokens in test:** When `kd > 0` and no gating params are provided, the receptor may return `423`. For pure verification, omit `kd`/`efficacy` or set `kd: 0`.

6. **`think_tokens` vs `vector_memory`:** These are separate tables. `think_tokens` stores governance tokens with trajectory embeddings. `vector_memory` stores general semantic chunks. Minting a token does **not** automatically sync to `vector_memory` — call `storeMemoryText()` explicitly if needed.

7. **`verify-e2e.mjs` expects 401 for unauthenticated mints:** Checks 14, 16, and 17 treat `401` as a pass because they verify the auth gate exists, not that unauthenticated minting succeeds.

8. **`npm install` must run at root:** Workspace hoisting means root `node_modules` contains shared deps. Running `npm install` inside `services/ingestion/` alone will miss workspace packages.

9. **`server.js` is the canonical entrypoint:** Do not create alternative entrypoints. All transpilation is handled by `tsx` at runtime.

10. **`NODE_ENV=test` relaxes rate limits but NOT auth:** Test mode increases rate-limit windows but does not bypass `X-Agent-Pass` authentication.

---

## 13. Quick Reference: Campaign 2 (Mint Token #001)

```bash
# 1. Hygiene
git checkout main && git pull origin main
git checkout -b feat/mint-think-token-001

# 2. Diagnose Groq
node scripts/diagnose-groq.mjs

# 3. Mint Token #001
node scripts/mint-root-token.mjs

# 4. Verify
node scripts/verify-think-loop.mjs
node scripts/verify-e2e.mjs   # must pass 36/36

# 5. Commit & PR
git add scripts/diagnose-groq.mjs scripts/mint-root-token.mjs \
     scripts/verify-think-loop.mjs services/lib/groqClient.ts
git commit -m "feat(think): mint root think token #001 with groq LPU trajectory"
git push -u origin feat/mint-think-token-001
gh pr create --draft --title "feat(think): Mint Official Think Token #001 & Vector Verification" \
  --body "Synthesizes and anchors root Think Token #001 into Neon pgvector via Groq LPU pipeline."
```

---

## 14. Escalation & Review

- **Code review required for:** auth changes, DB schema migrations, receptor gating logic, `groqClient.ts` modifications.
- **Can be self-merged:** documentation, verification scripts, test fixtures, dependency patches that do not alter runtime behavior.
- **Never merge without:** `npm run typecheck`, `npm run lint`, and `node scripts/verify-e2e.mjs` all passing.

---

## 15. Quick Reference: Campaign 3 (Safe-Zone & Trajectory Interception Engine)

```bash
# 1. Hygiene
git checkout main && git pull origin main
git checkout -b feat/kudbee-safe-zone-engine

# 2. Create engine package
mkdir -p packages/opencode/src/kilocode/kudbee

# 3. Run local verification from packages/opencode/
cd packages/opencode
bun run typecheck
bun test

# 4. Commit atomic zones
git add packages/opencode/src/kilocode/kudbee/{schema,gateway,mint,telemetry,events,tools,index}.ts
git add packages/opencode/test/kilocode/kudbee/engine.test.ts
git commit -m "feat(engine): Zones 1-6 — Safe-Zone Schemas + Gateway + Mint + Telemetry + Events + Tools"

# 5. Mark upstream modifications
# kilocode_change must prefix any touch to apps/web/src/hooks/useToolInterceptor.ts
# kilocode_change must prefix any touch to services/agent/cli.ts

# 6. Push & PR
git push -u origin feat/kudbee-safe-zone-engine
gh pr create --draft --title "feat(engine): Kudbee Safe-Zone & Trajectory Interceptor Engine" \
  --body "Implements Campaign 3 across atomic commits with strict schema contracts, resilient environment bindings, and // kilocode_change upstream markers."
```

### Campaign 3 Contracts

| Zone | File | Contract |
|---|---|---|
| 1 | `packages/opencode/src/kilocode/kudbee/schema.ts` | Zero `any` types. Single-word identifiers where possible (`cfg`, `err`, `state`, `out`). |
| 2 | `packages/opencode/src/kilocode/kudbee/gateway.ts` | `ControlTowerGateway` wraps native `fetch` — no external HTTP client. |
| 3 | `packages/opencode/src/kilocode/kudbee/mint.ts` | `mintToken` returns strict `MintedToken`. Deterministic `sha256` hash via `node:crypto`. |
| 4 | `packages/opencode/src/kilocode/kudbee/telemetry.ts` | `publishTelemetry` drops gracefully when `UPSTASH_TELEMETRY_URL` is unset and no Redis sink is provided. |
| 5 | `packages/opencode/src/kilocode/kudbee/events.ts` | `EngineBus` terminates on error to prevent cascading failures. |
| 6 | `packages/opencode/src/kilocode/kudbee/tools.ts` | `KudbeeNativeRegistry` executes handlers in strict `try/catch` — never throws. |
| 7 | `apps/web/src/hooks/useToolInterceptor.ts` | Marked with `// kilocode_change`. Evaluates safe-zone trajectory before tool execution. |
| 8 | `services/agent/cli.ts` | Marked with `// kilocode_change`. Bootstraps `SafeZoneEngine` before orchestrator dispatch. |
| 9 | `packages/opencode/test/kilocode/kudbee/engine.test.ts` | 14 passing unit tests covering schema validation, minting, events, registry, engine, telemetry, gateway. |
| 10 | `.kilo/agent/AGENTS.kilo.md` | This section. |

### Environment Reminders

- **Heroku:** `REDIS_URL` and `DATABASE_URL` are the only guaranteed Redis connections. `REDIS_SLOW_URL` is blocked by Heroku — the resilient fallback factory in `services/lib/redis.js` routes safely through the primary string.
- **Local:** All standalone scripts must `try { process.loadEnvFile('.env'); } catch {}` so `.env` secrets are available without explicit `dotenv` imports.
- **Secrets:** `DATABASE_URL`, `REDIS_URL`, `GROQ_API_KEY`, `HEROKU_API_KEY`, `STREAM_SECRET`. Never hardcode in source.

### Production Hardening Patterns (20-Commit Sprint)

- **Browser crypto isomorphism:** `packages/opencode/src/kilocode/kudbee/mint.ts` and `index.ts` use `globalThis.crypto.randomUUID()` with a Math.random fallback, and `crypto.subtle.digest('SHA-256', ...)` for hashing. This fixes Vite browser bundling errors externalizing Node `crypto`.
- **Adaptive Redis circuit breaker:** `services/lib/redis.js` wraps Upstash connections with an adaptive retry strategy that opens on `MAX_REQUESTS_LIMIT` (500k) and backs off exponentially up to 30s.
- **Worker exponential backoff:** `services/agents/worker.ts` tracks `backoffMs` per tick. On rate-limit errors, backoff doubles up to `MAX_BACKOFF_MS` (30s). On success, resets to `BASE_BACKOFF_MS` (1s).
- **Safe-zone telemetry schema:** `SafeZoneTelemetryMetadataSchema` in `packages/opencode/src/kilocode/kudbee/schema.ts` enforces strict typing for zone_id, trajectory_hash, threat_score, kd, efficacy, and timestamp.
- **BusEvent.define pattern:** `events.ts` exports `KudbeeEvents.trajectory` and `KudbeeEvents.governance_lock` via `BusEvent.define()` for typed event constants.
- **Tool.define pattern:** `tools.ts` exports `Tool.define(entry)` for declaring native tool handlers with strict typing.
- **CLI and web hooks:** `services/agent/cli.ts` and `apps/web/src/hooks/useToolInterceptor.ts` bootstrap `SafeZoneEngine` with `// kilocode_change` markers for upstream sync tracking.
- **E2E DLQ timeout:** `scripts/verify-e2e.mjs` Check 28 polls the DLQ with a 30s deadline to accommodate slower Redis rate-limit recovery.
