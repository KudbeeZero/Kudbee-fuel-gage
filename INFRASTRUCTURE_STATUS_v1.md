# INFRASTRUCTURE_STATUS_v1 — OPS-006 Phase 3

**THINK Governance Engine** | **Date:** 2026-08-02 | **Status:** ✅ CLEAN & HEALTHY

---

## Heroku

| App | Environment | Dynos (active) | Size | Rollback depth |
|:---|:---|:---|:---|:---|
| kudbee-fuel-gage | PRODUCTION | web + hermes-worker (2) | Standard-1X | 200 releases |
| kudbee-fuel-gage-staging | STAGING | web + hermes-worker (2) | Eco | — |
| monitor-worker / sentinel | on-demand | 0 | Standard-1X/Eco | scale when needed |

**Cleanup result:** account reduced from 21 apps → **2** (only real environments).

## PostgreSQL (Neon)

| Metric | Value |
|:---|:---|
| Status | **OK** |
| Latency | 3ms |
| Pool config | DB_POOL_MAX clamp 5-20 |
| Connectivity | healthy (health-deep) |
| Rollback | 200 release points (app-level) |

## Redis (Upstash ×2)

| Metric | Value |
|:---|:---|
| Status | **OK** |
| Latency | 14ms |
| Fast brain | REDIS_URL (whole-tapir) |
| Slow brain | REDIS_WORKER_URL (creative-finch) |
| Circuit breaker | MAX_REQUESTS_LIMIT = 500k |

## AI Providers

| Provider | Env var present | Notes |
|:---|:---|:---|
| Groq | GROQ_API_KEY | configured |
| DeepSeek | DEEPSEEK_API | configured |
| (GROK_API + GROQ_API_KEY both present) | — | **duplicate naming — staged in CONFIG_CONSOLIDATION (B-3)** |

## Config Vars (prod)

- 18 vars total; 4 duplicates/mismatches identified (staged, not removed — requires approval):
  `DATABASE_URL_AGENT_v2`, `UPSTASH_REDIS_REST_TOKEN_2`, `UPSTASH_REDIS_REST_URL_2`, `GROK_API`
- Values live only in Heroku (secret-safe)

## Agent / Worker

- agent: ACTIVE_RUNNING, pending triage: 0
- governance queue: BRPOP 5s + DLQ (3 attempts)
- hermes-worker: prod dyno up

## Verdict

**Infrastructure is clean and healthy.** 2 apps, data layer green, no orphans,
deployments deterministic. Config duplicates are the only remaining item
(staged for approval — not a platform capability change).
