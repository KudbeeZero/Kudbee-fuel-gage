# KUDBEE Fuel Gauge Architecture Audit

## Executive Summary

KUDBEE Fuel Gauge is an Engineering OS rather than a single application. It
combines a portable THINKBOX workspace, a governance and verification plane,
distributed reasoning (DTHINK), durable engineering memory, agent orchestration,
telemetry, and a Redis/Postgres compute fabric. The repository is strongest as a
historical reference implementation and vocabulary for a local-first engineering
operating system. It should not be copied wholesale into the primary repository:
its concepts should be absorbed behind stable service contracts.

This audit is based on the repository’s specifications, implementation mapping,
service layout, migrations, configuration, and CI/deployment files. The Heroku
pipeline could not be live-verified because `HEROKU_API_KEY` is unavailable; that
does not affect the static architecture findings.

## Architecture Map

```text
Mission / user objective
          |
          v
 KILOH / orchestrator ---- Guardian / GATE ---- CI, policy, audit evidence
          |                         |
          v                         v
      THINKBOX ---------------> DTHINK decision stream
  import -> detect -> manifest       |
          |                          v
          +---- workspace memory / JOURNAL
          |                          |
          v                          v
   HERMES / agents ---- BUS/events ---- telemetry and outcome learning
          |
          v
   tool execution / jobs / workers
          |                 |
          v                 v
   Redis fast + slow brain  Neon Postgres + pgvector
          |
          v
  model provider abstraction (Gemini, Groq, vLLM, DeepSeek, Grok, local)
```

The repository also contains a frontend control surface, terminal execution
boundary, Sentinel security/health services, deployment definitions for Heroku
and Render, and GitHub Actions verification workflows.

## Core Systems Analysis

### Think Box

**Purpose:** THINKBOX is the portable unit of engineering work, explicitly
separated from the Engineering OS that manages it. It packages source,
runtime, mission, agents, memory, tools, governance context, and observability.

**Implementation:** `services/thinkbox` implements the first lifecycle slice:
import a git URL, ZIP, or directory; create a workspace registry entry;
deterministically detect languages/frameworks/package managers/build systems;
write `thinkbox.json`; and publish workspace events. Planning, indexing,
provisioning, and execution are staged extensions.

**Dependencies:** filesystem/temp workspace, signal configuration, event bus,
workspace registry, DTHINK feed, and eventually provider, memory, and agent
services.

**Strengths:** clear lifecycle, portable context boundary, deterministic
config-driven detection, and a useful distinction between platform and
workspace.

**Weaknesses:** the implemented slice is intake-only; dependency resolution,
runtime isolation, architecture graph, engineering memory, agent assignment,
and browser execution remain incomplete. Isolation is primarily conceptual
until runtime and tenant boundaries are enforced.

### DTHINK

**Purpose:** distributed reasoning and decision routing. It supplies a
decision layer between mission intake and execution, rather than treating every
request as a direct model call.

**Implementation:** `scripts/dthink-pipeline.mjs`, the Think Box DTHINK CLI and
planning modules, `.dthink/dthink.yaml`, decision streams, complexity/planning
artifacts, and model configuration. The design supports node identity,
resource budgets, peer sharding, local verification, and proof/audit output.

**Dependencies:** event streams, model providers, local inference/runtime
capacity, Redis coordination, telemetry, and governance evidence.

**Strengths:** explicit routing, complexity/resource awareness, local-first
fallbacks, model selection as configuration, and proof/replay aspirations.

**Weaknesses:** the P2P mesh and proof endpoint are configuration-level
capabilities rather than a uniformly enforced production path. Foreign compute,
staking, and remote execution expand the trust boundary. Decision semantics
are distributed across scripts and modules, which makes one canonical contract
difficult to identify.

### Guardian

**Purpose:** policy enforcement and safety gates. Guardian evaluates
machine-readable policies, blocks unsafe operations, and emits evidence; it
does not implement business logic.

**Implementation:** `scripts/protocol-guard.mjs`, repository guardian and
verification scripts, governance routes/ledger, Sentinel firewall and anomaly
components, middleware guards, output redaction, audit chain, and four named
gates: pre-coding, pre-commit, pre-push, and pre-PR.

**Dependencies:** mission/branch state, Git, CI checks, policy files, audit
storage, Redis/Postgres, and deployment credentials.

**Strengths:** explicit gates, evidence records, branch/tree invariants,
security middleware, redaction, rate limiting, circuit breakers, and
tamper-evident audit intent.

**Weaknesses:** enforcement is split among scripts, CI, middleware, and human
workflow. Some checks depend on external credentials and cannot be evaluated
offline. Conceptual GATE and executable verification are not a single service.

### Model Contract

**Purpose:** normalize model roles and provider choice so orchestration and
DTHINK do not depend directly on one vendor.

**Implementation:** provider registry/evaluator modules, shared LLM/provider
clients in `services/lib`, model environment configuration, budget gates,
token buckets, circuit breakers, failover clients, and AGC/model contract
artifacts.

**Dependencies:** provider credentials or local endpoints, rate/budget
controls, telemetry, and DTHINK routing.

**Strengths:** broad provider abstraction (Gemini, Groq, vLLM, DeepSeek, Grok,
and local backends), explicit default model, failover and quota protection,
and capability/resource configuration.

**Weaknesses:** role and capability definitions are spread across configuration
and clients; provider behavior is not fully interchangeable. Model lifecycle,
evaluation, provenance, and version pinning need a single durable contract.

### Memory

**Purpose:** preserve project knowledge, decisions, telemetry, agent learnings,
provenance, and reusable engineering context across missions.

**Implementation:** `.kilo/memory` journals, snippets, tokens, decisions,
relations and knowledge indexes; `services/memory` pipelines, vault, semantic
recall, receptor gating and vector store; Postgres `user_memories`,
`vector_memory`, telemetry vectors, reasoning ledger, and pgvector migrations;
Redis streams/caches for fast coordination.

**Dependencies:** Neon/pgvector, embeddings, Redis, agent identity, telemetry,
verification and retention/pruning policies.

**Strengths:** layered durable plus fast memory, semantic retrieval, explicit
think-token/provenance vocabulary, audit/decision records, retention indexes,
and a clear separation between minting a token and storing memory.

**Weaknesses:** several stores and naming systems can duplicate truth. Trust
and verification are partly policy conventions rather than one enforced
provenance graph. Vector dimensions/provider changes require migration
discipline.

### Agents

**Purpose:** turn governed missions and plans into specialized engineering
work. The architecture names KILOH, DTHINK, FORGE, BUS, GATE, JOURNAL, and
THINKBOX; executable terminal agents include HERMES, Sentinel, monitoring,
CI, governance, and knowledge roles.

**Implementation:** `services/agent`, `services/agents`, HERMES, orchestrator,
queues, agent registry/inventory/lifecycle/ledger, Gastown convoy/swarm
modules, tool routes, terminal dispatcher, and frontend agent panels.

**Dependencies:** mission locks, Guardian, Redis queues/events, model clients,
workspace context, memory, GitHub/terminal tools, and telemetry.

**Strengths:** explicit role vocabulary, lifecycle/TTL registration, audit
logging, queue-backed execution, replay and learning loops, and clear
separation between conceptual roles and terminal agents.

**Weaknesses:** the mapping is uneven: FORGE, GATE, and JOURNAL are mostly
roles, while eight of eleven terminal agents historically lacked category
metadata. Autonomous loops and tool permissions require stronger per-agent
capability isolation.

### Compute Fabric

**Purpose:** provide durable state, low-latency coordination, asynchronous
execution, model inference, monitoring, and deployment.

**Implementation:** Neon Postgres with pgvector; two Upstash Redis instances
(fast brain and slow brain); BRPOP/BLPOP workers, generic and governance
queues, dead-letter lists, monitor worker, QStash integrations, Heroku dynos,
Render blueprint, Docker/Compose, and GitHub Actions.

**Dependencies:** external cloud services, environment configuration, provider
APIs, deployment credentials, and network availability.

**Strengths:** sensible fast/durable split, bounded worker polling, retry and
circuit-breaker patterns, queue DLQ, telemetry, and multiple deployment
targets.

**Weaknesses:** queue claims lack leases/consumer groups and can reprocess
after crashes; Redis configuration has legacy aliases and duplicated database
variables; external-first operation complicates local reproducibility; live
deployment verification depends on credentials.

## KUDBEE Primary Repository Comparison

The primary Python/FastAPI repository should absorb contracts and concepts,
not duplicate Fuel Gauge’s entire Node/TypeScript surface.

| Capability | Already exists in Fuel Gauge? | Relationship / migration |
|---|---|---|
| Python/FastAPI architecture | No; Fuel Gauge is mainly Node/TypeScript | Keep FastAPI as primary API; expose translated contracts |
| MemoryService | Partially, through memory services, pgvector, Redis, and `.kilo/memory` | Absorb schemas/provenance ideas; replace scattered stores with one service |
| WorkspaceService | THINKBOX registry/import/detection | Absorb the lifecycle and `thinkbox.json` contract; adapt implementation |
| Think Box | Yes, substantially as a product definition and intake slice | Keep boundary; implement missing runtime/memory/agent stages in primary stack |
| Guardian | Yes, split across protocol guard, Sentinel, middleware, and CI | Absorb policy/evidence model; centralize enforcement in FastAPI middleware/service |
| DTHINK | Yes, as scripts/CLI/planning/configuration | Adapt routing and complexity decisions behind a stable decision API |
| Model Provider abstraction | Yes, but distributed | Replace with one provider registry and capability/role contract |
| Job/Worker system | Yes, Redis queues, workers, QStash, DLQ | Adapt queue semantics; add leases/idempotency/consumer groups |

**Migration path:** first define neutral schemas for mission, workspace,
decision, policy evaluation, memory record, model capability, and job. Next
implement adapters in the primary repository that can read Fuel Gauge records
without moving data. Then migrate read paths (workspace and memory), followed
by governed decision routing and workers. Finally retire duplicate clients and
scripts only after replay, provenance, and operational parity are demonstrated.

## Absorption Matrix

| Component | Classification | Rationale |
|---|---|---|
| THINKBOX lifecycle and manifest | KEEP | Strong portable workspace boundary |
| Deterministic workspace detection | KEEP | Low-risk, reusable intake capability |
| THINKBOX runtime/provisioning concepts | ADAPT | Implement behind primary runtime isolation |
| DTHINK vocabulary and decision stages | ADAPT | Preserve semantics, consolidate implementation |
| DTHINK P2P foreign compute/staking | ISOLATE | Experimental and high-trust-boundary |
| Guardian policy/evidence model | KEEP | Valuable governance primitive |
| Distributed Guardian scripts | REPLACE | Centralize policy evaluation and enforcement |
| Provider capability abstraction | ADAPT | Normalize roles, capabilities, cost, and lifecycle |
| `.kilo` journal/token conventions | ADAPT | Map into MemoryService with provenance |
| Postgres/pgvector data model | KEEP | Durable foundation, subject to schema ownership |
| Two-brain Redis split | ADAPT | Retain where useful; simplify configuration |
| BRPOP/BLPOP workers | REPLACE | Use leased, idempotent, observable jobs |
| HERMES/orchestrator role concepts | KEEP | Useful orchestration vocabulary |
| Gastown/swarm experimentation | ISOLATE | Preserve as experimental adapter |
| Terminal execution | ADAPT | Keep boundary, enforce tenant/agent capabilities |
| Heroku/Render deployment specifics | DROP | Replace with primary platform deployment strategy |
| Duplicate Node frontend/control surfaces | DROP or ISOLATE | Keep only if it remains an operational client |

## Historical Innovation

Fuel Gauge anticipated several now-common AI engineering patterns:

1. A workspace carries mission, memory, agents, tools, and governance—not just
   source code.
2. Model calls are routed by complexity, resource budget, capability, and
   provider health rather than by a single hard-coded model.
3. Memory includes provenance, verification, trust, decisions, and outcomes,
   not merely vector similarity.
4. Safety is a lifecycle of pre-action gates with machine-readable evidence,
   rather than a final review step.
5. Fast coordination and durable knowledge are deliberately separated.
6. Agent fleets have registration, TTL health, queues, audit trails, and
   learning profiles.

## Risks

* **Technical debt:** duplicated configuration, many overlapping scripts,
  conceptual roles without services, and incomplete THINKBOX stages.
* **Scalability:** Redis list queues without leases/consumer groups, possible
  duplicate work, bounded database pools, and broad telemetry/event fan-out.
* **Security:** terminal and tool execution, foreign compute, provider secrets,
  remote proof endpoints, and cross-tenant memory require explicit capability
  and tenancy boundaries.
* **Architecture conflict:** Fuel Gauge’s Node/Redis conventions may compete
  with the primary Python/FastAPI service ownership model. Absorbing
  implementations instead of contracts would create a second platform.
* **Operational dependency:** Heroku, Render, Neon, Upstash, GitHub, and model
  providers make parts of the system difficult to validate offline.

## Recommended Next Steps

1. **Define the absorption contracts:** mission, workspace, decision, policy
   evidence, memory/provenance, model capability, and job schemas.
2. **Make WorkspaceService the first migration:** absorb THINKBOX detection and
   manifest generation because it is deterministic and low risk.
3. **Centralize Guardian:** move policy evaluation and evidence into one
   primary service, retaining repository hooks as thin clients.
4. **Unify MemoryService:** select canonical durable tables and map `.kilo`
   records into explicit provenance and trust states.
5. **Create a provider registry:** model roles, capabilities, budgets,
   failover, health, and version provenance should have one owner.
6. **Harden jobs before scaling:** leases, idempotency keys, retry policy,
   consumer groups, and DLQ replay must be contractual.
7. **Isolate experimental DTHINK mesh and foreign compute:** require explicit
   feature flags, sandboxing, quotas, and audit evidence.
8. **Run replay-based parity tests:** compare Fuel Gauge decisions, memory
   retrieval, policy outcomes, and job behavior against primary implementations.
9. **Retire duplicates deliberately:** deprecate adapters only after measured
   parity and an operator-approved cutover.
