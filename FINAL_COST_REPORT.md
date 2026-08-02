# FINAL_COST_REPORT — OPS-006 Workstream 7

**THINK Governance Engine** | **Date:** 2026-08-02 | **Owner:** KILOH (ledger-keeper pending)

---

## Executive Summary

Observed Heroku-side cost: **~$50/mo** (50% of the $100 budget — PASS). The
largest controllable waste is **not cost but hygiene**: 25 idle Heroku CI
orphan apps (0 dynos, $0) created by the still-active pipeline CI flag. LLM
provider spend (Groq/DeepSeek) is the highest growth risk and requires
dashboard verification.

## Cost Breakdown (monthly)

| Service | Observed | Projected | Utilization | Optimization | Growth risk |
|:---|:---|:---|:---|:---|:---|
| Heroku web (1×Std-1X) | ~$25 | ~$25 | 1 dyno up | keep 1 | low |
| Heroku hermes (1×Std-1X) | ~$25 | ~$25 | 1 dyno up | keep 1 | low |
| Heroku staging (2×Eco) | $0 | $0 | free tier | keep | low |
| Heroku scheduler | verify | ~$10 | provisioned | REMOVE if no jobs (WS4) | low |
| Heroku logtail | $0 | $0 | free | keep | low |
| **Heroku total** | **~$50** | **~$60** | | | |
| Neon Postgres | verify | est. $0-25 | pooled | rightsize | medium |
| Upstash Redis ×2 | verify | est. $0-20 | light | dedupe tokens (WS5) | medium |
| GitHub Actions | $0 | $0 | free tier | bounded CI | low |
| Groq API | verify | usage-based | on-demand | TOKEN_BUDGET_DAILY cap | **high** |
| DeepSeek API | verify | usage-based | on-demand | cap | **high** |
| OpenAI/Anthropic | — | $0 | not used | — | — |
| Storage/bandwidth | external | verify | — | — | medium |

## Budget Compliance

| Metric | Value | Status |
|:---|:---|:---|
| Monthly budget | $100 | — |
| Observed | ~$50 | **50% — PASS** |
| Cost guard | prod-dynos 2/2, CI 0/2000 | PASS |

## Optimization Opportunities

| # | Action | Impact | Classification |
|:--|:---|:---|:---|
| C-1 | Disable Heroku CI pipeline flag (WS2) | stops orphan app creation (25 idle apps) | human dashboard |
| C-2 | Delete 26 orphan apps (WS3) | hygiene | explicit approval |
| C-3 | Remove scheduler add-on if idle (WS4) | ~$10/mo | verify first |
| C-4 | Config dedupe (WS5) — 4 redundant vars | hygiene + token consolidation | B-3 approval |
| C-5 | Enforce TOKEN_BUDGET_DAILY at provider level | caps LLM spend | config |

## Future Scaling Projections

- **Low:** dynos scale only with real traffic (currently 2 paid).
- **Medium:** LLM spend grows with THINKBOX agent usage — enforce caps pre-launch.
- **Medium:** Neon row growth from embeddings — monitor storage tier.
- **Low:** GitHub Actions stays on free tier (bounded CI).

## Recommendation

Execute C-1/C-2 (CI disable + orphan cleanup) immediately after approval —
they prevent future hygiene debt. Activate `ledger-keeper` agent for monthly
cost snapshots against provider dashboards.
