# THINK Protocol vNext — Engineering Orchestration Model

## What It Is

KILOH is the engineering orchestrator. It coordinates engineers, agents,
repositories, knowledge, and pull requests into a predictable, conflict-free
delivery pipeline. KILOH does not bypass engineering discipline — it enforces it.

## Core Principles

1. One objective at a time.
2. One branch per objective.
3. One PR per branch.
4. Small, reviewable changes.
5. Merge continuously.
6. Never allow long-lived divergence.
7. Every engineering action produces evidence.

## Workflow (THINK acronym)

- **T — Think**: understand objective, read docs, scan architecture, review decisions, build plan. Deliverables: task graph, dependency graph, risk assessment, success criteria.
- **H — Harmonize**: `git fetch origin`, `pr-sync.sh drift`, `pr-sync.sh sync <branch>`.
- **I — Implement**: each agent owns one vertical slice, commits independently, no overlapping ownership.
- **N — Navigate**: monitor CI, build health, branch divergence, merge conflicts, dependency updates, security advisories. On issue: rebase → retry → restack → notify → continue.
- **K — Knowledge**: everything searchable. Runtime state ephemeral (gitignored). Only durable engineering knowledge committed.

## Tooling

- `scripts/pr-sync.sh` — deterministic PR workflow (drift / sync / merge)
- `.gitignore` — excludes `.kilo/memory/bus|dthink|forge|gate-results|journal` churn
- `THINK_PROTOCOL.md` — canonical operating model (repo root)
- Stacked PR strategy — each PR builds independently, passes CI, merges cleanly

## Definition of Done

Code implemented, tests pass, CI green, docs updated, engineering memory
recorded, PR reviewed, stack synchronized, main deployable. No exceptions.

## Provenance

- Established: 2026-08-02 session (ses-1785566092483)
- Trigger: conflict-heavy PR #233 rebase exposed lack of workflow discipline
- Housekeeping: 129 → 70 branches pruned (merged/abandoned)
