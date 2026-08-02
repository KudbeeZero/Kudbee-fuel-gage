# ENGINEERING ROADMAP V2 — OPS-002 Workstream J

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY (design output)
**Auditor:** KILOH

---

## Executive Summary

The repository has two competing visions: the **THINKBOX product** (workspace
detection → execution, 8 PRs) and the **Engineering OS** (THINK Protocol,
KILOH orchestration, governance). The Foundation Sprint (OPS-002) is the
correct interlude: harden the OS before building more product. This roadmap
reconciles both into a single build order.

## 1. Current State vs Vision

| Dimension | Current | Vision |
|:---|:---|:---|
| THINKBOX | PR-001 detection landed (100% of stage 1) | full pipeline to execution |
| Engineering OS | THINK Protocol + Guardian + learning + report | self-improving, enforced |
| Governance | no branch protection, no CODEOWNERS | fully protected main |
| CI/CD | green, bounded, but no unit tests in CI | complete gates |
| Deployment | manual push to prod, 200 releases | deterministic promote + rollback |
| Cost | ~$50-60/mo observed Heroku; external unverified | cost-modeled, capped |

## 2. Missing / Duplicate / Legacy

| Class | Item |
|:---|:---|
| Missing | branch protection, CODEOWNERS, dependabot.yml, mission-lock, unit tests in CI, protocol guard in CI |
| Duplicate | 2× CodeQL workflows, 2× Copilot workflows, DATABASE_URL_AGENT_v2, 3 Upstash tokens, 16 orphan CI apps |
| Legacy | 72 remote branches (no PRs), stale review app PR #233, `convoy/*`, `gt/*` branch families |

## 3. Recommended Build Order

### Phase 0 — Close OPS-002 (this sprint)
1. (Safe) Wire `bun test` + protocol guard into verify.yml
2. (Safe) Add mission-lock command; fix pre-commit hook activation
3. (Safe) Complete agent category metadata
4. (Approval) Enable GitHub branch protection on main
5. (Approval) Delete 16 orphan CI apps + stale review app; disable pipeline CI

### Phase 1 — THINKBOX product (resume)
- PR-002 Dependency Resolution
- PR-003 Environment Provisioning (includes durable worker leases — closes E-4)
- PR-004 Code Indexing
- PR-005 Architecture Graph
- PR-006 Engineering Memory
- PR-007 Agent Assignment
- PR-008 Execution

### Phase 2 — Engineering OS deep features
- Engineering Dashboard (from spec I) on WORKSPACE tab
- FORGE/GATE/JOURNAL as explicit service boundaries (or documented mappings)
- ledger-keeper activation (cost reporting)
- Stack auto-merge + merge queue
- Review-app auto-destroy verified end-to-end

### Phase 3 — Scale
- Worker leases/consumer groups (PR-003 overlap) for multi-instance safety
- Provider cost caps enforced at API level
- Self-hosted CI for heavy E2E

## 4. Dependencies

```
THINKBOX PR-002..008 depend on: detection manifest (PR-001) — landed.
Engineering OS features depend on: governance (Phase 0) — in flight.
```

## 5. Success Metric for Phase 0

Readiness score (from `kiloh-report`) crosses from FAIR (63) to GOOD (75+)
by closing governance gaps, wiring enforcement, and cleaning orphan
infrastructure — without any new product feature.
