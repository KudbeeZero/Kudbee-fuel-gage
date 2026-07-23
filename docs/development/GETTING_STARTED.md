# Getting Started

Quick start guide for running Kudbee locally.

## Prerequisites

- **Node.js 22+** — ESM native support required
- **npm 10.9+** — package manager
- **Redis** — local instance or Upstash URL (for state layer and event bus)
- **Neon Postgres** (optional) — server degrades to in-memory fallback without it
- **Groq API key** (optional) — sets `GROQ_API_KEY` for LPU inference
- **Gemini API key** (optional) — sets `GEMINI_API_KEY` for telemetry triage

## Quick Start

```bash
cp config/template.env .env
```

Edit `.env` and fill in the required values:

| Variable | Required | Description |
|:---|:---|:---|
| `REDIS_URL` | Yes (for full features) | Redis connection string |
| `DATABASE_URL` | No (in-memory fallback) | Neon Postgres connection string |
| `GEMINI_API_KEY` | No | Gemini API key for telemetry triage |
| `GITHUB_TOKEN` | No | GitHub token for PR workflow |
| `APP_URL` | No | Deployed app URL |
| `REACT_APP_API_URL` | No | Backend API base URL (empty = same-origin) |
| `CORS_ALLOW_ORIGINS` | No | Allowed CORS origins (default `*`) |
| `PORT` | No | Server port (default 3000) |
| `NODE_ENV` | No | Environment: `development` / `test` / `production` |

### Minimal Local Setup

For local development without external services, Redis is the only hard requirement:

```bash
export REDIS_URL=redis://localhost:6379
export NODE_ENV=test
```

## Install and Run

```bash
npm install
```

```bash
npm run dev
```

This starts all workspaces via Turborepo:
- Ingestion server (Express on port 3000)
- Monitor agent (background worker)
- Worker process
- Vite dev server (React 19 Control Tower dashboard)

## Verify

```bash
npm run typecheck
```

```bash
node scripts/verify-e2e.mjs
```

The one-command verification:

```bash
npm ci && npm run typecheck && node scripts/verify-e2e.mjs && cd apps/web && npm run build
```

## Access

- Dashboard: `http://localhost:3000`
- Health check: `http://localhost:3000/health`
- API base: `http://localhost:3000/api/`

## Next Steps

- See [BUILD.md](BUILD.md) for full build guide and verification suite
- See [API_REFERENCE.md](../reference/API_REFERENCE.md) for all endpoints
- See [SCHEMA_REFERENCE.md](../reference/SCHEMA_REFERENCE.md) for type contracts
- See [TECHNOLOGY_STACK.md](../reference/TECHNOLOGY_STACK.md) for technology choices
