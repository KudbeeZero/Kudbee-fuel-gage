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
║  [1] Verify all CI gates                ║
║  [2] Run typecheck                      ║
║  [3] Run tests (services/lib)           ║
║  [4] Build web app                      ║
║  [5] Run E2E verification (38 checks)   ║
║  [6] Inspect middleware pipeline        ║
║  [7] Inspect route latencies            ║
║  [8] Audit production fixes            ║
║  [9] Review OUTING_PLAN.md             ║
║  [0] Full health check (all above)     ║
╚══════════════════════════════════════════╝
```

Wait for user to select a number, then execute the corresponding action.

## Menu Actions

### [1] Verify all CI gates
Run `/verify` — typecheck + tests + build + e2e.

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

### [0] Full health check
Run all 9 checks above sequentially and produce a summary report.

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
- `npm run build` — Vite production build
- `node scripts/verify-e2e.mjs` — 38 checks

### Key Config Files
- `kilo.json` — Project-level Kilo configuration
- `.mcp.json` — MCP server definitions
- `turbo.json` — Turborepo task pipeline
- `tsconfig.json` — Root TypeScript config
- `Procfile` — Heroku process definitions

### Middleware Pipeline (7 layers, all fail-open)
1. Spheroid Audit — Redis stream logging for mutating requests
2. Rate Limiter — In-memory sliding window + atomic Redis EVAL
3. 15s Timeout — Heroku H27 guard
4. Bearer Auth — HMAC + Ed25519 agent pass
5. KiloBridge Budget — Per-tenant token caps
6. ECP Singleflight — GET request dedup
7. Zod Validation — Schema validation factory
8. Global Error Handler — Structured JSON + trace IDs + breadcrumbs

### Observability
- Tab: OBSERVABILITY (primary nav, `apps/web/src/pages/observability.tsx`)
- Polls `/api/system/route-latencies` every 5s
- Shows 7 middleware guard statuses + per-route latency percentiles
- Hook: `useMiddlewareStatus` in `apps/web/src/hooks/useMiddlewareStatus.ts`
