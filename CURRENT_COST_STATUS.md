# CURRENT_COST_STATUS — SESSION-001 Phase 5

**Date:** 2026-08-02 | **Source:** cost-guard.mjs + live API

---

## Summary

| Metric | Value | Status |
|:---|:---|:---|
| Monthly budget | $100 | — |
| Observed (Heroku) | **~$50/mo** | 50% — PASS |
| Paid dynos (prod) | 2 (web + hermes Std-1X) | at cap |
| CI minutes | 0 (free tier) | PASS |
| Cost guard policy | PASS | — |

## Breakdown

| Service | Monthly | Notes |
|:---|:---|:---|
| Heroku web + hermes (Std-1X ×2) | ~$50 | fixed |
| Heroku staging (Eco ×2) | $0 | free tier |
| Heroku scheduler add-on | ~$10 (verify) | REMOVE if idle (WS4) |
| Heroku logtail | $0 | free |
| Neon Postgres | verify | external billing |
| Upstash Redis ×2 | verify | external |
| GitHub Actions | $0 | free tier |
| Groq + DeepSeek | verify | usage-based — **growth risk** |

## Optimization (staged, not executed)

| # | Action | Impact |
|:--|:---|:---|
| C-1 | ✅ DONE — Heroku CI retired | stops orphan-app creation |
| C-2 | ✅ DONE — 19 orphan apps deleted | account hygiene |
| C-3 | Remove scheduler if idle | ~$10/mo |
| C-4 | Config dedupe (4 vars) | hygiene + token consolidation |
| C-5 | Enforce TOKEN_BUDGET_DAILY | caps LLM spend |

## Recommendation

Activate `ledger-keeper` agent to own monthly cost snapshots against provider
dashboards (Neon/Upstash/Groq/DeepSeek are external and require dashboard
verification — not API-accessible).
