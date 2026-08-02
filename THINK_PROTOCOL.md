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

## Extension — Continuous Engineering Learning

**Principle:** Every engineering session must improve the Engineering Operating
System. Completing a task is not enough. The platform must learn from every
implementation, decision, failure, and success.

### Agent Memory Layer

Every core agent maintains its own durable knowledge profile:

- Responsibilities
- Operating procedures
- Preferred workflows
- Lessons learned
- Common failures
- Successful patterns
- Performance metrics
- Architectural decisions
- Recent improvements

Agent memory is versioned and updated after meaningful work.

### Daily Learning Cycle

At the end of every engineering session, KILOH initiates a Learning Cycle. Each
agent reports:

- What was accomplished
- What failed
- What slowed execution
- What was learned
- What should change next time
- Recommended protocol improvements

KILOH consolidates these reports into engineering knowledge.

### Knowledge Classification

New knowledge is categorized as: Architecture, Implementation Pattern, Bug
Fix, Performance Optimization, Workflow Improvement, Testing Strategy,
Deployment, Security, Dependency Management, Operational Runbook.

Knowledge is searchable, versioned, and traceable to its source.

### Engineering Efficiency Review

Every session evaluates resource efficiency: Redis connections, DB pool,
cache hit rates, worker utilization, API volume, build/test duration, memory,
CPU. Objective: continuous optimization, not just successful execution.

### Infrastructure Awareness

KILOH continuously tracks: database health, Redis health, queue depth, worker
availability, API rate limits, external service quotas, storage, deployment
status, cost. Infrastructure constraints are first-class engineering inputs.

### Agent Improvement

Agents evolve based on evidence: update procedures, refine workflows, record
recurring mistakes, capture successful patterns, improve planning, reduce
unnecessary tool usage. Changes are evidence-based and reviewable.

### Daily Engineering Review

Every day concludes with: repository health, system health, infrastructure
health, knowledge captured, lessons learned, protocol updates, agent memory
updates, recommended improvements, and the highest-priority objective for
tomorrow. The system begins the next day more capable than it ended the
previous one.

### Operating System Principle

The Engineering Operating System is self-improving. Every completed task
leaves behind: better documentation, better engineering memory, better agent
behavior, better workflows, better architecture, better operational awareness.
Progress is measured not only by features delivered, but by the increasing
capability of the operating system itself.

### Memory Separation (Architectural Rule)

**Separate operational memory from learned knowledge.**

- **Operational memory (ephemeral):** active tasks, queues, Redis state,
  worker leases, in-flight events. Lives in Redis or runtime infrastructure;
  can disappear without harming the platform.
- **Engineering knowledge (durable):** architectural decisions, coding
  patterns, protocol changes, postmortems, successful workflows, agent
  playbooks. Lives in the long-term knowledge store; versioned.

Redis is optimized for speed and coordination; durable memory is the
institutional knowledge of the Engineering OS. Do not conflate the two layers.

## Enforcement — Executable Policy

The protocol below is not aspirational. It is enforced by the Protocol Guardian
(`scripts/protocol-guard.mjs`) and the deterministic PR workflow
(`scripts/pr-sync.sh`).

### Rule 1: Main is Protected

`main` is a release branch, not a development branch. No feature work is ever
committed directly to main. The only acceptable commits on main are squash
merges, merge-queue commits, and explicitly approved emergency hotfixes.
Everything else belongs on a feature branch.

### Rule 2: Branch Guard

Before the first commit of a session, KILOH checks the current branch. If it is
`main`, KILOH stops and automatically creates a feature branch (or asks which
feature branch to use). Coding never begins on main.

### Rule 3: Pre-Commit Verification

Before every commit, KILOH verifies: current branch, whether the branch may
receive feature work, associated objective, and associated PR. If the branch is
`main`, the commit is aborted.

### Rule 4: Objective Lock

Every feature branch declares: Objective ID, PR number (when opened), parent
branch, and stack position. Without these, KILOH refuses to continue.

### Rule 5: Session Initialization

Every session begins with `pr-sync.sh drift`, `git status`, `git branch`. KILOH
asks "What is today's objective?" and only then creates/switches to the working
branch.

### Rule 6: Session Termination

Before ending the session: clean working tree, commit completed work, sync
branch, update engineering memory, generate session report, record next
recommended task. Nothing remains ambiguous.

### Rule 7: Automatic Recovery

If feature commits are detected on main, KILOH automatically:
1. Creates a feature branch from current HEAD.
2. Moves the commits there.
3. Resets main to its protected state.
4. Verifies history.
5. Opens/updates the corresponding PR.

The engineer does not need to remember this procedure.

### Protocol Guardian

A lightweight role that enforces the rules: verify workflow, protect main,
monitor branch state, enforce THINK Protocol, refuse unsafe operations, and
explain why an operation was blocked. It never writes business logic. It
protects engineering discipline.
