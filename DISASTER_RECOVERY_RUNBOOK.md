# DISASTER_RECOVERY_RUNBOOK — OPS-004 Phase 8

**THINK Governance Engine** | **Date:** 2026-08-02 | **Owner:** KILOH

---

## Purpose

Procedures for recovering the Kudbee Engineering OS from failures. Every
procedure is evidence-based and reversible. **Production-destructive steps
require human approval unless an active incident demands immediate action.**

## 1. Failed Deployment

**Symptom:** prod health check fails after push; `health-deep` returns non-HEALTHY.

```bash
# 1. Identify the broken release (200 release points available)
heroku releases --app kudbee-fuel-gage

# 2. Rollback to the last known-good release (previous version)
heroku releases:rollback <VERSION> --app kudbee-fuel-gage

# 3. Verify health
curl -sf https://kudbee-fuel-gage-330ade653a62.herokuapp.com/api/system/health-deep

# 4. Record evidence
node scripts/dthink-pipeline.mjs feed "system:rollback" "Rolled back to v<VERSION>"
```

**Rollback of the rollback:** re-deploy the fixed commit via `deploy-prod.sh`.

## 2. Emergency Production Freeze

**Trigger:** active incident (data loss, security breach, widespread outage).

```bash
# 1. Stop new feature merges (governance)
#    - GitHub: enable draft on all open PRs, pause merges
#    - KILOH: record freeze in DTHINK
node scripts/dthink-pipeline.mjs feed "system:freeze" "PRODUCTION FREEZE — <reason>"

# 2. Disable auto-deploy workflows (temporarily)
gh workflow disable "Deploy to Heroku Staging"

# 3. Hold all config/dyno changes until triage complete

# 4. Lift freeze after root cause fixed + verified
node scripts/dthink-pipeline.mjs feed "system:unfreeze" "Freeze lifted — <resolution>"
```

## 3. Database Recovery (Neon Postgres)

**Symptom:** `ingestion_db` unhealthy; queries fail.

```bash
# 1. Verify connectivity (read-only)
curl -sf https://kudbee-fuel-gage-330ade653a62.herokuapp.com/api/system/health-deep

# 2. Check pool config (DB_POOL_MAX clamp 5-20)
#    - If pool exhausted: scale web dyno or reduce concurrency

# 3. Neon recovery (external provider):
#    - Login to Neon dashboard → branch restore / point-in-time recovery
#    - OR use Neon API to restore a branch

# 4. After restore, bounce web to clear stale pool:
curl -s -n -X DELETE https://api.heroku.com/apps/kudbee-fuel-gage/dynos \
  -H "Authorization: Bearer ${HEROKU_API_KEY}" \
  -H "Accept: application/vnd.heroku+json; version=3"
```

## 4. Redis Recovery (Upstash)

**Symptom:** `redis` unhealthy; circuit breaker open (500k limit).

```bash
# 1. Check breaker state (services/lib/redis.js adaptive backoff)
#    - Open breaker auto-recovers on successful ping

# 2. If quota exhausted (MAX_REQUESTS_LIMIT=500k):
#    - Reduce telemetry volume (SAMPLE_RATE)
#    - Verify provider quota in Upstash dashboard
#    - Circuit resets on next successful request

# 3. If data loss: Upstash backup restore (provider dashboard)
#    - Note: Redis is coordination, not source of truth — Postgres is durable
```

## 5. Branch Recovery (git)

**Symptom:** feature commits landed on main, or a branch is lost.

```bash
# 1. Feature commits on main → automatic recovery (governance engine)
node scripts/protocol-guard.mjs recover

# 2. Restore a deleted branch
git fetch origin
git checkout -b <branch> <sha-or-ref>

# 3. Recover from a bad force-push (reflog)
git reflog
git reset --hard <sha>

# 4. Diverged main after bad merge
git reset --hard origin/main   # only if local-only; never force-push shared main
```

## 6. Heroku Recovery

**Symptom:** app down, dynos crashed.

```bash
# 1. Restart all dynos
curl -s -n -X DELETE https://api.heroku.com/apps/kudbee-fuel-gage/dynos \
  -H "Authorization: Bearer ${HEROKU_API_KEY}" \
  -H "Accept: application/vnd.heroku+json; version=3"

# 2. Check logs
heroku logs --app kudbee-fuel-gage --num 100

# 3. Scale back up if needed (verify before acting — cost impact)
heroku ps:scale web=1:Standard-1X hermes-worker=1:Standard-1X --app kudbee-fuel-gage

# 4. Release rollback if crash persists (see §1)
```

## 7. Worker Queue Recovery

**Symptom:** governance tasks stuck; DLQ filling.

```bash
# 1. Check queue depth + DLQ
#    BRPOP 5s timeout, MAX_ATTEMPTS=3, DLQ = kudbee-governance-tasks-failed

# 2. Inspect DLQ (read-only)
node scripts/agents.mjs decode <agent-id>

# 3. Retry DLQ items (after fixing root cause) — governed, requires review

# 4. If worker crashed: restart dyno (see §6), idempotent gates prevent double-processing
```

## 8. Incident Logging

Every recovery must end with evidence:
```bash
node scripts/learning-cycle.mjs mission <id> "Post-incident: <root cause> → <resolution>"
node scripts/dthink-pipeline.mjs feed "system:incident" "<summary>"
```

## Severity Escalation

| Severity | Definition | Action |
|:---|:---|:---|
| SEV-1 | prod down / data loss | freeze + immediate rollback, human on-call |
| SEV-2 | degraded / partial outage | rollback, monitor, human review |
| SEV-3 | non-prod issue | fix in staging, no freeze |
