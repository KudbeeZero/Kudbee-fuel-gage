# Engineering OS — Canonical Roadmap

> **ROADMAP-001.** This is the single authoritative roadmap for the Engineering OS.
> It replaces scattered phase docs. Every mission, planner, supervisor, and cloud
> agent follows this document. Nothing is implemented without a roadmap entry;
> nothing is a roadmap entry without evidence.
>
> **Rules:**
> - A roadmap item cannot exist without evidence.
> - A release cannot close without measurements.
> - Every mission must unlock later work.
> - No duplicate roadmap entries.
> - One canonical roadmap only.
>
> **Schema for every mission:** Mission ID · Problem · Evidence · Solution ·
> Files · LOC estimate · Risk · Rollback · Verification · KPIs · Dependencies ·
> Unlocks. Nothing more.

---

## Maturity Legend

Every release train reports two things: **capability** (how much is built) and
**maturity** (how trustworthy it is). Maturity is the operational truth — a
feature at 100% capability but 40% maturity is not done.

| Maturity | Meaning |
|:---|:---|
| **Vision** | Named, not started. No code. |
| **Planned** | Scoped with evidence, awaiting approval. |
| **In Progress** | Being built under mission contracts. |
| **Beta** | Operational, invariants enforced, guardian green. |
| **Stable** | Measured, audited, release-train exit passed. |

---

## Release Trains

### Train 1 — Foundation

| | |
|:---|:---|
| **Capability** | 100% |
| **Maturity** | **Stable** |
| **Vision** | A stable Engineering OS base: repository, CI, deployment, terminal, Thinkbox engines, knowledge stores. |
| **Exit criteria** | All foundation systems operational; CI green; guardian green; deployable. |

**Evidence:** PHASE-1..6 + PHASE-11 shipped (roadmap.mjs), CI 46/46 tests, 38/38 E2E, production + staging healthy, boot-verify passing.

**Contains (shipped):**
- Repository protection (guardian, merge-marker gate, secret hygiene INV-003)
- CI gates (typecheck, lint, test, build, crypto, bounded smoke)
- Heroku deployment (staging + production, boot-verify release gate)
- Interactive terminal (`/terminal.html`, command dispatcher)
- Thinkbox detection → deps → provisioning → indexing → graph (PR-001..005)

**KPIs:** CI pass rate 100%, build 290 kB, deploy success, zero regression.

---

### Train 2 — Intelligence

| | |
|:---|:---|
| **Capability** | 85% |
| **Maturity** | **Beta** |
| **Vision** | Make retrieval measurably better every month — evidence-driven, never architectural claims without measurement. |
| **Exit criteria** | Benchmark improvements proven on the canonical suite; every claim traced to a benchmark, decision, or review. |

**Evidence:** RUN-003 (precision +8.3%, recall +25%), 12-scenario benchmark suite, 4 decisions + 4 reviews + 4 counterfactuals, 82-node knowledge graph, mission planner deterministic.

**Contains:**
- Evidence-based retrieval (semantic 0.40 / verification 0.15 / KD 0.10 / recency 0.10 / frequency 0.15 / approval 0.10)
- Benchmark suite + scorecards + champion/challenger harness
- Decision Ledger + Outcome Engine (INT-028/039)
- Counterfactual Engine (INT-029)
- Knowledge Lifecycle (INT-040), Health Graph (INT-041)
- Mission Planner (INT-042), Engineering Intelligence Score (INT-050)

**KPIs:** precision, recall, knowledge freshness, decision calibration, context efficiency — all in `.kilo/intelligence-index.json`.

**Unlocks:** Train 5 (Product Intelligence) — the compiler and tournament are evaluated against this evidence.

---

### Train 3 — Security

| | |
|:---|:---|
| **Capability** | 35% |
| **Maturity** | **In Progress** |
| **Vision** | Protect governance · execution · knowledge · outputs · audit · supply chain. |
| **Exit criteria** | All invariants (INV-013..018) passing; guardian green; security dashboard green. |

**Evidence:** SEC-001 (keystone, INV-013) + SEC-002 (terminal auth, INV-014) shipped and merged to main.

**Mission order:**

| ID | Objective | Invariant | Status |
|:---|:---|:---|:---|
| SEC-001 | Keystone — agents cannot modify their own governance | INV-013 | ✅ Shipped |
| SEC-002 | Terminal authorization boundary | INV-014 | ✅ Shipped |
| SEC-003 | Prompt-injection firewall (XPIA) | INV-015 | Next |
| SEC-004 | Output redaction layer | INV-016 | Planned |
| SEC-005 | Tamper-evident audit chain | INV-017 | Planned |
| SEC-006 | Supply-chain guardian | INV-018 | Planned |

**KPIs:** 0 malicious fixtures unblocked, 0 engineering fixtures blocked, invariants all green, security dashboard score.

---

### Train 4 — Autonomous Operations

| | |
|:---|:---|
| **Capability** | 75% |
| **Maturity** | **Beta** |
| **Vision** | Cloud agents execute routine engineering work under governance with no rediscovery. |
| **Exit criteria** | Routine missions run Planner → Supervisor → Executor → Verify → Review → Replay without manual supervision. |

**Evidence:** EXEC-001 (9-state lifecycle) + EXEC-002 (supervisor) shipped; STAB-002 executed end-to-end (orphans 39→5); supervisor:audit PASS; mission history immutable.

**Contains:** Mission Planner, Supervisor, Executor, Mission Contracts, Lifecycle, Reviews, Replay, Outcome Engine, mission history + supervisor history.

**KPIs:** mission success rate, avg verification time, unsanctioned advances = 0.

---

### Train 5 — Product Intelligence

| | |
|:---|:---|
| **Capability** | 15% |
| **Maturity** | **Planned** |
| **Vision** | Everything learned improves the product: lower token cost, higher benchmark score, higher first-answer accuracy. |
| **Exit criteria** | Context compiler + model tournament prove gains on the canonical benchmark before production use. |

**Evidence:** Benchmark suite + intelligence index exist to evaluate it objectively (the reason GCC-001 is delayed — it must answer measurable questions first).

**Contains (planned):** Context Compiler (GCC-001), Model Tournament, Adaptive Routing, Engineering Intelligence Score (INT-050 exists), Context ROI, Prompt Optimization, Retrieval Optimization.

**KPIs:** token cost per task (−25% target), benchmark precision/recall, first-answer accuracy.

**Dependencies:** Train 3 (security) + Train 2 (evidence) — a compiler must preserve security boundaries and be judged by the benchmark.

---

### Train 6 — Enterprise

| | |
|:---|:---|
| **Capability** | 5% |
| **Maturity** | **Vision** |
| **Vision** | Multiple organizations, workspaces, fleets; enterprise governance, compliance, billing. |
| **Exit criteria** | Multi-tenant isolation, RBAC/SSO, audit exports, compliance reports. |

**Contains (planned):** Organizations, RBAC, SSO, Audit exports, Compliance, Billing, Enterprise API.

**KPIs:** tenant isolation score, SSO adoption, compliance coverage.

---

## Dependency Graph

```
Foundation ──→ Intelligence ──→ Product Intelligence
     │              │                  │
     └──→ Security ─┘                  │
     │                                  │
     └──→ Autonomous Operations ────────┘
                       │
                       └──→ Enterprise
```

- Security (Train 3) unlocks every downstream train — a compiler must preserve INV-013..018.
- Intelligence (Train 2) is the evidence base that Product Intelligence (Train 5) is judged against.
- Autonomous Operations (Train 4) depends on Foundation + Security.
- Enterprise (Train 6) builds on all prior trains.

---

## Current State (pointer)

| Field | Value |
|:---|:---|
| **Version** | 2.3 → 2.4.1 |
| **RC** | RC1 |
| **Phase** | stabilization-candidate → security-completion |
| **Active train** | Train 3 — Security (SEC-003 next) |
| **Freeze** | new-capabilities-frozen (until Trust & Security completes) |
| **Mission** | SEC-003 |

---

## Release Review Process

Every release train ends with:

1. **Acceptance review** — exit criteria measured, not asserted.
2. **Measured results** — KPIs before/after.
3. **Lessons learned** — recorded to knowledge.
4. **Knowledge added** — THINK tokens / snippets minted with provenance.
5. **Benchmarks updated** — the suite reflects the release.
6. **Decision ledger updated** — the release decision is recorded.
7. **Counterfactual recorded** — alternatives replayed.
8. **Mission outcome** — reviewed and closed.
9. **Supervisor approval** — governance gate passed.

A release **cannot close without measurements.**
