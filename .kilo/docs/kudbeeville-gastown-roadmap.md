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

### Release-Blocking Safety Gates (Added 2026-07-31)

Gastown and deployment work must not be promoted until these gates have
evidence-backed tests:

| Gate | Required evidence | Status |
|:---|:---|:---|
| Safe-Zone dispatch | Strict trajectory evaluation before orchestration | Implemented in CLI; tests pending |
| Shell-safe DTHINK | No user text interpolated into shell commands | Implemented for Gastown feeds |
| THINK recall contract | Consume `{ ok, results }` and test empty/degraded paths | Fixed; tests pending |
| Token promotion | Gastown outcomes start `PENDING_APPROVAL` | Implemented |
| Convoy lifecycle | Invalid transitions rejected; all tasks complete before merge | Implemented in-process; persistence pending |
| Public staging health | Canonical Heroku URL returns HTTP 200 | Environment-dependent |
| Browser runtime | Playwright/Box DOM, console, and screenshot evidence | Pending Box credentials |
| Dependency security | Critical/high production vulnerabilities triaged | Open: 1 critical, 14 high |

### Phase 2: Agent Fleet Hardening (~3 days)
**Goal: All 11 agents deployable, monitored, and self-healing**

| # | Task | Impact | Effort |
|:--|:---|:---|:---|
| 2.1 | Auto-deploy all agents on merge to main (deploy.yml enhancement) | Zero manual deploys | 2h |
| 2.2 | Agent health dashboard in /status.html (live SSE from kudbee:events) | Real-time agent visibility | 3h |
| 2.3 | Convoy system integration — durable state, leases, event log, and recovery | Production task orchestration | 2d |
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

## Current State (verified 2026-07-31)

| Component | Status |
|:---|:---|
| Heroku | Staging dynos previously up; canonical assigned URL required |
| PostgreSQL | Configured in prior staging release; fresh CLI probe required after reset |
| Redis | Local diagnostic has no REDIS_URL; staging uses Upstash configuration |
| Synapse C4769 | Code present; runtime status requires staging probe |
| Agents | 11 registered; no active local tasks at bootstrap |
| CI Typecheck | PASS (12/12) |
| THINK loop | Starts after auth import fix; Redis-dependent checks remain environment-gated |
| Browser | Verifier corrected; Playwright/Box evidence pending |
| Security | 1 critical and 14 high production dependency findings |
| PRs | #219–#228 reviewed; no open PRs reported |

## Next Action: Release gates before feature expansion

Use a non-GitHub runner/Box to validate the canonical staging URL, then add
Gastown unit/integration tests for shell safety, Safe-Zone enforcement, THINK
recall, token promotion, convoy transitions, and authorization. Only after
those gates pass should the Engineering Knowledge API or additional UI work
be promoted.
