# Pre-Merge Validation Checklist

Use this checklist before merging any PR to ensure deployment integrity.

## Environment Variables
- [ ] `REDIS_URL` is set in GitHub Actions secrets (preferred single URL)
- [ ] OR split credentials are set: `REDIS_HOST`, `REDIS_PORT`, `REDIS_TOKEN`/`REDIS_PASSWORD`
- [ ] `REDIS_DB` is set if not using default (0)
- [ ] `REDIS_TLS` is set to `true` if using SSL/TLS connection
- [ ] All secrets are mapped in `.github/workflows/ci.yml` and `.github/workflows/session-log.yml`

## Database Initialization
- [ ] SQLite database file (`telemetry_traces.db`) is writable in the deployment environment
- [ ] `vector_memory` table schema is applied (run `services/memory/src/schema.sql`)
- [ ] Database migrations are idempotent (safe to run multiple times)

## CI/CD Pipeline
- [ ] `npx turbo run lint` passes for all workspaces (`apps/*`, `services/*`, `packages/*`)
- [ ] `npx turbo run build` completes without errors
- [ ] `node scripts/diagnose-redis.mjs` reports SUCCESS
- [ ] No merge conflicts with `main` branch

## Code Quality
- [ ] All new files have appropriate `.gitignore` entries (no secrets committed)
- [ ] No `console.log` statements left in production code (except error logging)
- [ ] All `any` types are eliminated or justified
- [ ] Error handling covers all async operations

## Deployment Config
- [ ] `Procfile` includes both `web` and `worker` processes
- [ ] Heroku environment variables are configured
- [ ] Redis add-on is provisioned and accessible

## Post-Merge Verification
- [ ] Heroku deployment completes successfully
- [ ] `/health` endpoint returns `status: "ok"`
- [ ] `/api/health-check` returns JSON with `uptime_sec`, `community_value_score`, and `alerts`
- [ ] `/api/session-history` returns session data
- [ ] Dashboard loads without console errors
- [ ] Agent Shell is processing telemetry (check `kudbee:governance_actions` in Redis)
