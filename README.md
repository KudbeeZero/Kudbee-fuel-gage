# Kudbee OS

Live AI Control Tower — spatial-fluidic operating system for multi-agent governance, real-time telemetry, and cryptographic audit trails.

Verification is self-hosted and runs through `node scripts/ci-self-hosted.mjs`.

## Architecture

Kudbee is a full-stack monorepo organized into three layers:

| Layer                          | Stack                                     | Purpose                                                                       |
| :----------------------------- | :---------------------------------------- | :---------------------------------------------------------------------------- |
| **Web** (`apps/web`)           | React 19, Vite 6, Tailwind v4, Zustand    | Control Tower dashboard with Studio Layout, Plugin Rack, and live SSE streams |
| **API** (`services/ingestion`) | Express, Neon Postgres, ioredis, Groq LPU | Telemetry ingestion, governance logic, circuit breakers, rate limiting        |
| **Worker** (`services/`)       | Node.js, Redis, Gemini, HERMES            | Background agent loops, governance task queue, autonomous auditor             |

### Redis Topology

Three isolated Redis instances for workload separation:

| Instance       | Env Var          | Purpose                                              |
| :------------- | :--------------- | :--------------------------------------------------- |
| **Fast Brain** | `REDIS_URL`      | UI telemetry, SSE pub/sub, real-time snapshot state  |
| **Slow Brain** | `REDIS_SLOW_URL` | HERMES, Crucible, JobQueue, governance heavy workers |

## Quick Start

```bash
npm ci
cp config/.env.example .env
npm run typecheck
node scripts/verify-e2e.mjs
cd apps/web && npm run lint && npm run build
```

## Documentation

See [`/docs/README.md`](docs/README.md) for the full architecture docs, API reference, schema reference, and technology stack.

## Status

- **Phases 1–4** (Core Infrastructure): COMPLETE
- **Phase 5** (Production Hardening): COMPLETE — memory leak fixes, error boundaries, eslint added, CI green
- **Phase 6** (Multi-Agent Containerization): PLANNED
- **Heroku Pipeline** (3 environments): ACTIVE — dev → staging → production with EDISBOX verification

### Heroku Pipeline Workflow

| Environment | App | Branch | Deploy Script | EDISBOX |
|:---|:---|:---|:---|:---|
| **Development** | `kudbee-fuel-gage-dev` | `session/agent_*` | `scripts/deploy-dev.sh` | ✓ verify |
| **Staging** | `kudbee-fuel-gage-staging` | `staging/security-durability` | `scripts/deploy-staging.sh` | ✓ verify |
| **Production** | `kudbee-fuel-gage` | `main` | `scripts/deploy-prod.sh` | ✓ verify |

**Current PR**: #233 — security durability, TypeScript 7, bounded CI, staging hardening (DRAFT)

**CI Bounds**: `CI_MUTATION_BUDGET=20`, `MAX_REQUEST_BODY=256kb` (CI) / `512kb` (staging/prod), `DB_POOL_MAX=5` (CI/dev) / `10` (staging/prod), `MONTHLY_DB_OPERATION_BUDGET=500000` (CI/dev) / `2000000` (staging) / `5000000` (prod)
