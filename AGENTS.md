# Kudbee AGENTS.md

## ⚠️ CRITICAL: Run this FIRST — before reading any other files

```bash
node scripts/handoff.mjs --stamp
```

**This is the mandatory HANDOFF BRIEFING.** It tells you instantly — no matter
what branch you're on or what you were doing:
- **WHO you are** (agent id, current role)
- **WHERE you are** (git branch, HEAD SHA, dirty file count)
- **WHAT the mission is** (current phase, progress %, mission statement)
- **WHAT to do next** (first action recommendation)
- **WHAT happened recently** (last 5 DTHINK events)
- **WHERE the system lives** (staging/prod/terminal/github links)

The manifest is stamped to `.kilo/handoff.json` (machine-readable). If any
field is missing or wrong, the mission lock or roadmap is out of sync —
resolve that BEFORE starting work. State your role + first action to the
human, then move.

Then load deep context:

```bash
node scripts/session-bootstrap.mjs
```

This loads: integration pipelines, terminal agents with decision history,
knowledge snippets, serial bus events, phone tree, current CI status, and
the memory journal.

## Interactive Terminal — the control plane

The interactive terminal (`services/terminal/commandDispatcher.mjs`) is the
primary interface for operating the system. Commands are executed server-side
via `POST /api/terminal/execute` (no auth required — open access):

```
/ask <q>      Gemini answer (plain text auto-routes here)
/code <req>   Gemini writes production-grade code (Kudbee conventions)
/swarm        Agent fleet tree (10 agents)
/shield       P·L·R·I shield metrics
/roadmap      Phases to production (11 committed)
/security     Security posture report
/echo         Echo Prompt Library — self-improving prompts
/forecast     Failure Forecaster — predicts next failure
/handoff      Instant situational awareness (same as handoff.mjs)
/status       System + fleet summary
/help         Full command reference
```

The terminal UI is served at `/terminal.html` (vanilla HTML/CSS/JS, no React).
AgentTerminal dock: `apps/web/src/components/studio/AgentTerminal.tsx`.

## Deploy flow (Heroku)

```bash
# Deploy staging or production — git push triggers build + BootVerify
git push https://git.heroku.com/kudbee-fuel-gage-staging.git main:main
git push https://git.heroku.com/kudbee-fuel-gage.git main:main
```

- **Procfile release command:** `node scripts/boot-verify.mjs` — boots the
  server on port 9900 and waits for `/health` before releasing. If it times
  out, the release FAILS and the previous release stays active.
- **Express 5 gotcha:** the SPA catch-all route must be `app.get('/{*path}')`.
  `app.get('*')` throws `PathError: Missing parameter name` on boot.
- **`.npmrc` is required** (`legacy-peer-deps=true`) — Heroku's plain `npm ci`
  fails without it (react 19 / react-native peer conflict).
- Staging apps: `kudbee-fuel-gage-staging` (web + hermes-worker).
- Production: `kudbee-fuel-gage` (web + hermes-worker + monitor-worker + sentinel).

## Security posture (Engineering OS v2.2)

- **Password-based access control is DISENGAGED** — no bearerAuth, no synapse
  gate, no X-Agent-Pass required, no login. Single-user directive.
- Invisible defense-in-depth remains ACTIVE: security headers (CSP, HSTS,
  nosniff, X-Frame-Options DENY), strict CORS allowlist (staging + prod
  origins, no wildcard), global rate limit 100 req/min/IP (health/SSE/static
  exempt), 10mb body limit.
- `/security` in the terminal reports the live posture.

## Self-healing & self-improvement

```bash
node scripts/self-heal.mjs check      # run gates (typecheck/crypto/secrets)
node scripts/self-heal.mjs diagnose   # + Gemini diagnosis on failure
node scripts/self-heal.mjs heal       # recall-first loop, mints THINK token
node scripts/failure-forecaster.mjs   # predict next failing gate
node scripts/agent-bootstrap.mjs loop # tap in anywhere, learn, contribute
```

- **THINK token loop:** failures are signature-matched against
  `.kilo/memory/heal-patterns.json` BEFORE calling Gemini. Known patterns are
  fixed from memory (zero LLM cost); new patterns are Gemini-diagnosed then
  minted. Every fix feeds DTHINK + a snippet card.
- **Echo Prompt Library** (`services/terminal/echoLibrary.mjs`): every Gemini
  interaction is scored; prompts auto-improve after 5+ interactions.
- **Circuit breaker** (`services/lib/circuitBreaker.ts`): CLOSED→OPEN→HALF_OPEN
  with local-state fallback — survives Redis quota exhaustion. Use
  `breaker.execute(fn, fallback)` to protect any call site. Hermes heartbeats
  write to `.kilo/memory/local-state/` when Redis is unavailable.
- **Scheduled self-heal:** `.github/workflows/autonomous-maintenance.yml` runs
  every 6 hours (gates + Gemini diagnosis on failure).

## Architecture (facts not obvious from filenames)

- **Canonical server entrypoint:** `services/ingestion/server.js` — do NOT
  create `server.ts` or duplicate entrypoints.
- **Monorepo workspaces:** `apps/*`, `services/*`, `packages/*`. All `npm install` must run at root.
- **package manager:** `npm@10.9.8`, **Node:** `>=22.0.0`. `packages/opencode` uses **bun**.
- **Database:** Neon Postgres + pgvector. Migrations auto-run on boot. Embeddings always 1536-dim.
- **Redis:** `REDIS_URL` (Fast Brain) / `REDIS_WORKER_URL` (Slow Brain, falls back to `REDIS_URL`). Monthly quota 500k — the circuit breaker protects it.
- **Gemini:** `GEMINI_API_KEY` (on Heroku staging) + model `gemini-flash-latest` (2.0/2.5 deprecated for new keys). Provider factory: `packages/utils/src/llm/providers.ts`.
- **Roadmap:** `services/terminal/roadmap.mjs` — machine-readable phases, mission statement, `/roadmap` command.

## CI Gates (must pass)

1. `npm run verify:typescript` — TS 7.0.2 direct-constraint + lockfile gate.
2. `npm run verify:agent-contracts` — all discovered agents have metadata.
3. `npm run verify:integrations` — command/package availability only.
4. `npm run verify:learning-protocol` — THINK/DTHINK loop + safety rules.
5. `npm run typecheck` — Turbo-routed TS strict check.
6. `npm run lint` — Turbo-routed linting.
7. `node scripts/verify-e2e.mjs --smoke` — bounded smoke (no provider URLs).
8. `E2E_ALLOW_DATABASE_WRITES=1 node scripts/verify-e2e.mjs` — full E2E only with opt-in.

All agents must run `npm run verify:typescript` before handoff. TypeScript
contract: `npx tsc` resolves `@typescript/native` (TS 7); the TS 6 API alias
is for typescript-eslint only. Never introduce TS 5.x or lower.

## Key Commands

```bash
npm ci                              # root only, never inside workspace packages
npm run typecheck                   # Turbo-routed TS7 strict check
npm run verify:typescript           # TS7 native compiler + TS6 API alias gate
npm run lint                        # Turbo-routed linting
npm run build                       # Turbo build (dependsOn typecheck + lint)
cd apps/web && npm run build        # Vite prod build for Control Tower
cd apps/mobile && npx tsc --noEmit  # Mobile type-check
node scripts/system-status.mjs check  # CI + tests + build + E2E + pipelines
node scripts/agents.mjs status     # Agent fleet dashboard
node scripts/snippet-agent.mjs health  # Knowledge store health
```

## Critical Gotchas

- **groqClient.ts import:** must import `./budgetGate.ts` (`.ts` extension).
- **.env loading in scripts:** standalone `.mjs` scripts should call
  `try { process.loadEnvFile('.env'); } catch {}` at the top.
- **`think_tokens` ≠ `vector_memory`:** minting a think token does NOT auto-sync — call `storeMemoryText()` explicitly.
- **.env* is gitignored** except `.env.example`, `config/template.env`, `config/.env.example`.
- **Dependency version cascade:** merging multiple lockfile-touching PRs in
  quick succession corrupts `package-lock.json`. Regenerate from a green
  baseline incrementally (install on top of the existing lockfile, never
  `rm package-lock.json` blindly). CI `paths` filters must include
  `package-lock.json` + `.npmrc`.
- **express hoisting:** `services/telemetry/degradation-monitor.ts` imports
  express — express must be a ROOT dependency or the server fails to boot.

## Code Style

- **Prettier:** single quotes, trailing commas (es5), printWidth 100, LF.
- **Imports:** server.js and lib files use `node:` prefix for builtins.
- **`// kilocode_change` markers:** required in `apps/web/src/hooks/useToolInterceptor.ts` and `services/agent/cli.ts`.

## PR Workflow (Standard Operating Procedure)

1. One objective per PR; prefer <15 files, <250-500 lines.
2. Commit locally, verify typecheck + build BEFORE pushing.
3. PR body: **Problem → Fix → Verified** + rollback plan.
4. Wait for CI (verify + CodeQL + box-test + docs-check all green).
5. Merge with squash + delete branch. Pull main. Clean tree.
6. Deploy staging first, verify, then production. Record DTHINK events.
7. `/ask` is rate-limited (10/min default; `/threshold set askRateLimit N`).
