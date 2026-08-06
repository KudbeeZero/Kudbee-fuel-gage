# Engineering OS — System Architecture

> **Living engineering map.** Every major subsystem: who owns it, what it
> consumes, what it produces, which invariants protect it, and what depends on
> it. When someone asks "What happens after a benchmark fails?" or "Who
> consumes decision reviews?", follow the arrows — not the code.
>
> This is a map, not a design doc. It changes as the system changes. Update it
> in the same PR that adds or removes a subsystem.

---

## Layer Model

```
┌──────────────────────────────────────────────┐
│ Product Layer        terminal · API · UI     │
└──────────────────────────────────────────────┘
            ▲
┌──────────────────────────────────────────────┐
│ Intelligence Layer  retrieval · forge ·     │
│                     benchmarks · learning    │
└──────────────────────────────────────────────┘
            ▲
┌──────────────────────────────────────────────┐
│ Governance Layer   planner · supervisor ·    │
│                     executor · lifecycle     │
└──────────────────────────────────────────────┘
            ▲
┌──────────────────────────────────────────────┐
│ Security Layer     keystone · auth ·         │
│                     firewall · redaction     │
└──────────────────────────────────────────────┘
            ▲
┌──────────────────────────────────────────────┐
│ Platform Layer     CI · deploy · Redis ·     │
│                     QStash · Heroku          │
└──────────────────────────────────────────────┘
```

Each layer has a single responsibility. Data flows upward through the layers;
security gates sit between them.

---

## Subsystem Map

Legend: **Inputs → Subsystem → Outputs** · Owner · Invariants · Depended-on-by

---

### Product Layer

#### Interactive Terminal
- **Owner:** Engineering OS (human operators + cloud agents)
- **Inputs:** slash commands (`/status`, `/roadmap`, `/ask`, …), terminal.html
- **Outputs:** command results, agent fleet state, roadmap, security status
- **Invariants:** INV-014 (execution requires auth when provisioned)
- **Path:** `apps/web/terminal.html` → `services/terminal/commandDispatcher.mjs` → `POST /api/terminal/execute`
- **Depended-on-by:** every layer — it is the control plane

#### Ingestion Server
- **Owner:** Engineering OS
- **Inputs:** HTTP requests, telemetry, terminal commands, QStash webhooks
- **Outputs:** API responses, SSE streams, system state
- **Invariants:** INV-003 (secret hygiene), INV-014 (terminal auth gate)
- **Path:** `services/ingestion/server.js` (`.js`, not `.ts`)

---

### Intelligence Layer

#### Evidence-Based Retriever
- **Owner:** Intelligence
- **Inputs:** THINK tokens, query, evidence weights
- **Outputs:** ranked context (semantic 0.40 / verification 0.15 / KD 0.10 / recency 0.10 / frequency 0.15 / approval 0.10)
- **Evidence:** RUN-003 (+8.3% precision, +25% recall)
- **Depended-on-by:** terminal `/ask`, bootstrap, mission planner

#### Benchmark Suite
- **Owner:** Intelligence
- **Inputs:** engineering scenarios, forge tokens
- **Outputs:** precision/recall/scorecards, champion vs challenger
- **Path:** `benchmarks/engineering-scenarios.json`, `scripts/champion-challenger.mjs`
- **Depended-on-by:** scorecards, intelligence index, model tournament (future)

#### Engineering Intelligence Score
- **Owner:** Intelligence
- **Inputs:** all evidence stores (decisions, reviews, graph, lifecycle, CI)
- **Outputs:** daily composite index (Outcome 50% / Knowledge 30% / Operational 20%)
- **Path:** `scripts/intelligence-index.mjs` → `.kilo/intelligence-index.json`

---

### Governance Layer

#### Mission Planner
- **Owner:** Governance
- **Inputs:** knowledge graph, decision ledger, outcomes, counterfactuals, lifecycle, CI, manifest
- **Outputs:** ranked mission queue → `.kilo/mission-queue.json`
- **Path:** `scripts/mission-planner.mjs` (uses `mission-score.mjs`)
- **Depended-on-by:** Mission Supervisor

#### Mission Supervisor
- **Owner:** Governance
- **Inputs:** mission queue, mission history, evidence stores
- **Outputs:** verdicts (APPROVED/BLOCKED/DEFERRED/…), mission health score → `.kilo/supervisor-history.json`
- **Path:** `scripts/mission-supervisor.mjs`
- **Depended-on-by:** Mission Executor (governs what may proceed)

#### Mission Executor
- **Owner:** Governance
- **Inputs:** approved mission contracts
- **Outputs:** lifecycle transitions (PROPOSED→…→COMPLETE), mission history → `.kilo/mission-history.json`
- **Path:** `scripts/mission-executor.mjs` + `mission-contract.mjs`
- **Depended-on-by:** supervisor audit (closeout verification)

#### Decision Ledger
- **Owner:** Governance
- **Inputs:** engineering decisions (problem, alternatives, chosen, evidence)
- **Outputs:** immutable decision records → `benchmarks/decisions/ledger.json`
- **Depended-on-by:** outcome engine, counterfactuals, graph, planner

#### Decision Outcome Engine
- **Owner:** Governance
- **Inputs:** decisions + actual results
- **Outputs:** reviews (SUCCESS/PARTIAL/FAILED/…) with confidence calibration → `.kilo/decision-outcomes.json`
- **Depended-on-by:** counterfactual replay, intelligence index

#### Counterfactual Engine
- **Owner:** Governance
- **Inputs:** decisions, reviews, alternatives
- **Outputs:** replay records (CONFIRMED/SUPERSEDED/OUTDATED/…) → `.kilo/counterfactuals.json`

#### Knowledge Lifecycle
- **Owner:** Governance
- **Inputs:** knowledge objects (tokens, benchmarks, decisions, skills)
- **Outputs:** lifecycle states (DRAFT→VERIFIED→ACTIVE→STALE→SUPERSEDED→ARCHIVED) → `.kilo/knowledge-index.json`

#### Knowledge Graph
- **Owner:** Governance
- **Inputs:** all stores (decisions, reviews, counterfactuals, lifecycle, tokens)
- **Outputs:** node/edge graph → `.kilo/knowledge-graph.json`
- **Depended-on-by:** planner, audit, intelligence index

---

### Security Layer

#### Keystone Trust Boundary (SEC-001)
- **Owner:** Human
- **Inputs:** governance file paths
- **Outputs:** write-refusal for agent edits of governance
- **Invariant:** **INV-013** — governance files never modified by an agent
- **Path:** `services/lib/governanceKeystone.ts`

#### Terminal Authorization (SEC-002)
- **Owner:** Human
- **Inputs:** `X-Agent-Pass` header, agent registry
- **Outputs:** 401/403/200 on `/api/terminal/execute`
- **Invariant:** **INV-014** — privileged execution requires auth when provisioned
- **Path:** `services/ingestion/server.js` → `bearerAuthMiddleware.ts`

#### Prompt-Injection Firewall (SEC-003 — next)
- **Owner:** Human
- **Inputs:** external content (issues, PRs, imports, benchmarks, voicemails)
- **Outputs:** PASS / REVIEW / BLOCK before any knowledge persistence
- **Invariant:** **INV-015** — no knowledge persisted without XPIA inspection
- **Path:** `scripts/xpia-screen.mjs` (wire at `vectorStore.storeMemoryText`)

#### Output Redaction (SEC-004 — planned)
- **Invariant:** **INV-016** — nothing leaves the system unsanitized

#### Tamper-Evident Audit (SEC-005 — planned)
- **Invariant:** **INV-017** — records hash-chained

#### Supply-Chain Guardian (SEC-006 — planned)
- **Invariant:** **INV-018** — dependencies measured (CVE, maintainer, freshness)

---

### Platform Layer

#### Repository Guardian
- **Owner:** Engineering OS
- **Inputs:** git state, governance keystone, terminal integrity
- **Outputs:** preflight gate (clean tree, no merge markers, INV-013/014)
- **Path:** `scripts/repository-guardian.mjs`
- **Depended-on-by:** every agent before implementation

#### CI (verify.yml)
- **Owner:** Engineering OS
- **Inputs:** PR + main pushes
- **Outputs:** typecheck, lint, test, build, crypto, secret hygiene, bounded smoke

#### Deploy (Heroku)
- **Owner:** Engineering OS
- **Inputs:** merged main
- **Outputs:** staging → production, boot-verify release gate

#### Redis / QStash / Neon
- **Owner:** Engineering OS
- **Inputs:** state reads/writes
- **Outputs:** pub/sub, telemetry, persistence (pgvector 1536-dim)

---

## Key Data Flows

### "What happens after a benchmark fails?"
```
Benchmark fail → Scorecard (token-scorecard) → Intelligence Index (INT-050)
  → Mission Planner candidate (evidence gap) → Supervisor (APPROVED?)
  → Executor (mission contract) → Verification → Outcome review → Graph
```

### "Who consumes decision reviews?"
```
Decision Ledger → Outcome Engine (reviews)
  → Counterfactual replay (CONFIRMED/…)
  → Knowledge Graph node
  → Intelligence Index (calibration KPI)
  → Mission Planner (evidence)
```

### "What happens to external content?"
```
GitHub issue / PR / import → [SEC-003 XPIA firewall]
  → PASS   → persist to knowledge (THINK token / snippet)
  → REVIEW → persist flagged, never auto-influences retrieval
  → BLOCK  → reject + audit event, never minted
```

### "Who consumes the knowledge graph?"
```
Mission Planner (ranks missions)
  → Supervisor (validates evidence)
  → Graph Audit (orphans, broken edges)
  → Intelligence Index (connectivity KPI)
  → Terminal /roadmap
```

---

## Invariant Registry

| ID | Name | Enforced by | Status |
|:---|:---|:---|:---|
| INV-003 | No secrets in tracked files | verify-secret-hygiene | ✅ |
| INV-013 | Governance files never agent-modified | repository-guardian | ✅ |
| INV-014 | Terminal execution requires auth when provisioned | server.js gate | ✅ |
| INV-015 | No knowledge without XPIA inspection | xpia-screen (SEC-003) | ⏳ Next |
| INV-016 | Outputs sanitized | redaction (SEC-004) | Planned |
| INV-017 | Audit chain tamper-evident | audit-chain (SEC-005) | Planned |
| INV-018 | Dependencies measured | supply-chain (SEC-006) | Planned |

---

## Subsystem Ownership

| Subsystem | Owner | Editable by agent? |
|:---|:---|:---|
| Governance files (AGENTS.md, contracts, state) | Human | **No** (INV-013) |
| Security layer (keystone, auth, firewall) | Human | **No** (INV-013) |
| Intelligence layer (retrieval, benchmarks, index) | Engineering OS | Yes |
| Governance layer (planner, supervisor, executor) | Engineering OS | Yes |
| Platform layer (CI, deploy, guardian) | Engineering OS | Yes |

---

## New Subsystem Gate (RULE)

Before any new subsystem exists, it must answer three questions:

1. **What existing problem does it solve?**
2. **What measurable KPI improves?**
3. **What existing complexity can be removed because this now exists?**

If it cannot answer all three, it is not ready. No parallel implementations,
no second engines, no duplicate truth.
