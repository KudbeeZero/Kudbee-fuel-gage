# THINK Protocol — Continuous Engineering Learning

## Principle

Every engineering session must improve the Engineering Operating System.
Completing a task is not enough — the platform must learn from every
implementation, decision, failure, and success.

## Daily Learning Cycle

At session end, KILOH runs `node scripts/learning-cycle.mjs run`. Each core
agent reports: accomplished, failed, slowed execution, learned, change next
time, protocol improvements. Records written to `.kilo/memory/learnings/`.

## Knowledge Classification

10 categories: architecture, implementation-pattern, bug-fix,
performance-optimization, workflow-improvement, testing-strategy, deployment,
security, dependency-management, operational-runbook.

## Memory Separation (Architectural Rule)

- **Operational memory (ephemeral)** — tasks, queues, Redis state, worker
  leases, in-flight events. Redis/runtime. Gitignored. Can vanish safely.
- **Engineering knowledge (durable)** — decisions, patterns, postmortems,
  playbooks. `.kilo/memory/learnings|snippets|decisions`. Versioned, committed.

## Efficiency + Infrastructure Awareness

Every session evaluates: Redis connections, DB pool, cache hits, worker
utilization, API volume, build/test duration, memory, CPU. Infrastructure
health (DB, Redis, queues, rate limits, quotas) are first-class inputs.

## Self-Improving OS

Every task leaves behind better docs, memory, agent behavior, workflows,
architecture, awareness. Progress = features delivered + OS capability gained.

## Provenance

- Established: 2026-08-02 (session ses-1785566092483)
- Protocol: THINK_PROTOCOL.md "Extension — Continuous Engineering Learning"
- Tooling: scripts/learning-cycle.mjs
