# Kudbee Agentic Rack System — AGENTS.md

> **Head file** — first file read on session start. See `.kilo/agent/AGENTS.kilo.md` for the canonical global agent guide (architecture, contracts, patterns, anti-patterns). This file holds session-level instructions only.

## Worker Polling Strategy

The governance task worker (`services/agents/worker.ts`) polls the task queue using a **TCP BRPOP** pattern against the Redis queue `kudbee-governance-tasks`. Each poll uses a **5-second blocking timeout** before the worker loops again. When a task is consumed it is processed serially in a single background loop.

## Retry & DLQ Policy

- **MAX_ATTEMPTS:** 3. A task that throws 3 consecutive times is atomically moved to the **Dead Letter Queue** `kudbee-governance-tasks-failed` (aliased as `TASK_DLQ` in code) for operator review.
- State transitions (`QUEUED` → `PROCESSING` → `SUCCESS` / `FAILED` / `DEAD_LETTERED` / `RETRY_QUEUED` / `DISCARDED`) are broadcast over the shared `kudbee:events` Redis pub/sub channel.

## CI Gates

1. `npm run typecheck` — Turbo-routed TypeScript strict check across the monorepo.
2. `npm run lint` — Turbo-routed linting.
3. `node scripts/verify-e2e.mjs` — End-to-end verification suite (43 checks: 38 core + 5 inter-agent phone tree).

## Safe-Zone Engine Lifecycle

- **Singleton pattern:** `SafeZoneEngine` is instantiated once per process (CLI, web hook) and reused for the session lifetime.
- **Bootstrap:** `engine.bootstrap(workspaceRoot)` wires the Control Tower gateway, registers native tools, and emits `TRAJECTORY_UPDATE` events.
- **Trajectory evaluation:** `engine.evaluateTrajectory({ target, vector, velocity })` computes threat scores, mints interception tokens when breached, and publishes telemetry via Upstash Redis pub/sub.
- **Circuit breaker:** Upstash Redis connections use an adaptive circuit breaker that opens on `MAX_REQUESTS_LIMIT` (500k) and backs off exponentially up to 30s.

## Inter-Agent Phone Tree (Voicemail & Emergency Interrupt)

- **P2P call entrypoint:** `node scripts/cloud-agent.mjs call <agentId> [--priority=LEVEL]`
- **Live call timeout:** 3000ms before voicemail fallback.
- **Offline detection:** Agent is offline if the last heartbeat in `.kilo/memory/voicemails/<agentId>_heartbeat` is older than 45s.
- **Voicemail storage:** `.kilo/memory/voicemails/<targetAgentId>.json` — array of voicemail objects.
- **Voicemail payload schema:**
  ```json
  { "id": "vm_<uuid>", "callerId": "<id>", "timestamp": "<ISO>",
    "urgency": "LOW|MEDIUM|HIGH|CRITICAL", "transcript": "<body>",
    "requiredAction": "<type>", "read": false }
  ```
- **Emergency interrupt:** `--priority=CRITICAL` publishes `agent:interrupt:<targetAgentId>` over Upstash Redis Pub/Sub, appends to `.kilo/memory/local-calls/interrupts.json`, and emits `system:interrupt` to the serial bus.
- **Session bootstrap:** `scripts/session-bootstrap.mjs` replays unread voicemails on agent startup, marks them `read: true` / `deliveredAt: <ISO>`, and emits `agent:voicemail:replayed` to the bus.
- **Test command:** `node scripts/cloud-agent.mjs test-voicemail` runs E2E voicemail verification in-process.

## BUS→CACHE Bridge & Serial Bus

- **Cache flush on interrupt:** `scripts/bus-to-cache.mjs --listen` subscribes to `kudbee:agent:interrupt:*` and flushes `agent-state`, `dashboard`, `decisions-recent` L1/L2 caches on SYSTEM INTERRUPT.
- **Bus debouncer:** `scripts/bus-debouncer.mjs` suppresses consecutive duplicate status checks and empty voicemail polling sweeps (5s dedup window). Exports `{ isDuplicate, deduplicateEvents }`.
- **Channels:** `kudbee:agent:interrupt:<agentId>`, `kudbee:events` (unified event bus).

## Zero-Waste Token Compaction & DPO Annotation

- **Compactor entrypoint:** `scripts/think-compact.mjs` — exports `compactTrajectory(payload)`.
- **Compaction rules:** Minifies JSON key boilerplate (e.g. `trace_id` → `tid`), converts ISO timestamps to relative millisecond deltas, strips null/empty noise.
- **DPO preference annotation:** Fast direct P2P completions tagged `trajectory_quality: OPTIMAL` (CHOSEN path). Voicemail/interrupt fallbacks tagged `trajectory_quality: ESCALATED` (REJECTED path). Annotations committed to `.kilo/memory/decisions/dpo_<category>_<ts>.json` for automated DPO training preference pair generation.
- **Stream to memory:** `echo '<json>' | node scripts/think-compact.mjs` — compacts stdin, commits to `.kilo/memory/`, and auto-annotates DPO.

## Key References

| File | What It Contains |
|:---|:---|
| `.kilo/agent/AGENTS.kilo.md` | Canonical global agent guide (all architecture, contracts, patterns) |
| `README.md` → **Documentation Scan** | Full `.md` inventory, work notes, project status |
| `OUTING_PLAN.md` | 20-phase enterprise hardening plan |
| `STATE_OF_THE_OS.md` | 25 documented production fixes |
| `.kilo/plans/PRODUCTION_AUDIT.md` | 263 audit findings |
| `BUILD.md` | Current architecture state, tab layout, codebase simplification |
| `packages/opencode/src/kilocode/kudbee/` | Safe-Zone Engine package (schema, gateway, mint, telemetry, events, tools, index) |
| `services/lib/redis.js` | Adaptive circuit breaker for Upstash Redis rate-limit backoff |
| `services/agents/worker.ts` | Governance worker with exponential backoff on Redis rate limits |
| `scripts/cloud-agent.mjs` | Inter-agent P2P calls, voicemail fallback, emergency interrupts |
| `scripts/session-bootstrap.mjs` | Agent startup voicemail replay and heartbeat |
| `scripts/think-compact.mjs` | Zero-waste token compaction and DPO preference annotation |
| `scripts/bus-debouncer.mjs` | Serial bus event deduplication (5s window) |
| `scripts/bus-to-cache.mjs` | Interrupt-driven cache flush bridge |
| `.kilo/memory/voicemails/` | Voicemail storage per agent |
| `.kilo/memory/local-calls/` | Emergency interrupt records |
| `.kilo/memory/decisions/` | DPO preference pair annotations |

## 20-Commit Hardening Sprint (feat/production-hardening-and-crypto-fix)

| Commit | Scope | Summary |
|:---|:---|:---|
| 1 | fix(mint) | Replace Node crypto with isomorphic `globalThis.crypto.randomUUID` + fallback sha256 |
| 2 | fix(redis) | Adaptive circuit breaker in `getRedisClient` for Upstash `MAX_REQUESTS_LIMIT` backoff |
| 3 | fix(monitor) | Exponential backoff in worker BRPOP loop on Redis rate-limit errors |
| 4 | feat(schema) | Strict Zod schema for `SafeZoneTelemetryMetadata` in opencode |
| 5 | feat(gateway) | Strict-typed `RequestOptions` wrapper in `ControlTowerGateway` |
| 6 | feat(minter) | Trajectory persistence via Upstash HTTP in `mintToken` |
| 7 | feat(telemetry) | Upstash Redis pub/sub dispatcher in `publishTelemetryUpstash` |
| 8 | feat(events) | `KudbeeEvents.trajectory` and `KudbeeEvents.governance_lock` via `BusEvent.define` |
| 9 | feat(tools) | `Tool.define` pattern for native tool registry handlers |
| 10 | refactor(opencode) | Export `createSafeZoneEngine` factory + singleton-safe `SafeZoneEngine` |
| 11 | fix(web) | `useToolInterceptor` evaluates safe-zone trajectory before tool execution |
| 12 | fix(cli) | CLI bootstraps `SafeZoneEngine` before orchestrator dispatch |
| 13 | test(opencode) | 20 passing unit tests covering schema, gateway, mint, events, tools, engine, telemetry |
| 14 | docs(kudbee) | AGENTS.md + AGENTS.kilo.md updated with safe-zone lifecycle and hardening contracts |
| 15 | ci(workflows) | `alpha-tango-kilo/gha-artifact-name@v1.2.0` verified in verify.yml |
| 16 | fix(groq) | `process.loadEnvFile('.env')` + dual `GROQ_API_KEY`/`GROQ_API` lookup |
| 17 | security(auth) | `STREAM_SECRET` HMAC fallback enforced in SSE ticket-granting endpoints |
| 18 | test(e2e) | Check 28 DLQ polling timeout bumped to 30000ms |
| 19 | refactor(web) | Vite `manualChunks` split: vendor-react, vendor-router, vendor-motion, vendor-zustand, vendor-crypto |
| 20 | chore(docs) | Final status logs, lockfile sync, workspace hygiene verified |

### Verification Status

- `bun run typecheck` — passes in `packages/opencode`
- `bun test` — 20/20 passes in `packages/opencode`
- `npm run build` (apps/web) — passes, main chunk 382 kB (below 500 kB warning threshold)
- `node scripts/verify-e2e.mjs` — 43/43 checks (38 core + 5 inter-agent phone tree)
