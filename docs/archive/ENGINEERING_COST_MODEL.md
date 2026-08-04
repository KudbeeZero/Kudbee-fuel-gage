---
Superseded by: ENGINEERING_STATE.md
Archived: 2026-08-04
Reason: Repository simplification (STAB-004)
---
# ENGINEERING COST MODEL — OPS-002 Workstream F

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY | **Auditor:** KILOH

---

## Executive Summary

Observed Heroku-side cost is **~$50–60/mo** (2 Standard-1X dynos + scheduler).
External providers (Neon Postgres, Upstash Redis ×2, Groq, DeepSeek) are billed
separately and must be verified in their dashboards. The largest controllable
cost is **16 orphaned CI apps + stale review apps** (currently idle, so $0, but
account hygiene risk). No OpenAI/Anthropic SDKs are in use; Groq + DeepSeek are
the LLM providers.

## 1. Cost Inventory

| Service | Purpose | Utilization | Est. monthly | Growth risk | Owner | Criticality |
|:---|:---|:---|:---|:---|:---|:---|
| Heroku web (Std-1X) | Express ingestion | 1 dyno up | ~$25 | low | KILOH | HIGH |
| Heroku hermes-worker (Std-1X) | audit | 1 dyno up | ~$25 | low | HERMES | MEDIUM |
| Heroku monitor-worker (Eco) | telemetry | 0 | $0 | — | monitor | LOW |
| Heroku sentinel (Eco) | egress | 0 | $0 | — | sentinel | LOW |
| Heroku staging (Eco ×2) | testing | 1 web + 1 hermes | $0 | — | KILOH | MEDIUM |
| Heroku scheduler add-on | scheduled jobs | verify | ~$10 (verify) | — | KILOH | LOW |
| Heroku logtail | log drain | free | $0 | — | KILOH | LOW |
| Neon Postgres | durable state | pooled | **verify dashboard** | medium | KILOH | CRITICAL |
| Upstash Redis ×2 | coordination | light | **verify dashboard** | medium | KILOH | HIGH |
| Groq API | LLM (threat/mint) | on-demand | **verify** | high | token-forge | MEDIUM |
| DeepSeek API | LLM (deepseek client) | on-demand | **verify** | high | KILOH | MEDIUM |
| GitHub Actions | CI minutes | bounded | ~$0 (free tier) | low | ci-watcher | HIGH |
| Copilot (GitHub) | AI assist | active | bundled | — | KILOH | LOW |

## 2. Observed vs Estimated

- **Observed (from live API):** prod 2 dynos Standard-1X, staging 2 Eco, monitor/sentinel 0.
- **Estimated:** ~$50–60/mo Heroku-side + scheduler (~$10 if used).
- **External (Neon, Upstash, Groq, DeepSeek):** must be read from provider dashboards — not accessible read-only from here.

## 3. Cost Risks

| Risk | Detail |
|:---|:---|
| LLM spend | Groq + DeepSeek on-demand; no hard cap observed beyond token budgets (TOKEN_BUDGET_DAILY=1M) |
| DB growth | pgvector embeddings 1536-dim; row growth → Neon storage tiers |
| Redis ops | 500k/month circuit breaker cap; overage risk if bursty |
| CI minutes | GitHub free-tier minutes; bounded by verify.yml timeout 20m |
| Orphan apps | 16 CI apps + 1 review app — idle now, but if any auto-scale, cost appears silently |

## 4. Optimization Opportunities

| Opportunity | Est. saving | Classification |
|:---|:---|:---|
| Destroy 16 orphan CI apps + 1 review app | hygiene, prevents future cost | Awaiting approval |
| Keep monitor/sentinel at 0 dynos | $0 (already) | ✅ keep |
| Disable scheduler add-on if unused | ~$10/mo | Awaiting approval |
| Enforce TOKEN_BUDGET_DAILY at provider level | caps LLM spend | Safe (config) |
| Move CI to bounded self-hosted for heavy runs | reduces Actions minutes | Safe (non-production) |

## 5. Owner Matrix

- **KILOH:** Heroku dynos, staging, cost model ownership
- **HERMES/ci-watcher:** CI minutes, workflow efficiency
- **token-forge:** Groq/DeepSeek usage
- **ledger-keeper:** budget tracking (defined agent role, idle — recommend activation)

## 6. Recommendation

Activate the `ledger-keeper` agent (already defined in the fleet) to own monthly
cost reporting against `TOKEN_BUDGET_DAILY` and the circuit-breaker limits.
Add a weekly cost snapshot to `kiloh-report.mjs` so cost is first-class
operational visibility.
