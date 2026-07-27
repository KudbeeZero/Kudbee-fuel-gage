# Kudbee Agentic Rack System — AGENTS.md

## ⚠️ CRITICAL: Run this FIRST — before reading any other files

```bash
node scripts/session-bootstrap.mjs
```

**This is mandatory.** It loads:
- 6 integration pipelines (checkpoint, auto-registration, BUS→CACHE, Think Forge, skill import, voicemail)
- 3 terminal agents with decision history and recall logs
- 8 knowledge snippets with semantic recall tracking
- 9 serial bus events (replayable audit trail)
- Phone tree with 3 inter-agent calls logged
- Current CI status: **GREEN** (46/46 tests, 290kB build, 38/38 e2e)
- Memory journal with session history

**Without this, you are blind.** The bootstrap output becomes your working context.
If the command fails, the TERMINAL.md reference document and `.kilo/skill/kudbee/SKILL.md` contain fallback instructions.

---

## Session-Level Instructions

> **Head file** — first file read on session start.
> **Last verified:** 2026-07-27T18:59:28Z | CI: GREEN | Tests: 46/46 | Build: 290kB | E2E: 38/38 | Pipelines: 6/6 | Agents: 3 | PRs: 2

### Integration Pipelines (6 implemented)

| # | Pipeline | File | Purpose |
|:--|:---|:---|:---|
| 1 | Session Checkpointing | `scripts/session-checkpoint.mjs` | Auto-commits `.kilo/memory/` to git on session end (object permanence) |
| 2 | Agent Auto-Registration | `scripts/session-bootstrap.mjs` | Glob-discovers `.kilo/agents/*.agent` with fault isolation (plug-and-play swarm) |
| 3 | BUS→CACHE Bridge | `scripts/bus-to-cache.mjs` | Event-driven cache invalidation — bus events invalidate L1/L2 cache (self-regulating nervous system) |
| 4 | Think Forge Live Feed | `scripts/think-forge-bridge.mjs` | Auto-streams snippet recalls into `think_tokens` pgvector (continuous context injection) |
| 5 | Skill Auto-Import | `scripts/skill-auto-import.mjs` | Terminal agents export learnings as `.kilo/skill/` entries (knowledge flywheel) |
| 6 | Voicemail & Interrupts | `scripts/cloud-agent.mjs` | 3s timeout, offline voicemail, CRITICAL priority interrupts with BUS→CACHE flush |

### Rate Limit Propagation

Terminal agents respect a global concurrency cap (default: 3 concurrent). The agent-bridge tracks running agents and queues overflow. Rate limits propagate from the Express middleware layers through to terminal agent execution.

```bash
node scripts/agent-bridge.mjs rate          # Current rate limit state
node scripts/agent-bridge.mjs acquire <id>  # Acquire execution slot
node scripts/agent-bridge.mjs release <id>  # Release slot
```

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

### Worker Polling Strategy

The governance task worker (`services/agents/worker.ts`) polls the task queue using a **TCP BRPOP** pattern against the Redis queue `kudbee-governance-tasks`. Each poll uses a **5-second blocking timeout** before the worker loops again.

### Retry & DLQ Policy

- **MAX_ATTEMPTS:** 3. Task that throws 3 consecutive times moves to **DLQ** `kudbee-governance-tasks-failed`.
- State transitions broadcast over `kudbee:events` Redis pub/sub channel.

### CI Gates

1. `npm run typecheck` — Turbo-routed TypeScript strict check across the monorepo.
2. `npm run lint` — Turbo-routed linting.
3. `node scripts/verify-e2e.mjs` — End-to-end verification suite (38 checks).

### Safe-Zone Engine Lifecycle

- **Singleton pattern:** `SafeZoneEngine` instantiated once per process.
- **Bootstrap:** `engine.bootstrap(workspaceRoot)` wires Control Tower gateway.
- **Trajectory evaluation:** `engine.evaluateTrajectory()` computes threat scores.
- **Circuit breaker:** Upstash Redis adaptive breaker opens at `MAX_REQUESTS_LIMIT` (500k).

### Key References

| File | What It Contains |
|:---|:---|
| `TERMINAL.md` | Full terminal agent system documentation (living document) |
| `.kilo/agent/AGENTS.kilo.md` | Canonical global agent guide (all architecture, contracts, patterns) |
| `.kilo/skill/kudbee/SKILL.md` | Interactive project skill with 10-action menu |
| `BUILD.md` | Build architecture, tab layout, verification |
| `README.md` | Documentation scan, work notes, project status |
| `OUTING_PLAN.md` | 20-phase enterprise hardening plan |
| `STATE_OF_THE_OS.md` | 25 documented production fixes |
| `packages/opencode/src/kilocode/kudbee/` | Safe-Zone Engine package |
| `services/lib/redis.js` | Adaptive circuit breaker for Upstash Redis |
| `services/agents/worker.ts` | Governance worker with exponential backoff |

### Verification Status

- `bun run typecheck` — passes in `packages/opencode`
- `bun test` — 46/46 passes (services/lib)
- `npm run build` (apps/web) — passes, main chunk 290 kB
- `node scripts/verify-e2e.mjs` — 38/38 checks passed
