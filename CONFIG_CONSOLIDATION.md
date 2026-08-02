# CONFIG CONSOLIDATION — OPS-006 Workstream 5

**THINK Governance Engine** | **Date:** 2026-08-02 | **Status:** STAGED (prod-impacting — B-3 approval required)
**Security:** Name-only inventory. Values live only in Heroku config vars (never written to repo).

---

## Rollback Backup (source of truth: Heroku)

A full config-vars backup is captured by KILOH **in Heroku only** (no values in
repo). Before any change, export:
```bash
heroku config:get <VAR> --app kudbee-fuel-gage > /tmp/backup_<VAR>.txt   # local, not committed
# or: heroku config --app kudbee-fuel-gage --json | jq -S . > /tmp/config_backup.json
```
Rollback = re-set the prior value (from local backup) via `heroku config:set`.

## Duplicate / Normalization Inventory

| Config | Status | Action (approved only) | Risk |
|:---|:---|:---|:---|
| `DATABASE_URL` | keep | source of truth | — |
| `DATABASE_URL_AGENT_v2` | **DUPLICATE** | unset if unused (verify agent v2 not active) | low |
| `UPSTASH_REDIS_REST_TOKEN` | keep | fast brain | — |
| `UPSTASH_REDIS_REST_TOKEN_SLOW` | keep | slow brain | — |
| `UPSTASH_REDIS_REST_TOKEN_2` | **DUPLICATE** | unset (same as _SLOW) | low |
| `UPSTASH_REDIS_REST_URL` | keep | fast brain | — |
| `UPSTASH_REDIS_REST_URL_2` | **DUPLICATE** | unset (same as REDIS_WORKER_URL) | low |
| `GROQ_API_KEY` | keep | canonical Groq key | — |
| `GROK_API` | **MISMATCH** | normalize → GROQ_API_KEY (verify which client reads which) | medium |
| `REDIS_URL` | keep | REST URL (consider rediss:// later) | — |
| `REDIS_WORKER_URL` | keep | slow brain | — |
| others (API_KEY, DEEPSEEK_API, INCEPTION_*, STREAM_SECRET) | keep | in use | — |

## Proposed Removal (4 vars)

1. `DATABASE_URL_AGENT_v2` (dupe of DATABASE_URL)
2. `UPSTASH_REDIS_REST_TOKEN_2` (dupe of _SLOW)
3. `UPSTASH_REDIS_REST_URL_2` (dupe of REDIS_WORKER_URL)
4. `GROK_API` → merged into `GROQ_API_KEY` (normalize after confirming client reads GROQ_API_KEY)

## Verification After Change

```bash
curl -sf https://kudbee-fuel-gage-330ade653a62.herokuapp.com/api/system/health-deep
# Expected: HEALTHY — DB, vector, redis all green (proves no behavior change)
```

## Before → After → Verification

| Phase | State |
|:---|:---|
| Before | 18 vars, 4 duplicates/mismatches |
| After (approved) | 14 vars, no duplicates |
| Verification | health-deep HEALTHY + control tower 200 |

## Rollback

Re-set the removed vars from the local backup file. Safe — the app will pick up
config on next dyno restart.
