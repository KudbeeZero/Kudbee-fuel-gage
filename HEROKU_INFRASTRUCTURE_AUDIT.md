# HEROKU INFRASTRUCTURE AUDIT — OPS-001 (Phase 2)

**Mission:** OPS-001 Engineering Workflow & Infrastructure Verification
**Date:** 2026-08-02 | **Mode:** READ-ONLY (no infrastructure modified)
**Auditor:** KILOH (engineering orchestrator)

---

## Executive Summary

Heroku hosts 19 apps but only **3 are real environments** (production, staging,
review-PR-233). The other **16 are orphaned Heroku CI test apps**
(`kudbee-fuel--ci-171…192`) that were auto-created per CI run and never cleaned
up. Production runs 2 paid Standard-1X dynos with external Neon Postgres +
Upstash Redis (no Heroku data add-ons). **Heroku CI is only half-disabled**: the
`app.json` test environment was removed, but the pipeline CI flag and orphan
apps remain — new test runs were still queuing as of the audit.

---

## 7. Application Inventory (19 apps)

| App | Class | Environment | Dynos | Notes |
|:---|:---|:---|:---|:---|
| `kudbee-fuel-gage` | Production | PROD | web + hermes-worker (Standard-1X) | live, updated 2026-08-02 |
| `kudbee-fuel-gage-staging` | Staging | STAGING | web + hermes-worker (Eco) | live, updated 2026-08-01 |
| `kudbee-think-or-pr-233` | Review | REVIEW | web (Eco) | orphaned review app from PR #233 (merged) |
| `kudbee-fuel--ci-171…192` (16) | CI Test | **ORPHAN** | none running | per-run CI apps, never destroyed |

## 8. Pipeline Verification

- **Pipeline exists:** `kudbee-fuel-gage-pipeline` (cedar generation, id `48ae3106…`)
- **Stages coupled:** production + staging (from app inventory); review apps were enabled.
- **Alignment with THINK Protocol:** Partial. The 3-environment split (prod/staging/review) aligns with the stacked-PR model, but Heroku CI test runs are **still active** at the pipeline level despite `app.json` having no test environment.
- **Gap:** pipeline-level CI should be disabled to fully stop test runs.

## 9. Review App Strategy

- **Enabled:** yes (review apps were on).
- **Current state:** one orphaned review app (`kudbee-think-or-pr-233`) remains from the merged PR #233.
- **Recommended workflow (aligned with stacked PRs):**
  ```
  feature branch → stacked PR → review app → GitHub CI (verify) → GATE → approval → merge → review app destroyed
  ```
- **Compatibility with stacked PRs:** good — each PR gets an isolated review app; destroy on merge.
- **Finding:** review-app auto-destroy is either off or failed; the PR #233 review app persists.

## 10. Dyno Inventory

### Production (`kudbee-fuel-gage`)

| Process | Size | Qty | State | Est. hourly | Est. monthly |
|:---|:---|:---|:---|:---|:---|
| web | Standard-1X | 1 | up | $0.05 | ~$25 |
| hermes-worker | Standard-1X | 1 | up | $0.05 | ~$25 |
| monitor-worker | Standard-1X | 0 | — | — | — |
| sentinel | Standard-1X | 0 | — | — | — |
| **Subtotal** | | 2 | | **$0.10/hr** | **~$50/mo** |

### Staging (`kudbee-fuel-gage-staging`)

| Process | Size | Qty | State | Est. cost |
|:---|:---|:---|:---|:---|
| web | Eco | 1 | — | free-tier |
| hermes-worker | Eco | 1 | — | free-tier |
| monitor-worker | Eco | 0 | — | — |
| sentinel | Eco | 0 | — | — |
| **Subtotal** | | 2 | | **$0** |

### Review (`kudbee-think-or-pr-233`) + CI orphans

| App | Dynos | Cost |
|:---|:---|:---|
| review PR #233 | 1 Eco web | free (but stale) |
| 16 CI test apps | 0 running | $0 (idle clutter) |

## 11. Database Audit

- **Provider:** Neon Postgres (external, NOT a Heroku add-on) — `postgresql://neondb_owner:…@ep-damp-voice…neon.tech/neondb`
- **Plan:** external (pooled connection, `sslmode=require&channel_binding=require`)
- **Config:** `DB_POOL_MAX=5` (staging), prod env has DATABASE_URL + DATABASE_URL_AGENT_v2 (duplicate — review)
- **Risks:** two DATABASE_URL variants could diverge; no Heroku-managed DB so no Heroku add-on cost
- **Observation:** pooling strategy set via app config, not Heroku; acceptable.

## 12. Redis Audit

- **Provider:** Upstash Redis (external) — 2 instances:
  - `whole-tapir-175740.upstash.io` (primary, REST URL as REDIS_URL)
  - `creative-finch-182843.upstash.io` (slow/worker)
- **Config:** `REDIS_URL` points to the Upstash REST URL (https://), `REDIS_WORKER_URL` to the second instance.
- **Observation:** `REDIS_URL` using the REST endpoint rather than a `rediss://` TCP connection string may affect client connection semantics — recommend verifying the client library resolves `REDIS_URL` correctly.
- **Tokens:** UPSTASH_REDIS_REST_TOKEN + _2 + _SLOW present (3 tokens for 2 instances — one duplicate).

## 13. Add-on Audit

| Add-on | Plan | State | Purpose | Required? | Cost |
|:---|:---|:---|:---|:---|:---|
| logtail (prod) | free | provisioned | log drain | optional | $0 |
| scheduler (prod) | standard | provisioned | scheduled jobs | verify | ~$10/mo? |
| (staging) | none | — | — | — | $0 |

- **Finding:** confirm the `scheduler:standard` add-on is actually used; if idle, remove.

## 14. Platform API Readiness

| Operation | Classification | Notes |
|:---|:---|:---|
| GET /apps, /apps/:app/formation, /dynos, /releases, /addons, /config-vars | READ-ONLY | audit-safe, used here |
| GET /pipelines, /pipelines/:id | READ-ONLY | used here |
| DELETE /apps/:app/dynos (restart) | SAFE AUTOMATION | for deploy/rollout |
| POST /apps/:app/builds (from tarball) | SAFE AUTOMATION | used earlier for review deploy |
| PATCH /apps/:app/config-vars | APPROVAL REQUIRED | secret-bearing |
| DELETE /apps (destroy) | PRODUCTION PROTECTED | never without human sign-off |
| Scale/formation changes | APPROVAL REQUIRED | cost impact |

## 15. Cost Analysis

| Line item | Est. monthly |
|:---|:---|
| Production dynos (2× Standard-1X) | ~$50 |
| Staging dynos (2× Eco) | $0 |
| Review app (1× Eco) | $0 |
| Neon Postgres (external) | external billing (verify) |
| Upstash Redis ×2 (external) | external billing (verify) |
| scheduler add-on | ~$10 (verify usage) |
| logtail free | $0 |
| **Heroku-side total (observed)** | **~$50–60/mo** |
| **External (Neon + Upstash)** | **estimate — verify provider dashboards** |

*Values marked "estimate" are derived from Heroku public pricing; observed dyno
counts are from the live API.*

## 16. Optimization Opportunities

| Opportunity | Type | Impact | Action (post-audit, not now) |
|:---|:---|:---|:---|
| Destroy 16 orphaned CI apps | cleanup | account hygiene | DELETE each (production-protected, human approval) |
| Destroy review app PR #233 | cleanup | hygiene | DELETE (merged PR) |
| Fully disable Heroku CI | cost/ops | stop future CI app churn | disable pipeline CI flag in dashboard/API |
| Scale-to-zero monitor-worker/sentinel | cost | already qty 0 ✅ | keep at 0 until needed |
| Remove duplicate DATABASE_URL_AGENT_v2 | hygiene | reduce drift | unset if unused |
| Consolidate Upstash tokens (_2/_SLOW) | hygiene | reduce secrets | keep only used tokens |
| Verify scheduler add-on usage | cost | remove if idle | check scheduler jobs |
| Add branch protection to main | governance | enforce Rule 1 | GitHub settings (Phase 1 W-01) |

---

## Success Criteria Answers

6. **Are Heroku deployments aligned with the Engineering OS?** Largely yes — prod/staging/review reflect the stack model; CI orphan apps are the exception.
7. **What is our true infrastructure cost?** ~$50–60/mo on Heroku side (2 paid dynos + scheduler); external Neon/Upstash billed separately (verify dashboards).
8. **Where are the bottlenecks?** 16 orphan CI apps + active pipeline CI despite disable; duplicate config vars.
9. **What should be automated next?** CI-app auto-destroy, review-app auto-destroy, branch-protection enforcement.
10. **Highest-priority improvement before feature work?** Close W-01 (GitHub branch protection) + fully disable Heroku CI + clean 17 orphan apps.

*Phase 2 complete. This document + ENGINEERING_WORKFLOW_AUDIT.md form the OPS-001 canonical baseline.*
