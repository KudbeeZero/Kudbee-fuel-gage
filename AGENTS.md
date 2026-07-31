# Kudbee AGENTS.md

## ⚠️ CRITICAL: Run this FIRST — before reading any other files

```bash
node scripts/session-bootstrap.mjs
```

**This is mandatory.** It loads:
- 8 integration pipelines (checkpoint, auto-registration, BUS→CACHE, Think Forge, skill import, voicemail, EDISBOX deploy, review-app config)
- 3 terminal agents with decision history and recall logs
- 8 knowledge snippets with semantic recall tracking
- 9 serial bus events (replayable audit trail)
- Phone tree with 3 inter-agent calls logged
- Current CI status: **GREEN** (46/46 tests, 290kB build, 38/38 e2e)
- Memory journal with session history

**Without this, you are blind.** The bootstrap output becomes your working context.
If the command fails, the TERMINAL.md reference document and `.kilo/skill/kudbee/SKILL.md` contain fallback instructions.

## Plugin Arsenal (14 slash commands + 4 skills + 2 subagents)

After bootstrap, ALL of these are available. The agent MUST load them into its working context:

### Slash Commands (`.kilo/command/*.md`)
Used via `/name` in the terminal. Full list: `ls .kilo/command/`

| Command | What it loads |
|:---|:---|
| `/load` | Master bootstrap — 8-phase enterprise sequence (session, fleet, context, plugins, routing, escalation, spin-up, report) |
| `/status` | 7-phase diagnostic — memory layers, tools, gaps, Think Forge, other agents |
| `/think` | DTHINK console — problem audit, challenge audit, state verification |
| `/sync` | Terminal→UI bridge — pushes state to web app via agent-bridge |
| `/report` | Standardized standby report — all agents use identical format |
| `/handoff` | Human-in-the-loop — escalation, audit trail, operator routing |
| `/broadcast` | Multi-agent bus broadcast — publish to all cloud agents |
| `/patch` | Live UI update — terminal work reflected in web app in <8s |
| `/memory` | Interactive recall — phone tree, voicemails, decisions, HITL check |
| `/continue` | Session resume — 7-step: bootstrap, voicemails, fleet, forge, mirror, verify |
| `/stream` | Stream Lab — Cache↔BUS↔Frontend↔DTHINK flow |
| `/verify` | CI gates — typecheck + tests + build + e2e + knowledge extraction |
| `/pr` | PR lifecycle — status, review, create, verify+PR, merge |
| `/help` | Interactive terminal launch — phone tree, fleet, knowledge, bus, DTHINK + full reference |

### Skills (`.kilo/skill/*/SKILL.md`)
Loaded automatically by Kilo. Available in the skill menu:

| Skill | Source | What it provides |
|:---|:---|:---|
| `kudbee` | Project skill | Interactive 10-action Control Tower menu with full architecture docs |
| `ci-watcher` | Terminal agent | CI verification — typecheck, tests, build, e2e |
| `knowledge-curator` | Terminal agent | Memory curation — snippet health, knowledge graph |
| `pipeline-guardian` | Terminal agent | Middleware pipeline — 11 layer scan, guard status |

### Subagents (`.kilo/agent/*.md`)
Loaded by Kilo's agent system. Available via Task tool:

| Agent | File | Purpose |
|:---|:---|:---|
| `AGENTS.kilo` | `.kilo/agent/AGENTS.kilo.md` | Canonical global agent guide — architecture, contracts, patterns |
| `middleware` | `.kilo/agent/middleware.md` | Middleware specialist — 7-layer pipeline, fail-open semantics |
| `session_checkpoint` | `.kilo/agent/session_checkpoint.md` | Session persistence — checkpoint + recovery |

### Terminal Agents (`.kilo/agents/*.agent`)
Executable script agents with memories and decision logs:

| Agent | Schedule | Purpose |
|:---|:---|:---|
| `pipeline-guardian` | on-demand | Scans 11 middleware layers, detects failures |
| `ci-watcher` | on-deploy | Runs verification suite, checks CI gates |
| `knowledge-curator` | daily | Curates snippets, cross-references, prunes stale entries |

---

## Session-Level Instructions

> **Head file** — first file read on session start.
> **Last verified: 2026-07-30T11:04:25+00:00

### Integration Pipelines (7 implemented)

| # | Pipeline | File | Purpose |
|:--|:---|:---|:---|
| 1 | Session Checkpointing | `scripts/session-checkpoint.mjs` | Auto-commits `.kilo/memory/` to git on session end (object permanence) |
| 2 | Agent Auto-Registration | `scripts/session-bootstrap.mjs` | Glob-discovers `.kilo/agents/*.agent` with fault isolation (plug-and-play swarm) |
| 3 | BUS→CACHE Bridge | `scripts/bus-to-cache.mjs` | Event-driven cache invalidation — bus events invalidate L1/L2 cache (self-regulating nervous system) |
| 4 | Think Forge Live Feed | `scripts/think-forge-bridge.mjs` | Auto-streams snippet recalls into `think_tokens` pgvector (continuous context injection) |
| 5 | Skill Auto-Import | `scripts/skill-auto-import.mjs` | Terminal agents export learnings as `.kilo/skill/` entries (knowledge flywheel) |
| 6 | Voicemail & Interrupts | `scripts/cloud-agent.mjs` | 3s timeout, offline voicemail, CRITICAL priority interrupts with BUS→CACHE flush |
| 7 | EDISBOX Deploy Pipeline | `scripts/edisbox-pipeline.mjs` | Upstash Box integration — staging HTTP verification, release evidence, Redis audit, DTHINK feed |

### Heroku Pipeline Workflow (3 environments)

| Environment | App | Branch | Deploy Script | EDISBOX |
|:---|:---|:---|:---|:---|
| **Development** | `kudbee-fuel-gage-dev` | `session/agent_*` | `scripts/deploy-dev.sh` | ✓ verify |
| **Staging** | `kudbee-fuel-gage-staging` | `staging/security-durability` | `scripts/deploy-staging.sh` | ✓ verify |
| **Production** | `kudbee-fuel-gage` | `main` | `scripts/deploy-prod.sh` | ✓ verify |

**CI Bounds** (enforced in all environments):
- `CI_MUTATION_BUDGET=20` — max CI mutations per run
- `MAX_REQUEST_BODY=256kb` (CI) / `512kb` (staging/prod)
- `DB_POOL_MAX=5` (CI/dev) / `10` (staging/prod)
- `MONTHLY_DB_OPERATION_BUDGET=500000` (CI/dev) / `2000000` (staging) / `5000000` (prod)

### GitHub Actions Workflows (6 active)

| Workflow | Status | Trigger | Purpose |
|:---|:---|:---|:---|
| **CodeQL** | Active | Push/PR | Security analysis |
| **Deploy to Heroku Staging** | Active | Push to staging | Auto-deploy staging |
| **Session Logger** | Active | Session events | Archive session data |
| **Kudbee CI** | Active | Push/PR | Typecheck + lint + build + e2e |
| **Copilot cloud agent** | Active | Manual | Cloud agent orchestration |
| **CodeQL (legacy)** | Active | Push/PR | Security analysis (legacy config) |

**CI Bounds** (enforced in Kudbee CI workflow):
- `CI_MUTATION_BUDGET=20` — max CI mutations per run
- `MAX_REQUEST_BODY=256kb` (CI) / `512kb` (staging/prod)
- `DB_POOL_MAX=5` (CI/dev) / `10` (staging/prod)
- `MONTHLY_DB_OPERATION_BUDGET=500000` (CI/dev) / `2000000` (staging) / `5000000` (prod)
- `E2E_ALLOW_DATABASE_WRITES=0` — CI does not write to database

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

1. `npm run verify:typescript` — required TypeScript 7.0.2 direct-constraint and lockfile gate.
2. `npm run typecheck` — Turbo-routed TypeScript strict check across the monorepo.
3. `npm run lint` — Turbo-routed linting.
4. `node scripts/verify-e2e.mjs` — End-to-end verification suite (38 checks).

All agents must run `npm run verify:typescript` before handoff and may not
introduce TypeScript 5.x or lower anywhere in direct constraints or resolved
compiler entries. The side-by-side contract is intentional: `npx tsc` resolves
the `@typescript/native` alias and runs TypeScript 7, while
`require('typescript').version` resolves the `@typescript/typescript6` alias and
uses TypeScript 6 only for compiler-API consumers such as typescript-eslint.
The current typescript-eslint peer range `>=4.8.4 <6.1.0` is satisfied by that
API alias, so parser compatibility is a passing gate. The bounded follow-up is
to remove the TypeScript 6 API alias only after typescript-eslint publishes
TypeScript 7 API support.

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

## Key Commands

```bash
npm ci                              # install at repo root (never inside workspace packages)
npm run typecheck                   # Turbo-routed TS7 strict check
npm run verify:typescript            # TS7 native compiler + TS6 API alias gate
npm run lint                        # Turbo-routed linting
node scripts/verify-e2e.mjs         # 38-check E2E suite (needs REDIS_URL + DATABASE_URL)
npm run build                       # Turbo build (dependsOn typecheck + lint)
cd apps/web && npm run build        # Vite prod build for Control Tower
cd apps/mobile && npx tsc --noEmit  # Mobile type-check
```

`packages/opencode` uses **bun** (not npm):
```bash
cd packages/opencode && bun run typecheck && bun test
```

### Secret-Safe Workflow

- Secret values belong only in the hosting provider's secret manager or an ignored local `.env`.
- Run `npm run verify:secrets` for a name-only presence and tracked-file leak check.
- Run `npm run verify:box-web` when `UPSTASH_BOX_API_KEY` is configured; it uses the official Upstash Box API without printing the key.
- Redis MCP is for operational Redis commands, not secret discovery or secret storage.
- Never place credentials in GitHub comments, PR bodies, logs, DTHINK, THINK, screenshots, or agent prompts.

## Terminal Entrypoints

- **CLI orchestrator:** `npx tsx services/agent/cli.ts "your prompt"` — Kudbee Group 7 Multi-Agent Orchestrator.
- **Web terminal:** served at `/terminal.html` by the Vite dev server — "KUDBEE Terminal — Ollama Chat" SPA.
- **AgentTerminal:** collapsible in-studio dock (`apps/web/src/components/studio/AgentTerminal.tsx`) with `kudbee@studio:~$` prompt.

## Architecture (facts not obvious from filenames)

- **Canonical server entrypoint:** `services/ingestion/server.js` — **do not create** `server.ts` or duplicate entrypoints.
- **Monorepo workspaces:** `apps/*`, `services/*`, `packages/*`. All `npm install` must run at root.
- **package manager:** `npm@10.9.8`, **Node:** `>=22.0.0`.
- **Database:** Neon Postgres + pgvector. Migrations auto-run on boot. Embeddings always 1536-dim.
- **Redis:** `REDIS_URL` (Fast Brain: telemetry) and `REDIS_WORKER_URL` (Slow Brain: workers, falls back to `REDIS_URL`).

## Critical Gotchas

- **groqClient.ts import extension:** Must import `./budgetGate.ts` (`.ts` extension). The `.js` counterpart does not exist.
- **agent registry is loaded at boot:** Modify `config/agents.json` before spawning the server, not after.
- **.env loading in scripts:** Standalone `.mjs` scripts must call `try { process.loadEnvFile('.env'); } catch {}` at the top.
- **`think_tokens` ≠ `vector_memory`:** Minting a think token does NOT auto-sync — call `storeMemoryText()` explicitly.
- **NODE_ENV=test** relaxes rate limits but NOT auth. Authenticated endpoints still require `X-Agent-Pass`.
- **.env* is gitignored** with exceptions: `.env.example`, `config/template.env`, `config/.env.example`.

## Code Style

- **Prettier:** single quotes, trailing commas (es5), printWidth 100, LF line endings.
- **Imports:** `server.js` and lib files use `node:` prefix for Node builtins.
- **`// kilocode_change` markers:** Required when modifying `apps/web/src/hooks/useToolInterceptor.ts` or `services/agent/cli.ts`.

## Verifiers

| Script | Port | Purpose |
|:---|---:|:---|
| `scripts/verify-e2e.mjs` | 9876 | Full 38-check suite (must pass all) |
| `scripts/verify-think-loop.mjs` | 9878 | Think token mint + vector retrieval |
| `scripts/verify-governance-loop.mjs` | 9877 | Governance promotion + recycling |
| `scripts/verify-agents.mjs` | — | Agent identity + pass verification |

## New Session Checklist (every cloud agent MUST verify)

After running bootstrap, confirm ALL of these are loaded:

- [ ] Memory journal loaded (run `node scripts/session-bootstrap.mjs`)
- [ ] Agent fleet visible (`node scripts/agents.mjs status`)
- [ ] Knowledge store healthy (`node scripts/snippet-agent.mjs health`)
- [ ] Serial bus replayable (`node scripts/serial-bus.mjs history 5`)
- [ ] Phone tree active (`node scripts/phone-tree.mjs tree`)
- [ ] DTHINK pipeline recording (`node scripts/dthink-pipeline.mjs stats`)
- [ ] 14 slash commands available (`ls .kilo/command/`)
- [ ] 4 skills loaded (kudbee, ci-watcher, knowledge-curator, pipeline-guardian)
- [ ] 3 terminal agents online (pipeline-guardian, ci-watcher, knowledge-curator)
- [ ] Frontend synced (`node scripts/agent-bridge.mjs state`)
- [ ] CI GREEN (`node scripts/system-status.mjs check`)

If ANY checkbox fails, run `/load` for the full enterprise bootstrap sequence.
