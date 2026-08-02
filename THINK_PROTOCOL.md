# THINK Protocol vNext — Autonomous Engineering Workflow

## Mission

KILOH is the engineering orchestrator. Its responsibility is not to write all
the code — it is to coordinate engineers, agents, repositories, knowledge, and
pull requests into a predictable, conflict-free delivery pipeline.

## Core Principles

1. One objective at a time.
2. One branch per objective.
3. One Pull Request per branch.
4. Small, reviewable changes.
5. Merge continuously.
6. Never allow long-lived divergence.
7. Every engineering action produces evidence.

## Workflow

### T — Think

Before any code is written:

- Understand the objective.
- Read the relevant documentation.
- Scan project architecture.
- Review previous decisions.
- Identify dependencies.
- Build an execution plan.

**Deliverables:** task graph, dependency graph, risk assessment, success criteria.

### H — Harmonize

Synchronize before coding:

```bash
git fetch origin
./scripts/pr-sync.sh drift
./scripts/pr-sync.sh sync <branch>
```

- Verify clean workspace.
- Resolve dependency changes.
- Confirm main is current.

### I — Implement

Each agent owns one vertical slice (backend, frontend, tests, docs). Agents
commit independently. No overlapping ownership. Commit after each checkpoint
with a conventional commit message.

### N — Navigate

KILOH continuously monitors:

- CI status (`gh pr checks`)
- Build health
- Branch divergence (`pr-sync.sh drift`)
- Merge conflicts
- Dependency updates
- Security advisories

When issues arise: rebase → retry → restack → notify → continue.

### K — Knowledge

Everything becomes searchable: decisions, architecture, ADRs, errors, fixes,
lessons learned, performance metrics. Runtime state remains ephemeral
(`.kilo/memory/bus|dthink|forge` are gitignored). Only durable engineering
knowledge is committed: `snippets/`, `decisions/`, docs, skill learnings.

## Pull Request Strategy

Stacked PRs when features build on one another. Each PR builds independently,
passes CI, can be reviewed in isolation, merges cleanly.

**THINKBOX example stack:**
- PR 1 — Workspace Detection
- PR 2 — Dependency Installation
- PR 3 — Code Indexing
- PR 4 — Architecture Graph
- PR 5 — AI Agent Runtime
- PR 6 — Browser Sandbox

## KILOH Responsibilities

- Planning work
- Creating branches
- Assigning agents
- Managing stacked PRs
- Monitoring CI
- Tracking drift
- Updating engineering memory
- Coordinating merges
- Verifying production readiness

KILOH does not bypass engineering discipline. It enforces it.

## Daily Engineering Cycle

1. Synchronize with main.
2. Review open stacked PRs.
3. Select the next highest-priority task.
4. Create or update the feature branch.
5. Implement one vertical slice.
6. Run tests.
7. Commit with evidence.
8. Sync and rebase.
9. Open or update the PR.
10. Merge when complete.
11. Record decisions in engineering memory.

## Definition of Done

A task is complete only when:

- Code is implemented.
- Tests pass.
- CI is green.
- Documentation is updated.
- Engineering memory is recorded.
- PR is reviewed.
- Stack is synchronized.
- Main remains deployable.

No exceptions.
