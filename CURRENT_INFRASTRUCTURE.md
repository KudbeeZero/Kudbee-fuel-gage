# CURRENT_INFRASTRUCTURE — SESSION-001 Phase 5

**Date:** 2026-08-02 | **Snapshot:** live API evidence

---

## Heroku — 2 apps (clean)

| App | Env | Dynos | Size | Health |
|:---|:---|:---|:---|:---|
| kudbee-fuel-gage | PROD | web + hermes-worker | Standard-1X | ✅ ok (uptime 9002s+) |
| kudbee-fuel-gage-staging | STAGING | web + hermes-worker | Eco | ✅ ok |
| monitor-worker / sentinel | on-demand | 0 | — | scaled |

**Cleanup complete:** 19 orphan apps deleted (18 CI + 1 review). Account was
21 → **2 apps**.

## Data Layer (live, healthy)

| Service | Status | Latency |
|:---|:---|:---|
| Neon Postgres | OK | 3ms |
| pgvector | healthy | — |
| Upstash Redis (fast) | OK | 14ms |
| Upstash Redis (slow) | configured | — |

## CI/CD

- **GitHub Actions = sole CI authority** (Heroku CI retired)
- Kudbee Bounded CI: 15 gates (typecheck, lint, build, bun, governance, secrets, CodeQL)
- Rollback: 200 prod release points

## Config (prod, 18 vars)

- 4 duplicates/mismatches staged (NOT removed — requires B-3 approval):
  `DATABASE_URL_AGENT_v2`, `UPSTASH_REDIS_REST_TOKEN_2`, `UPSTASH_REDIS_REST_URL_2`, `GROK_API`
- Values live only in Heroku (secret-safe)

## Cost

- ~$50/mo Heroku (50% of $100 budget) — PASS
- Orphan deletion = $0 impact (apps were idle) but eliminates future risk
