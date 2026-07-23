# Kudbee Documentation

Master Table of Contents for the Kudbee Spatial-Fluidic AI Operating System monorepo.

---

## Architecture

| Document | Description |
|:---|:---|
| [01-HEADER_AND_TASKBAR](architecture/01-HEADER_AND_TASKBAR.md) | Header bar layout, Cmd+K palette, and system taskbar components |
| [02-DESKTOP_AND_PLUGINS](architecture/02-DESKTOP_AND_PLUGINS.md) | Desktop workspace, rack-mount plugin grid, and plugin lifecycle |
| [03-PIPELINES_AND_NETWORK](architecture/03-PIPELINES_AND_NETWORK.md) | Ingestion pipelines, SSE event bus, and network topology |
| [04-DATABASE_AND_REDIS](architecture/04-DATABASE_AND_REDIS.md) | Full DB schema (Postgres + pgvector), Redis key map, connection pooling, circuit breaker config |
| [05-GOVERNANCE_AND_GATING](architecture/05-GOVERNANCE_AND_GATING.md) | Receptor gating engine, AGC contracts, think token lifecycle, probation docket, HERMES auditor, Nash unions |
| [06-FRONTEND_ARCHITECTURE](architecture/06-FRONTEND_ARCHITECTURE.md) | React component tree, Zustand stores, SSE hooks, apiClient, error boundaries, plugin registry |

## Development

| Document | Description |
|:---|:---|
| [BUILD](development/BUILD.md) | Build, typecheck, and verification guide with troubleshooting |
| [GETTING_STARTED](development/GETTING_STARTED.md) | Quick start from template.env, Node.js requirements, one-command verification |

## Reference

| Document | Description |
|:---|:---|
| [API_REFERENCE](reference/API_REFERENCE.md) | Every endpoint from runtime-allowlist.json and server.js, organized by prefix |
| [SCHEMA_REFERENCE](reference/SCHEMA_REFERENCE.md) | All Zod schemas from packages/types/index.ts with field descriptions |
| [TECHNOLOGY_STACK](reference/TECHNOLOGY_STACK.md) | Technology choices, justifications, and usage patterns |
