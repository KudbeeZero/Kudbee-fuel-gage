# Kudbee Agentic Rack System — AGENTS.md

> **Head file** — first file read on session start. See `.kilo/agent/AGENTS.kilo.md` for the canonical global agent guide (architecture, contracts, patterns, anti-patterns). This file holds session-level instructions only.

## Session Bootstrap — Terminal Agent System

On every session start, run the bootstrap to load full system context:

```bash
node scripts/session-bootstrap.mjs
```

This wakes up the terminal agent fleet, loads the memory journal, recalls top snippets, checks rate limits, and surfaces recent decisions. The output is injected into the agent's working context so it knows exactly where to start.

### Terminal Agent System Architecture

The system has **three layers** that work together:

| Layer | Location | Purpose |
|:---|:---|---|
| **Terminal Agents** | `.kilo/agents/*.agent` | Script-based automation agents with memories, schedules, and decision logs |
| **CLI Agents** | `.kilo/agent/*.md` | Kilo subagent personalities (LLM-driven, tool-using) — e.g. `middleware.md` |
| **Knowledge Store** | `.kilo/memory/snippets/` | Semantic knowledge snippets with recall tracking, relationships, and identity |

**Key distinction:** Terminal agents execute scripts and produce decisions. CLI agents interpret natural language and use Kilo tools (read, edit, bash, etc.). Both share the same knowledge store via the snippet-agent recall system.

### Management Commands

```bash
node scripts/agents.mjs status              # Agent fleet dashboard
node scripts/agents.mjs run <id> <task>     # Execute terminal agent
node scripts/agents.mjs recall <id> <query> # Agent-specific recall
node scripts/agents.mjs decode <id>         # Audit decisions
node scripts/snippet-agent.mjs recall <q>   # Cross-agent knowledge search
node scripts/snippet-agent.mjs graph <id>   # Knowledge graph walk
node scripts/snippet-agent.mjs health       # Knowledge store health
```

### Rate Limit Propagation

Terminal agents respect a global concurrency cap (default: 3 concurrent). The agent-bridge tracks running agents and queues overflow. Rate limits propagate from the Express middleware layers through to terminal agent execution.

```bash
node scripts/agent-bridge.mjs rate          # View current rate limit state
node scripts/agent-bridge.mjs acquire <id>  # Acquire execution slot
node scripts/agent-bridge.mjs release <id>  # Release slot
```

### UI Integration

The **OBSERVABILITY** tab (`/tower/observability`) shows live agent fleet status:
- Agent cards with status, schedule, actions, recalls
- Rate limit usage (concurrent/running)
- Wait queue depth
- Recent decisions feed
- Top recalled knowledge snippets

Backend endpoint: `GET /api/system/agent-status` (polls `agent-bridge.mjs` every 8s)

## Worker Polling Strategy

The governance task worker (`services/agents/worker.ts`) polls the task queue using a **TCP BRPOP** pattern against the Redis queue `kudbee-governance-tasks`. Each poll uses a **5-second blocking timeout** before the worker loops again. When a task is consumed it is processed serially in a single background loop.

## Retry & DLQ Policy

- **MAX_ATTEMPTS:** 3. A task that throws 3 consecutive times is atomically moved to the **Dead Letter Queue** `kudbee-governance-tasks-failed` (aliased as `TASK_DLQ` in code) for operator review.
- State transitions (`QUEUED` → `PROCESSING` → `SUCCESS` / `FAILED` / `DEAD_LETTERED` / `RETRY_QUEUED` / `DISCARDED`) are broadcast over the shared `kudbee:events` Redis pub/sub channel.

## CI Gates

1. `npm run typecheck` — Turbo-routed TypeScript strict check across the monorepo.
2. `npm run lint` — Turbo-routed linting.
3. `node scripts/verify-e2e.mjs` — End-to-end verification suite (36 checks, including Check 28 for DLQ retry policy).

## Safe-Zone Engine Lifecycle

- **Singleton pattern:** `SafeZoneEngine` is instantiated once per process (CLI, web hook) and reused for the session lifetime.
- **Bootstrap:** `engine.bootstrap(workspaceRoot)` wires the Control Tower gateway, registers native tools, and emits `TRAJECTORY_UPDATE` events.
- **Trajectory evaluation:** `engine.evaluateTrajectory({ target, vector, velocity })` computes threat scores, mints interception tokens when breached, and publishes telemetry via Upstash Redis pub/sub.
- **Circuit breaker:** Upstash Redis connections use an adaptive circuit breaker that opens on `MAX_REQUESTS_LIMIT` (500k) and backs off exponentially up to 30s.

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
- `node scripts/verify-e2e.mjs` — 36/36 checks passed
