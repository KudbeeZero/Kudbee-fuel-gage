---
Superseded by: ENGINEERING_STATE.md
Archived: 2026-08-04
Reason: Repository simplification (STAB-004)
---
# CI PIPELINE AUDIT — OPS-002 Workstream B

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY | **Auditor:** KILOH

---

## Executive Summary

The CI pipeline is **green and functional**: `Kudbee Bounded CI` (verify) and
both CodeQL workflows pass on main and PR branches. Recent runs show success
across `main`, `feature/thinkbox-pr001`, and PR #235 head. The pipeline is
bounded (budget caps, no DB writes in CI), which aligns with the platform's
cost discipline. Technical debt: duplicate CodeQL/Copilot workflows and
Heroku CI test runs that should be fully disabled.

## 1. Workflow Inventory

| # | Workflow | Trigger | Purpose | Status | Last result |
|:--|:---|:---|:---|:---|:---|
| 1 | Kudbee Bounded CI (`verify.yml`) | PR + push main + manual | Typecheck, lint, verify gates, build | ACTIVE | ✅ success |
| 2 | CodeQL (`codeql.yml`) | push main/staging + PR + weekly | Security analysis | ACTIVE | ✅ success |
| 3 | CodeQL (built-in dynamic) | GitHub-managed | Security analysis | ACTIVE | ✅ success |
| 4 | Deploy to Heroku Staging | push to staging | Auto-deploy | ACTIVE | verify |
| 5 | Session Logger | session events | Archive | ACTIVE | verify |
| 6 | Copilot | PR/manual | AI PR assist | ACTIVE | verify |
| 7 | Copilot cloud agent | manual | Cloud orchestration | ACTIVE | verify |

## 2. Primary Gate — `verify.yml` Steps

| Step | Command | Blocking |
|:---|:---|:---|
| TypeScript 7 compliance | `verify:typescript` | ✅ |
| Node crypto runtime | `verify:crypto` | ✅ |
| Secret hygiene | `verify:secrets` | ✅ |
| Agent contracts | `verify:agent-contracts \|\| true` | optional |
| Integration capabilities | `verify:integrations \|\| true` | optional |
| Learning protocol | `verify:learning-protocol \|\| true` | optional |
| Typecheck | `npm run typecheck` (turbo, TS7) | ✅ |
| Lint | `npm run lint` | ✅ |
| Build | `npm run build` (turbo) | ✅ |
| Bounded smoke | `verify:ci-smoke \|\| true` | optional |

**Env bounds:** CI=true, MAX_REQUEST_BODY=256kb, CI_MUTATION_BUDGET=20,
E2E_ALLOW_DATABASE_WRITES=0. ✅ matches platform cost policy.

## 3. Required Verification Coverage

| Capability | Status | Where |
|:---|:---|:---|
| Build | ✅ | verify.yml `npm run build` |
| TypeScript | ✅ | verify.yml `verify:typescript` + typecheck |
| Lint | ✅ | verify.yml `lint` |
| Unit tests | ⚠️ | `bun test` not wired into verify.yml |
| Integration tests | ⚠️ | E2E requires DB/Redis (skipped in CI by design) |
| Deployment | ⚠️ | Heroku deploy workflow exists; staging only |
| Release | ⚠️ | manual via git push (200 prod releases) |
| PR validation | ✅ | verify.yml on pull_request |
| Review apps | ✅ | Heroku review apps enabled (destroy_stale) |
| Protocol guard | ⚠️ | not part of CI; local pre-commit only (and hook inactive) |
| Engineering memory | ⚠️ | not gated in CI; learning-cycle is manual |

## 4. Failure Rate

- Recent runs (last 8): **7 success, 1 cancelled** (cancelled = superseded by concurrency on same branch).
- Failure rate: **0%** in the observed window.

## 5. Technical Debt

| Item | Impact |
|:---|:---|
| Duplicate CodeQL workflows (custom + built-in) | redundant scanning, noise |
| Duplicate Copilot workflows | ambiguity |
| `bun test` not in CI | unit regressions undetected in CI |
| Protocol guard not in CI | enforcement only local + inactive hook |
| Heroku CI test runs still queuing | orphan app churn (see C-1) |
| Optional steps via `\|\| true` | can mask real failures |

## 6. Recommended Actions

| # | Action | Classification |
|:---|:---|:---|
| B-1 | Wire `bun test` into verify.yml (unit tests) | Safe (non-production) |
| B-2 | Add `protocol-guard status` to verify.yml | Safe (non-production) |
| B-3 | Remove duplicate CodeQL + Copilot workflows | Safe (non-production) |
| B-4 | Fully disable Heroku CI pipeline flag | Awaiting human approval |
| B-5 | Make optional steps fail loudly with `continue-on-error` | Safe (non-production) |
