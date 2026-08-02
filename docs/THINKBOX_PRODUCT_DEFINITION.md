# THINKBOX Product Definition

**Version:** 2.0 | **PR:** THINKBOX-013 | **Date:** 2026-08-02

## Purpose

This document defines the responsibilities of every major system in the Engineering OS platform. It exists to prevent scope creep, eliminate duplicated concepts, and give every engineer a clear mental model of where things live.

---

## System Boundaries

### Control Tower
**What it is:** The operational overview. Global fleet operations center.

**What it answers:**
- What work is active across all workspaces?
- What systems are healthy?
- What deployments exist (prod, staging, dev)?
- What are today's risks?
- What are today's costs?
- Which THINKBOX workspaces are active?
- What is the agent fleet status?
- What learning trends exist globally?

**What it is NOT:**
- It is NOT where engineering work happens
- It is NOT where mission planning occurs
- It is NOT where project intelligence is generated

---

### THINKBOX
**What it is:** The per-project engineering workspace. This is where engineers spend their day.

**What it does:**
- Detect and analyze projects (PR-001, PR-002)
- Plan missions from objectives (PR-003, PR-007)
- Plan and supervise execution (PR-005)
- Display architecture (PR-006)
- Stream live events (PR-004)
- Extract and apply learning (PR-009)
- Replay sessions (PR-010)
- Monitor daily operations (PR-011)
- Track engineering excellence (PR-012)

**What it is NOT:**
- It is NOT a global dashboard
- It is NOT a cost management tool
- It is NOT a deployment orchestrator
- It is NOT a CI pipeline

---

### Interactive Terminal
**What it is:** The engineering heartbeat. Every subsystem publishes events here.

**What it displays:**
- Agent events (assignments, completions, errors)
- CI events (pass, fail, build)
- BUS events (all thinkbox:* types)
- Protocol events (mission transitions)
- Execution events (command queued, running, completed)
- Replay events (frame transitions)
- Diagnostics (health, latency)
- Warnings (recovery, retry)
- Learning events (record extracted, validated)

**What it is NOT:**
- It is NOT a separate application
- It is NOT a chat interface
- It is NOT the legacy Ollama/Lightning terminal
- It IS the primary communication surface for engineers

---

### Engineering Graph
**What it is:** The canonical model. Single source of truth.

**What it owns:**
- Workspace nodes
- Mission nodes
- File nodes
- Service nodes
- Agent nodes
- Decision nodes
- Learning nodes
- Deployment nodes
- Risk nodes

**Every subsystem writes to it. Every dashboard queries it.**

---

### Agent Swarm
**What it is:** The live engineering team.

**Agents:**
- KILOH — Mission orchestration, strategic planning
- FORGE — Implementation, building, architecture
- DTHINK — Knowledge synthesis, learning, patterns
- GATE — Quality, governance, verification
- JOURNAL — Memory, documentation, recording
- BUS — Event streaming, communication, routing

**Each agent publishes:**
- Status (active/idle/error)
- Current task
- Progress
- Health
- Last event timestamp

---

### Learning Engine
**What it is:** Continuous improvement from evidence.

**What it produces:**
- Learning records (per mission)
- Agent profiles (success rates, confidence trends)
- Recommendations (pre-mission, evidence-cited)
- Validations (confirmed/refuted learning)

---

### Governance Engine
**What it is:** The rules that keep engineering safe.

**What it enforces:**
- Mission locks (one active mission per branch)
- Branch policies (stacked PRs, clean merges)
- Guardian checks (pre-mission verification)
- Protocol guard (compliance verification)
- Approval gates (auto/user/admin)

---

## Data Flow

```
User → THINKBOX Dashboard (React SPA)
         │
         ├─ REST API (/api/thinkbox/*) → Backend Engines
         │
         ├─ SSE (/api/events) → Real-time BUS events
         │
         └─ WorkspaceViewModel ← All panels consume this contract

Backend Engines → Engineering Graph (canonical model)
                 → Learning Engine (extracts from missions)
                 → Event BUS (publishes all state changes)

Event BUS → SSE → THINKBOX Dashboard
          → Agent Swarm (live state)
          → Terminal (engineering heartbeat)
          → Timeline (replayable history)
```

---

## Anti-Patterns (Forbidden)

1. **Scattered API calls** — No component may call its own API independently. All data flows through WorkspaceViewModel.
2. **Hardcoded mock data** — No component may contain synthetic fallback data. Empty/loading states are the correct behavior when data is absent.
3. **Duplicate terminals** — Only the THINKBOX Interactive Terminal. No legacy terminal concepts.
4. **Polling** — No `setInterval(refresh, 5000)`. All live updates come through BUS/SSE.
5. **Isolated subsystems** — Every subsystem publishes events. Nothing operates in isolation.
