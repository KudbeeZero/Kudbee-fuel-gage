# Kudbee Agentic Rack System — AGENTS.md

## Worker Polling Strategy

The governance task worker (`services/agents/worker.ts`) polls the task queue using a **TCP BRPOP** pattern against the Redis queue `kudbee-governance-tasks`. Each poll uses a **5-second blocking timeout** before the worker loops again. When a task is consumed it is processed serially in a single background loop.

## Retry & DLQ Policy

- **MAX_ATTEMPTS:** 3. A task that throws 3 consecutive times is atomically moved to the **Dead Letter Queue** `kudbee-governance-tasks-failed` (aliased as `TASK_DLQ` in code) for operator review.
- State transitions (`QUEUED` → `PROCESSING` → `SUCCESS` / `FAILED` / `DEAD_LETTERED` / `RETRY_QUEUED` / `DISCARDED`) are broadcast over the shared `kudbee:events` Redis pub/sub channel.

## CI Gates

The following commands must pass before a PR is accepted:

1. `npm run typecheck` — Turbo-routed TypeScript strict type-check across the monorepo.
2. `npm run lint` — Turbo-routed linting.
3. `node scripts/verify-e2e.mjs` — End-to-end verification suite (36 checks, including Check 28 for DLQ retry policy).
