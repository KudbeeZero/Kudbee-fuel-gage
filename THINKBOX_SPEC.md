# THINKBOX SPEC — The Portable Unit of Engineering

**Version:** 1.0 (canonical product definition)
**Date:** 2026-08-02 | **Source:** OPS-006 product directive | **Owner:** THINKBOX (Product Team)

---

## Core Distinction

- **Engineering OS** = the Operating System that *manages engineering* (missions,
  agents, memory, governance, deployments, infrastructure, cost, CI/CD, GitHub,
  Heroku, Redis, Postgres). It orchestrates. Think: Linux / Windows.
- **THINKBOX** = the *environment where work happens*. A self-contained,
  portable engineering workspace managed by the Engineering OS. Think:
  Docker container + Codespace + Dev Container + AI engineering assistant,
  integrated into the OS.

**The Engineering OS manages many THINKBOXes. THINKBOX is not the OS — it is
the workspace that runs on it.**

## The THINKBOX Lifecycle

```
Drop project (git URL / ZIP / directory)
  ↓
Mission received (Engineering OS)
  ↓
Create THINKBOX
  ↓
Clone / import repository
  ↓
Analyze project (type, language, framework)      ← PR-001 done
  ↓
Resolve dependencies                              ← PR-002 (next)
  ↓
Install tooling / provision runtime               ← PR-003
  ↓
Generate architecture graph                       ← PR-005
  ↓
Load engineering memory                           ← PR-006
  ↓
Assign agents (FORGE, DTHINK, BUS, testing…)      ← PR-007
  ↓
Ready — browser running, agents assigned, CI verified
```

## What Every THINKBOX Contains

| Component | Contents | Status |
|:---|:---|:---|
| **Workspace** | the actual code | PR-001 (import + detect) |
| **Runtime** | Node, Python, Docker — whatever is needed | PR-003 |
| **Memory** | project-specific knowledge, architecture, bugs, standards, ADRs | PR-006 |
| **Agents** | FORGE, DTHINK, BUS, testing, security, docs | PR-007 |
| **Tools** | Git, GitHub, Heroku, DB, Redis, terminal, browser, MCP, SDK — pre-connected | SDK/MCP layer |
| **Mission** | current objective, PR, branch, stack, owner | Governance engine (live) |
| **Observability** | logs, metrics, costs, CI, deployment | Operational layer (live) |

## The Portable Engineering Unit

A THINKBOX is **portable**: it contains the code, the environment, the mission,
the engineering memory, the active PR, the assigned agents, and the governance
context. If another engineer — or another AI — opens that THINKBOX next week or
next month, they inherit everything needed to continue the work. **Not just the
repository; the engineering context.**

## Multi-THINKBOX Model

```
Engineering OS
├── THINKBOX #1  Kudbee
├── THINKBOX #2  Client A
├── THINKBOX #3  Internal SDK
├── THINKBOX #4  Mobile App
└── THINKBOX #5  Documentation
```
Each THINKBOX is isolated: its own agents, memory, deployment, runtime, and
governance context.

## The Product Pitch

The Engineering OS is **not selling AI — it is selling time**:
- 2 hours configuring a project → dropped in
- 30 minutes reading docs → pre-indexed
- 45 minutes figuring dependencies → resolved
- 30 minutes wiring environments → pre-wired

Drop it. The Engineering OS creates the THINKBOX.

## Product Stack (canonical)

```
KUDBEE
├── Engineering OS        (the platform)
├── KILOH                 (Engineering Orchestrator)
├── THINK Governance Engine
├── GATE                  (verification)
├── JOURNAL               (durable knowledge)
├── BUS                   (events)
├── THINKBOX              (Engineering Workspace — the product)
├── SDK
├── MCP
└── AI Agents
```

## Team Separation (adopted)

| Team | Owns | Charter |
|:---|:---|:---|
| **Engineering OS (Platform Team)** | KILOH, Governance Engine, GATE, BUS, JOURNAL, infrastructure, CI/CD, deployment, cost guard, protocol, observability | Stable, highly governed, versioned |
| **THINKBOX (Product Team)** | workspace detection, dependency resolution, SDK, MCP, browser runtime, architecture graph, AI agents, code intelligence, engineering memory UX | Fast evolution on a stable OS |

## Implementation Mapping (to THINKBOX PRs)

| THINKBOX component | PR | Status |
|:---|:---|:---|
| Workspace detection | PR-001 | ✅ merged (#235) |
| Dependency resolution | PR-002 | planned (OPS-006 WS10) |
| Runtime provisioning | PR-003 | not started |
| Code indexing | PR-004 | not started |
| Architecture graph | PR-005 | not started |
| Engineering memory | PR-006 | not started |
| Agent assignment | PR-007 | not started |
| Execution / browser | PR-008 | not started |

## Provenance

- Established: 2026-08-02 (OPS-006 mission)
- Supersedes prior "THINKBOX as OS" framing — THINKBOX is the workspace, Engineering OS is the platform
- Canonical for THINKBOX PR-002+ design
