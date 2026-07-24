# Kudbee Agentic Rack System — AGENTS.md

> **Head file** — first file read on session start. See `.kilo/agent/AGENTS.kilo.md` for the canonical global agent guide (architecture, contracts, patterns, anti-patterns). This file holds session-level instructions only.

## Worker Polling Strategy

The governance task worker (`services/agents/worker.ts`) polls the task queue using a **TCP BRPOP** pattern against the Redis queue `kudbee-governance-tasks`. Each poll uses a **5-second blocking timeout** before the worker loops again. When a task is consumed it is processed serially in a single background loop.

## Retry & DLQ Policy

- **MAX_ATTEMPTS:** 3. A task that throws 3 consecutive times is atomically moved to the **Dead Letter Queue** `kudbee-governance-tasks-failed` (aliased as `TASK_DLQ` in code) for operator review.
- State transitions (`QUEUED` → `PROCESSING` → `SUCCESS` / `FAILED` / `DEAD_LETTERED` / `RETRY_QUEUED` / `DISCARDED`) are broadcast over the shared `kudbee:events` Redis pub/sub channel.

## CI Gates

1. `npm run typecheck` — Turbo-routed TypeScript strict check across the monorepo.
2. `npm run lint` — Turbo-routed linting.
3. `node scripts/verify-e2e.mjs` — End-to-end verification suite (36 checks, including Check 28 for DLQ retry policy).

## Key References

| File | What It Contains |
|:---|:---|
| `.kilo/agent/AGENTS.kilo.md` | Canonical global agent guide (all architecture, contracts, patterns) |
| `README.md` → **Documentation Scan** | Full `.md` inventory, work notes, project status |
| `OUTING_PLAN.md` | 20-phase enterprise hardening plan |
| `STATE_OF_THE_OS.md` | 25 documented production fixes |
| `.kilo/plans/PRODUCTION_AUDIT.md` | 263 audit findings |
| `BUILD.md` | Current architecture state, tab layout, codebase simplification |
