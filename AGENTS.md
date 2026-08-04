# Kudbee AGENTS.md

## Startup Sequence

```bash
node scripts/handoff.mjs --stamp   # MANDATORY first — instant situational awareness
node scripts/session-bootstrap.mjs # deep context: agents, snippets, CI, decisions
```

The handoff stamps `.kilo/handoff.json`. Bootstrap loads 11 terminal agents,
9 knowledge snippets, CI status, and decision audit trails. Always run both
before starting any work.

## Architecture

- **Entrypoint:** `services/ingestion/server.js` (`.js`, not `.ts`). Do NOT create `server.ts`.
- **Monorepo:** `apps/*`, `services/*`, `packages/*`. All `npm install` at root only.
- **Package manager:** `npm@10.9.8`, **Node:** `>=22.0.0` (engines: `22.x`).
  `packages/opencode` uses **bun** for its own scripts.
- **Database:** Neon Postgres + pgvector. Migrations run on boot. Embeddings: 1536-dim.
- **Redis:** `REDIS_URL` (Fast Brain) / `REDIS_WORKER_URL` (Slow Brain, fallback to `REDIS_URL`).
  Monthly quota 500k — circuit breaker protects it.
- **Gemini:** model `gemini-flash-latest`. Provider factory: `packages/utils/src/llm/providers.ts`.
- **Roadmap:** `services/terminal/roadmap.mjs` — machine-readable phases + mission statement.

### TypeScript Dual Compiler (TS 5 + TS 7)

- `typescript@5.9.3` at root — TS 5 API for typescript-eslint and IDE support.
- `@typescript/native` (aliases `typescript@^7.0.2`) in EVERY workspace package —
  the native TS 7 `tsc` binary. Resolution enforced by `scripts/verify-typescript-version.mjs`
  and `scripts/verify-invariants.mjs`.
- `npx tsc` resolves `@typescript/native` (TS 7); `typescript` is the TS 5 API alias.
  Never downgrade either.

## Key Commands

```bash
npm ci                                # always at root; --legacy-peer-deps implied by .npmrc
npm run typecheck                     # Turbo-routed TS strict check
npm run verify:typescript             # same as typecheck (verifies lockfile contract in CI)
npm run lint                          # Turbo-routed linting
npm run build                         # Turbo build (dependsOn: typecheck + lint)
bun test                              # test runner (bun, not jest/mocha)
npm run format                        # Prettier — single quotes, es5 commas, 100 width, LF

# Targeted checks
cd apps/web && npm run build          # Vite prod build for Control Tower
cd apps/mobile && npx tsc --noEmit    # Mobile type-check

# System diagnostics
node scripts/system-status.mjs check  # CI + tests + build + E2E + pipelines
node scripts/agents.mjs status        # Agent fleet dashboard
node scripts/snippet-agent.mjs health # Knowledge store health
node scripts/repository-guardian.mjs  # Guardian gate — run before any implementation
```

## CI Gates (verify.yml)

PRs and main pushes trigger the `Kudbee Bounded CI` workflow (20 min timeout):

1. `npm ci --legacy-peer-deps --ignore-scripts`
2. Machine-verifiable invariants (`verify-invariants.mjs`)
3. TS 7 compliance (`verify:typescript`)
4. Crypto runtime + secret hygiene
5. Typecheck + Lint
6. `bun test` (unit tests)
7. Build
8. Bounded smoke (`continue-on-error: true`)

Three gates (`verify:agent-contracts`, `verify:integrations`, `verify:learning-protocol`)
are stubs with `|| true`. Test/typecheck/lint are the hard gates.

Also triggered: CodeQL (security analysis), Box Test (Upstash Box staging health),
Autonomous Maintenance (every 6h: self-heal gates + Gemini diagnosis).

## Deploy (Heroku)

```bash
git push https://git.heroku.com/kudbee-fuel-gage-staging.git main:main
git push https://git.heroku.com/kudbee-fuel-gage.git main:main
```

- **Release:** `node scripts/boot-verify.mjs` boots server on :9900, waits for `/health`.
  Timeout = deploy rolled back.
- **.npmrc required** (`legacy-peer-deps=true`) — Heroku `npm ci` fails without it.
- **Express 5:** catch-all must be `app.get('/{*path}')`, NOT `app.get('*')`.
- Staging: `kudbee-fuel-gage-staging` (web + hermes-worker).
- Production: `kudbee-fuel-gage` (web + hermes-worker + monitor-worker + sentinel).
- Procfile defines 4 process types: web, monitor-worker, hermes-worker, sentinel.

## Interactive Terminal

Primary control plane: `services/terminal/commandDispatcher.mjs` → `POST /api/terminal/execute` (no auth).
UI: `/terminal.html` (vanilla HTML/CSS/JS). Studio dock: `apps/web/src/components/studio/AgentTerminal.tsx`.

Key commands: `/ask`, `/code`, `/swarm`, `/shield`, `/roadmap`, `/security`, `/echo`,
`/forecast`, `/handoff`, `/status`, `/help`.

## Self-Healing

```bash
node scripts/self-heal.mjs check      # run gates
node scripts/self-heal.mjs diagnose   # + Gemini diagnosis on failure
node scripts/self-heal.mjs heal       # recall-first loop, mints THINK token
node scripts/failure-forecaster.mjs   # predict next failing gate
```

- **THINK token loop:** failures matched against `.kilo/memory/heal-patterns.json`
  before calling Gemini. Known patterns fixed from memory (zero LLM cost).
- **Circuit breaker:** `services/lib/circuitBreaker.ts` — CLOSED→OPEN→HALF_OPEN with
  local-state fallback for Redis quota exhaustion.
- **Echo Prompt Library:** `services/terminal/echoLibrary.mjs` — prompts auto-improve
  after 5+ interactions.

## PR Workflow

1. One objective per PR; <15 files, <250-500 lines.
2. Commit locally, verify typecheck + build BEFORE pushing.
3. PR body: Problem → Fix → Verified + rollback plan.
4. Wait for CI (all green).
5. Merge squash + delete branch. Pull main. Clean tree.
6. Deploy staging first, verify, then production. Record DTHINK events.

## Critical Gotchas

- **groqClient.ts import:** in `services/lib/ftwbMiddleware.ts`, must import
  `./groqClient.ts` with the `.ts` extension.
- **`.env` loading in scripts:** standalone `.mjs` scripts: `process.loadEnvFile('.env')`
  wrapped in try/catch.
- **think_tokens ≠ vector_memory:** minting a think token does NOT auto-sync —
  call `storeMemoryText()` explicitly.
- **express hoisting:** `services/telemetry/degradation-monitor.ts` imports express —
  express must be a ROOT dependency.
- **Dependency cascade:** multiple lockfile-touching PRs corrupt `package-lock.json`.
  Regenerate incrementally on green baseline; never `rm package-lock.json` blindly.
- **`.env*` gitignored** except `.env.example`, `config/template.env`, `config/.env.example`.

## Code Style

- **Prettier:** single quotes, trailing commas (es5), printWidth 100, LF.
  Config: `.prettierrc.json`.
- **Imports:** server.js and lib files use `node:` prefix for builtins.
- **`// kilocode_change` markers:** required in `apps/web/src/hooks/useToolInterceptor.ts`
  and `services/agent/cli.ts`.

## Repository Protection

- Never edit main directly: mission → branch → PR → CI → merge queue → main.
- No merge markers in tracked files — they fail the push.
- One terminal owner: `apps/web/terminal.html`. No duplicate production terminals.
- Dirty tree = blocked. Resolve before any work.
- Repair mode: restore last known-good version on a repair branch, replay changes,
  verify, merge. Never improvise on main.

## Kilo Config

- **kilo.json:** MCP for Upstash Redis via `@upstash/redis-mcp`.
- **.kilo/command/:** 18 slash commands (`/status`, `/help`, `/pr`, `/verify`, etc.)
- **.kilo/agent/:** 3 subagent definitions (AGENTS.kilo, middleware, session_checkpoint)
- **.kilo/skill/:** 5 skills (ci-watcher, knowledge-curator, kudbee, pipeline-guardian,
  terminal-diagnostic)

## PHASE-6 Production Verification (2026-08-04)

### Verified ✅

```
# Staging health
curl https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/health
→ {"status":"ok","dependencies":{"ingestion_db":"healthy","vector_memory":"healthy","redis":"healthy"}}

curl https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/api/system/health-deep
→ HEALTHY — Postgres 1ms, Redis 12ms, Agent ACTIVE_RUNNING, 0 pending triage

# Production health (identical to staging)
curl https://kudbee-fuel-gage-330ade653a62.herokuapp.com/health
→ {"status":"ok","dependencies":{"ingestion_db":"healthy","vector_memory":"healthy","redis":"healthy"}}

curl https://kudbee-fuel-gage-330ade653a62.herokuapp.com/api/system/health-deep
→ HEALTHY — Postgres 2ms, Redis 12ms, Agent ACTIVE_RUNNING, 0 pending triage

# Terminal API exercises
curl -X POST https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/api/terminal/execute \
  -H 'Content-Type: application/json' -d '{"command":"/status"}'
→ fleet:10, shield PROMOTE

# Surface validation
Production /         → 200 (boot splash → React SPA)
Production /terminal.html → 200 (xterm.js agent terminal)
Production /mobile/  → 200 (React Native web bundle)

# System status (local)
node scripts/system-status.mjs check
→ CI GREEN, Tests 46/46, Build 290kB, E2E 38/38, Pipelines 6/6, Agents 11, PRs 0
```

### Remaining (33%)

PHASE-6 scope: "Deploy to kudbee-fuel-gage prod, verify health, enable monitoring"

- **Deploy:** ✅ Done — production healthy, release a2ae80b
- **Verify health:** ✅ Done — all dependencies green, 11 agents active
- **Enable monitoring:** Requires Heroku CLI / dashboard access to verify:
  - `monitor-worker` dyno (`services/monitor/agent.js`) — defined in Procfile for production
  - `sentinel` dyno (`services/sentinel/src/index.ts`) — defined in Procfile for production
  - Confirm config vars: `GEMINI_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `REDIS_WORKER_URL`

### Next safe action

1. **Investigate `/status` reporting `online:0`** despite agent-status endpoint showing 11 active agents — likely a polling/metrics bridge gap
2. Verify monitor-worker + sentinel dynos are running in production (Heroku Dashboard → Resources)
3. Stamp PHASE-6 as shipped in `services/terminal/roadmap.mjs`
4. Close OPS-017 mission, open THINKBOX-016 (PHASE-7)

## Links

- Staging: https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com
- Production: https://kudbee-fuel-gage-330ade653a62.herokuapp.com
- Terminal: https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/terminal.html
- GitHub: https://github.com/KudbeeZero/Kudbee-fuel-gage
