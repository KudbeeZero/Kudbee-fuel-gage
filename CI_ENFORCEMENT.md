# CI_ENFORCEMENT — OPS-003 Phase D

**THINK Governance Engine — CI enforcement layer**
**Date:** 2026-08-02 | **Mission:** OPS-003 | **Auditor:** KILOH

---

## Purpose

Every PR and push must execute the full governance gate set. Failure blocks
merge. CI is where the Governance Engine's rules become platform-enforced.

## verify.yml — Enforced Gate Order

| # | Gate | Command | Blocking |
|:--|:---|:---|:---|
| 1 | TypeScript 7 compliance | `npm run verify:typescript` | ✅ |
| 2 | Node crypto runtime | `npm run verify:crypto` | ✅ |
| 3 | Secret hygiene | `npm run verify:secrets` | ✅ |
| 4 | Agent contracts | `verify:agent-contracts \|\| true` | optional |
| 5 | Integration capabilities | `verify:integrations \|\| true` | optional |
| 6 | Learning protocol | `verify:learning-protocol \|\| true` | optional |
| 7 | Typecheck | `npm run typecheck` | ✅ |
| 8 | Lint | `npm run lint` | ✅ |
| 9 | **Unit tests** | `bun test` | ✅ NEW |
| 10 | **Governance validation** | `protocol-guard status` | ✅ NEW (blocks on violation) |
| 11 | **Mission validation** | `protocol-guard pre-pr` | ✅ NEW |
| 12 | **Memory validation** | `protocol-guard guard` | warn-only (runtime churn) |
| 13 | **Stack validation** | `verify-stack` | ✅ NEW |
| 14 | Build | `npm run build` | ✅ |
| 15 | Bounded smoke | `verify:ci-smoke \|\| true` | optional |

## What Each New Gate Prevents

| Gate | Prevents |
|:---|:---|
| Unit tests | shipping regressions undetected (bun test now in CI) |
| Governance status | pushing while protocol compliance fails (main protection, mission) |
| Mission validation | merging without active mission/objective locks |
| Memory validation | runtime churn in the merge set (warn, non-blocking by design) |
| Stack validation | broken stacked-PR dependency chains |

## Env Bounds (unchanged, still enforced)

- `CI=true`, `MAX_REQUEST_BODY=256kb`, `CI_MUTATION_BUDGET=20`, `E2E_ALLOW_DATABASE_WRITES=0`

## Evidence

CI gate results are deterministic and visible in the Actions run log. Each
`protocol-guard` invocation also appends to `.kilo/memory/guardian/evidence.jsonl`
(committed — durable governance evidence).

## Definition of Done

1. verify.yml runs all 15 gates. ✅ (this change)
2. Every PR executes governance + mission + stack validation. ✅
3. CI failure blocks merge (branch protection pending — see Approval Queue). ⚠️
4. Unit tests (bun) included. ✅

## Note

Full merge-blocking requires GitHub branch protection (required status check on
`Kudbee Bounded CI`). That is staged in the Human Approval Queue (Phase A /
GITHUB_GOVERNANCE_AUDIT G-1) because it is a production-impacting change.
