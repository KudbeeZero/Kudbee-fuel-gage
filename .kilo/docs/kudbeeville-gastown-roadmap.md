# Kudbeeville Gastown — Enterprise Roadmap
## Custom Multi-Agent Town Architecture

### Phase 1: CI Foundation (Immediate — ~2 days)
**Goal: Consistent green CI, zero TypeScript errors across all workspaces**

| # | Task | Impact | Effort |
|:--|:---|:---|:---|
| 1.1 | Add PostgreSQL service container to verify.yml | Unblocks 29/44 E2E checks | 1h |
| 1.2 | Activate CodeQL workflow | Security scanning on every PR | 30m |
| 1.3 | Fix services/agent workspace (add package.json) | Typecheck coverage for agent code | 30m |
| 1.4 | Remove dangling tsconfig references (skillz-library, telemetry) | Clean builds, no warnings | 15m |
| 1.5 | Add apps/mobile typecheck script | Parity with all other workspaces | 15m |
| 1.6 | Fix cross-workspace tsconfig references in services/ingestion | Eliminate fragile imports | 1h |
| 1.7 | Run verify-gates.mjs in CI as pre-check gate | Catch unused imports before PR | 30m |
| 1.8 | Add database compression policy (prune think_tokens >30d, KD<50) | Reduce DB from 29MB | 2h |

### Phase 2: Agent Fleet Hardening (~3 days)
**Goal: All 11 agents deployable, monitored, and self-healing**

| # | Task | Impact | Effort |
|:--|:---|:---|:---|
| 2.1 | Auto-deploy all agents on merge to main (deploy.yml enhancement) | Zero manual deploys | 2h |
| 2.2 | Agent health dashboard in /status.html (live SSE from kudbee:events) | Real-time agent visibility | 3h |
| 2.3 | Convoy system integration — agents bundle work units and report outcomes | Production task orchestration | 4h |
| 2.4 | Phone tree auto-routing — agents self-organize by task type | Zero human routing | 3h |
| 2.5 | THINK auto-minting — every agent action produces a token | Continuous learning | 2h |
| 2.6 | Agent budget gates — Groq/Deepseek cost tracking per agent | Cost awareness | 2h |

### Phase 3: Kudbeeville Town (~5 days)
**Goal: Custom multi-agent town — each agent has a "home" in the system**

| # | Task | Impact | Effort |
|:--|:---|:---|:---|
| 3.1 | Town registry — each agent gets a Rig (git worktree) with persistent state | Agent persistence | 4h |
| 3.2 | Mayor agent (Gastown Manager) — coordinates Rigs, dispatches Polecats | Central orchestration | 4h |
| 3.3 | Polecat agents — ephemeral workers spawned per task, auto-cleanup | Scalable task execution | 4h |
| 3.4 | Refinery — merge queue for Agent PRs, conflict resolution | Code quality gate | 4h |
| 3.5 | Dogs — town-level monitoring, alerting, auto-healing | Fault tolerance | 3h |
| 3.6 | Witness — watches Polecats, detects stuck tasks, escalates | Unblocking agent | 2h |
| 3.7 | Beads integration — git-backed agent memory storage | Immutable audit trail | 4h |
| 3.8 | Convoys 2.0 — multi-agent work units with dependency graphs | Complex orchestration | 4h |

### Phase 4: Wasteland Integration (~3 days)
**Goal: Connect Kudbeeville to external agent ecosystems**

| # | Task | Impact | Effort |
|:--|:---|:---|:---|
| 4.1 | Wanted Board — publish tasks to Gastownhall Wasteland | External task sourcing | 3h |
| 4.2 | Reputation scoring — KD/efficacy-based agent quality rating | Quality measurement | 3h |
| 4.3 | Cross-town agent discovery — find agents in other towns | Interoperability | 3h |
| 4.4 | Gas token economy — agent compute metered and billed | Cost allocation | 4h |

### Phase 5: Enterprise Operations (~2 days)
**Goal: Production-grade observability, security, and compliance**

| # | Task | Impact | Effort |
|:--|:---|:---|:---|
| 5.1 | Deploy daemon — scheduled maintenance, health checks, auto-recovery | 24/7 operations | 3h |
| 5.2 | Audit anchoring — every decision anchored to immutable log | Compliance | 3h |
| 5.3 | Synapse C4769 Phase 2 — behavioral fingerprint learning | Adaptive security | 4h |
| 5.4 | Budget enforcement — hard caps per agent per model, auto-shutdown | Cost control | 2h |
| 5.5 | Disaster recovery — automated checkpoint restore from pgvector | Resilience | 3h |

---

## Current State

| Component | Status |
|:---|:---|
| Heroku | v281f971, 4 dynos UP |
| PostgreSQL | 29 MB, 2088 think tokens |
| Redis | REST API (TCP eliminated) |
| Synapse C4769 | Active, 0 violations |
| Agents | 4/11 online (web, hermes, monitor, sentinel) |
| CI Typecheck | PASS (local) / E2E fails (no PG container) |
| Frontend | /status.html, /cli.html, /unified.html all 200 |
| PRs | #225 MERGED, #226 MERGED, #227 Ready for Review |

## Next Action: Phase 1.1 — Fix CI

Add PostgreSQL service container to `.github/workflows/verify.yml`. This single fix unblocks 29 of 44 E2E checks and gets Verify consistently green.
