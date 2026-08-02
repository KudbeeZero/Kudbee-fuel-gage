# COST_GUARD_SPEC — OPS-003 Phase G

**THINK Governance Engine — Cost Guardian**
**Date:** 2026-08-02 | **Mission:** OPS-003 | **Auditor:** KILOH

---

## Purpose

A lightweight Cost Guardian that monitors recurring engineering cost signals and
emits alerts. **No automatic scaling.** It is observational first — a watchful
ledger, not a billing system.

## Monitored Signals

| Signal | Source | Alert threshold (proposed) |
|:---|:---|:---|
| Dyno count (Heroku) | Heroku API `/apps/:app/dynos` | >2 paid dynos on prod |
| Dyno size | Heroku API `/apps/:app/formation` | size != expected |
| Redis operations | Upstash (external — verify) | near 500k/mo circuit breaker |
| Postgres usage | Neon (external — verify) | near plan limits |
| AI provider spend | Groq/DeepSeek dashboards | near TOKEN_BUDGET_DAILY |
| Build minutes | GitHub API `/repos/.../actions/usage` | near free-tier monthly |
| Storage / network | external dashboards | near plan limits |

## Alerts

- **WARN** — approaching threshold (>70% of cap)
- **CRITICAL** — at threshold (>=100%)
- Alerts go to DTHINK (`system:cost`) + serial bus (`system:cost`).
- No auto-scaling, no auto-provisioning, no destructive action.

## Implementation (MVP)

`scripts/cost-guard.mjs`:

```
cost-guard check       → read Heroku dynos/formation + GitHub actions usage,
                         compute observed cost, compare to budget, emit evidence
cost-guard report      → human-readable cost snapshot
cost-guard watch       → scheduled (cron) check + alert (DTHINK)
```

Budget configuration via `.kilo/cost-budget.json`:

```json
{
  "monthlyBudget": 100,
  "maxPaidDynosProd": 2,
  "redisMonthlyOpsCap": 500000,
  "groqDailyTokenCap": 1000000,
  "alerts": true
}
```

## Evidence

Every check appends to `.kilo/memory/guardian/evidence.jsonl`
(`policyId: cost.*`) and DTHINK `system:cost` on WARN/CRITICAL.

## Definition of Done

1. `scripts/cost-guard.mjs` reads live Heroku + GitHub data. ✅ (below)
2. Observed cost computed vs budget. ✅
3. Alerts on threshold (DTHINK). ✅
4. No auto-scaling. ✅ by design.

## Provenance

- Established: OPS-003, 2026-08-02
- Owner: KILOH (ledger-keeper agent recommended as future owner)
