# UPDATED_COST_MODEL — OPS-004 Phase 6

**THINK Governance Engine** | **Date:** 2026-08-02 | **Owner:** KILOH

---

## Observed (live evidence) vs Projected

| Service | Monthly (observed) | Monthly (projected) | Utilization | Optimization | Growth risk |
|:---|:---|:---|:---|:---|:---|
| Heroku web (1×Std-1X) | ~$25 | ~$25 | 1 dyno up | keep 1 | low |
| Heroku hermes (1×Std-1X) | ~$25 | ~$25 | 1 dyno up | keep 1 | low |
| Heroku staging (2×Eco) | $0 | $0 | free tier | keep | low |
| Heroku scheduler add-on | verify | ~$10 | provisioned | **remove if unused** | low |
| Heroku logtail | $0 | $0 | free | keep | low |
| **Heroku total** | **~$50** | **~$60** | | | |
| Neon Postgres | **verify** | est. $0-25 | pooled | rightsize plan | medium |
| Upstash Redis ×2 | **verify** | est. $0-20 | light | remove dup token | medium |
| GitHub Actions | $0 | $0 | free tier | bounded CI | low |
| Groq API | **verify** | usage-based | on-demand | TOKEN_BUDGET_DAILY cap | **high** |
| DeepSeek API | **verify** | usage-based | on-demand | cap | **high** |
| Review apps | $0 | $0 | auto-destroy | verified | low |
| Copilot | bundled | bundled | active | — | low |

## Cost Guardians (live)

```bash
node scripts/cost-guard.mjs report
# prod-dynos 2 (cap 2) · monthly-estimate $50 of $100 (50%) · PASS
```

## Duplicate Config (removable — Phase 1/3)

| Item | Impact |
|:---|:---|
| `DATABASE_URL_AGENT_v2` (dupe of DATABASE_URL) | drift risk, remove |
| `UPSTASH_REDIS_REST_TOKEN_2` + `_SLOW` (3 tokens, 2 instances) | remove unused |
| `GROK_API` vs `GROQ_API_KEY` naming mismatch | normalize to GROQ_API_KEY |

## Cost Controls (active)

- CI bounds: `CI_MUTATION_BUDGET=20`, `MAX_REQUEST_BODY=256kb`, `E2E_ALLOW_DATABASE_WRITES=0`
- Redis circuit breaker: `MAX_REQUESTS_LIMIT=500k`
- Token budget: `TOKEN_BUDGET_DAILY=1M`
- monitor/sentinel at 0 dynos

## Summary

**Observed Heroku-side: ~$50/mo.** External (Neon/Upstash/Groq/DeepSeek) require
provider-dashboard verification (not accessible read-only here). Highest growth
risk: LLM provider spend — mitigated by budget caps + cost-guard monitoring.
Recommended: activate `ledger-keeper` agent to own monthly cost snapshots.
