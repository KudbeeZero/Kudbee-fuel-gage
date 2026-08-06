---
Superseded by: ENGINEERING_STATE.md
Archived: 2026-08-04
Reason: Repository simplification (STAB-004)
---
# HEROKU PIPELINE AUDIT — OPS-002 Workstream C

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY (production NOT modified)
**Auditor:** KILOH

---

## Executive Summary

Heroku hosts a **3-tier deployment model** (production, staging, review apps)
on the `heroku-26` stack with 200 production releases of rollback history.
Review apps are **auto-enabled with auto-destroy** (2-day staleness). **CI is
half-disabled**: `app.json` test env was removed but the pipeline still queues
test runs, leaving **16 orphaned `kudbee-fuel--ci-*` apps**. Production runs 2
paid Standard-1X dynos; data lives on external Neon Postgres + Upstash Redis.

## 1. Environment Map

| Environment | App | Dynos | Stack | Branch | Latest release |
|:---|:---|:---|:---|:---|:---|
| Production | `kudbee-fuel-gage` | web + hermes-worker (Std-1X) | heroku-26 | main | 200 releases |
| Staging | `kudbee-fuel-gage-staging` | web + hermes-worker (Eco) | heroku-26 | staging | — |
| Review | `kudbee-think-or-pr-*` | web (Eco) | heroku-26 | per-PR | destroyed after merge |
| CI (orphans) | `kudbee-fuel--ci-171…192` | 0 running | — | — | 16 stale apps |

## 2. Pipeline Configuration

| Setting | Value |
|:---|:---|
| Pipeline | `kudbee-fuel-gage-pipeline` (cedar) |
| GitHub integration | connected (repo id 1304213982) |
| Review apps | `automatic_review_apps: true` |
| Review app staleness | 2 days |
| Destroy stale review apps | `true` |
| Wait for CI before review app | `true` |
| Base name | `kudbee-think-or` |
| Deploy target | region `us` |

## 3. Promotion Flow

- **Detected:** staging → production is via **manual git push** (`deploy-prod.sh`
  uses `heroku git:remote` + push). No pipeline "Promote to production" button
  usage confirmed — verify with owner.
- **Automatic deploys:** Deploy-to-Heroku-Staging workflow exists (staging auto).
- **Rollback capability:** ✅ 200 release points on prod; `heroku releases:rollback`
  available.

## 4. Review App Workflow (aligned with stacked PRs)

```
feature branch → stacked PR → auto review app → wait_for_ci → GitHub CI verify
→ GATE approval → merge → review app auto-destroyed (2-day stale fallback)
```
✅ Compatible with the PR stacking protocol. The `kudbee-think-or-pr-233` app
should have been auto-destroyed on merge; it persists (stale) — cleanup item.

## 5. Config Vars & Environment Separation

| App | Key vars |
|:---|:---|
| prod | DATABASE_URL (+ _AGENT_v2), REDIS_URL, REDIS_WORKER_URL, UPSTASH tokens ×3, STREAM_SECRET, GROQ_API_KEY, NODE_ENV=production |
| staging | NODE_ENV=staging, CI bounds (pool 10, body 512kb) |

**Findings:**
- C-2: duplicate `DATABASE_URL_AGENT_v2` may drift (review)
- C-3: `REDIS_URL` points to Upstash REST URL (https) — verify client resolves correctly
- C-4: 3 Upstash tokens for 2 instances (one duplicate)

## 6. Key Findings

| # | Severity | Finding |
|:--|:---|:---|
| C-1 | **HIGH** | 16 orphaned CI apps + pipeline CI still queues runs despite app.json removal |
| C-2 | MEDIUM | duplicate DATABASE_URL variant |
| C-3 | MEDIUM | REDIS_URL uses REST endpoint, not rediss:// |
| C-4 | LOW | redundant Upstash token |
| C-5 | LOW | stale review app PR #233 persists |

## 7. Recommended Actions (Awaiting Human Approval — production-impacting)

| # | Action | Rollback |
|:---|:---|:---|
| C-1a | Destroy 16 orphaned `kudbee-fuel--ci-*` apps | N/A (irreversible — verify none in use) |
| C-1b | Disable pipeline CI flag (dashboard or API) | Re-enable CI flag |
| C-2 | Remove `DATABASE_URL_AGENT_v2` if unused | Re-add |
| C-3 | Switch REDIS_URL to `rediss://` connection string | Restore REST URL |
| C-4 | Remove unused Upstash token | Re-add |
| C-5 | Delete stale review app `kudbee-think-or-pr-233` | N/A (irreversible) |
