# Redis Quota Recovery — Learned Process (2026-08-04)

> **Lesson:** When Upstash Redis quota exhausts (500k/500k monthly), the system
> degrades gracefully — but production needs a recovery path. This card
> documents the exact procedure so any agent can execute it from memory.

---

## Symptom

- `/health` shows `redis: unhealthy` on production
- Logs: `ERR max requests limit exceeded. Limit: 500000, Usage: 500000`
- `curl "https://<instance>.upstash.io/keys/kudbee:*"` → quota error
- Hermes heartbeats fail; circuit breaker opens (by design — protects quota)

## Diagnosis (verify which instances are exhausted)

```bash
# List Redis config vars on both apps
curl -s -H "Authorization: Bearer $HEROKU_API_KEY" \
  -H "Accept: application/vnd.heroku+json; version=3" \
  "https://api.heroku.com/apps/<app>/config-vars" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0)); \
    Object.keys(d).filter(k=>/REDIS/i.test(k)).forEach(k=>console.log(k,'→',d[k].slice(0,40)))"

# Probe each instance for quota (GET-style REST works for reads)
curl -s "https://<instance>.upstash.io/keys/kudbee:*" \
  -H "Authorization: Bearer <token>" --max-time 10
# quota error → exhausted; result array → working
```

## Our two instances (as of 2026-08-04)

| Instance | Role | Status |
|:---|:---|:---|
| `whole-tapir-175740` | Prod Fast Brain (`REDIS_URL`) | **EXHAUSTED** (500k/500k) |
| `creative-finch-182843` | Staging + prod Slow Brain (`_2`/`SLOW`) | **WORKING** (live keys) |

## Recovery procedure

1. **Confirm the working instance** — probe `keys/kudbee:*`; a `result` array means healthy.
2. **Write REST token via Heroku API PATCH** — config vars ARE writable with the
   Heroku token (returns 200 + full updated config). Set `UPSTASH_REDIS_REST_TOKEN`
   to the working instance's token. NOTE: empty-string does NOT remove a var.
3. **Point slow-brain at the working instance**: `REDIS_SLOW_URL` +
   `REDIS_SLOW_TOKEN` (server reads `REDIS_SLOW_URL || REDIS_URL` for workers).
   NOTE: `REDIS_URL` itself may be a Heroku-managed var that ignores PATCH —
   use `REDIS_SLOW_URL`/`_2` vars instead.
4. **Redeploy** — config changes require a dyno restart to take effect.
5. **Verify** — `curl /health` → `redis: healthy`; `curl /api/system/health-deep`.

## Gotchas learned

- **GET-style REST** (`/keys/...`, `/set/...`) works for simple commands;
  arrays need `/pipeline` with `[["SET","k","v"],...]`.
- **`ERR unsupported arg type: "[": json.Delim`** = wrong endpoint (array sent to
  GET-style root). Use `/pipeline`.
- **Quota is per-instance, not per-app** — staging and prod share Upstash
  instances via config. Check both apps' vars before assuming.
- **Circuit breaker + local filesystem fallback** (`hermes.js`) keep the system
  alive during exhaustion — heartbeats write to `.kilo/memory/local-state/`.
- **Quota resets monthly** — after reset, restore the primary instance config.

## Prevention (permanent — 2026-08-04 HARD FIX)

**Interval tuning (164% → 23% of quota):**
- `worker.js`: hermes heartbeat **10s → 5min** (259k → 8.6k req/month)
- `worker.js`: hermes audit **60s → 15min** (43k → 2.9k req/month)
- `worker.ts`: governance BRPOP **5s → 25s** (518k → 104k req/month)
- `hermes.js`: HEARTBEAT_TTL **30s → 360s** (matches 5min interval)

**Protection layers (all active):**
1. Interval tuning — prevents the demand (115k vs 500k cap = 23%)
2. `isRedisQuotaError()` — detects MAX_REQUESTS_LIMIT / 429 / ERR max requests
3. `applyRedisQuotaBackoff()` — exponential 2s→30s on quota errors
4. Local filesystem fallback — hermes heartbeats survive exhaustion

**Do NOT revert these intervals without re-running the quota math.**
The old values guaranteed exhaustion (164% of monthly quota).
