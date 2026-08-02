# DATA INFRASTRUCTURE — OPS-002 Workstream E

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY | **Auditor:** KILOH

---

## Executive Summary

The data layer is **external-first**: Neon Postgres (with pgvector) for durable
state and Upstash Redis for fast coordination. Two Redis instances separate the
"fast brain" (REDIS_URL) from the "slow brain" (REDIS_WORKER_URL). Connection
handling is hardened (pool clamping, circuit breakers, sanitized URLs, retry
throttles), and worker polling uses bounded BRPOP/BLPOP with 5s timeouts. The
architecture is sound; opportunities exist around URL semantics, duplicate
config, and idle pool tuning.

## 1. PostgreSQL (Neon)

| Aspect | Value |
|:---|:---|
| Provider | Neon (external, no Heroku add-on) |
| Connection | `postgresql://neondb_owner:…@…neon.tech/neondb?sslmode=require` |
| Pool max | `DB_POOL_MAX` default 5, clamp 1–20, prod/staging configured |
| Pool behavior | LAZY + TOLERANT (unhealthy on failure, never crashes) |
| Extensions | pgvector (1536-dim embeddings) |

**Schema (canonical tables):**
telemetry_traces, telemetry_logs, security_violations, telemetry_vectors,
user_memories, governance_actions, think, think_tokens, vector_memory.

## 2. Redis (Upstash) — two instances

| Instance | Env var | Purpose |
|:---|:---|:---|
| Fast brain | `REDIS_URL` (whole-tapir-175740) | telemetry, rate limits, budgets |
| Slow brain | `REDIS_WORKER_URL` (creative-finch-182843) | workers, HERMES, governance |

**Connection profile (`services/lib/redis.js`):**
- `sanitizeRedisUrl()` normalizes URL with token
- `maxRetriesPerRequest: 0` default (fail fast)
- `enableOfflineQueue` opt-in for subscriber connections
- Adaptive circuit breaker at 500k limit (`MAX_REQUESTS_LIMIT`)
- Retry throttle caps connection log noise

## 3. Redis Key Catalog (from kudbee skill)

| Key pattern | Type | TTL | Purpose |
|:---|:---|:---|:---|
| `kudbee:ratelimit:{key}` | ZSET | window | atomic sliding-window |
| `kudbee:budget:{tenant}:daily:{date}` | STRING | 86400 | token usage |
| `kudbee:spheroid:audit` | STREAM | MAXLEN 10000 | audit ledger |
| `kudbee:breadcrumbs` | STREAM | MAXLEN 500 | error tracing |
| `kudbee-governance-tasks` | LIST | — | worker queue (BRPOP) |
| `kudbee-governance-tasks-failed` | LIST | — | DLQ (3 attempts) |
| `kudbee:events` | PUB/SUB | — | state transitions |
| `kudbee:telemetry_feed` | LIST | — | monitor BLPOP |
| `kudbee:jobs:{queue}` | LIST | — | generic jobs |

## 4. Worker Patterns

| Worker | Pattern | Timeout | DLQ |
|:---|:---|:---|:---|
| Governance (`worker.ts`) | BRPOP `kudbee-governance-tasks` | 5s | 3 attempts → failed list |
| Monitor (`monitor/agent.js`) | BLPOP `kudbee:telemetry_feed` | 5s | — |

- Exponential backoff on command timeouts (verified in worker.ts)
- No lease/consumer-group semantics yet (single consumer per queue) — a PR-002/003 item

## 5. Findings

| # | Severity | Finding |
|:--|:---|:---|
| E-1 | MEDIUM | `REDIS_URL` uses Upstash REST URL (https://) — client sanitizer converts it, but a `rediss://` URL is more explicit |
| E-2 | MEDIUM | `DATABASE_URL_AGENT_v2` duplicates DATABASE_URL — drift risk |
| E-3 | MEDIUM | 3 Upstash tokens for 2 instances (one redundant) |
| E-4 | LOW | worker claims have no lease/consumer-group — crash may reprocess (acceptable for current idempotent gates, revisit at PR-003) |
| E-5 | LOW | pool max 20 ceiling may throttle burst traffic on prod (verify load) |

## 6. Recommendations

| # | Action | Classification |
|:---|:---|:---|
| E-1 | Normalize REDIS_URL to `rediss://` connection string | Awaiting approval (config change) |
| E-2 | Unset duplicate DATABASE_URL_AGENT_v2 | Awaiting approval |
| E-3 | Remove redundant Upstash token | Awaiting approval |
| E-4 | Add lease/consumer-group at PR-003 (durable workers) | Safe (future feature) |
| E-5 | Load-test pool max; tune DB_POOL_MAX per environment | Safe (non-production test) |
