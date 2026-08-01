# Heroku Pipeline Setup — CI/CD Workflow

## Problem
When testing new Heroku server deployments, the CI/CD pipeline must be properly configured with:
1. GitHub Actions workflows enabled
2. Redis configured (Upstash for production, redis:7-alpine for CI)
3. Heroku app linked via git remote
4. Environment variables set

## Solution

### 1. Enable GitHub Actions Workflows
Workflows in `.github/workflows/` may be disabled (`.disabled` extension). Enable them:
```bash
for f in .github/workflows/*.disabled; do mv "$f" "${f%.disabled}"; done
```

### 2. Heroku Git Remote
```bash
heroku git:remote -a kudbee-fuel-gage
```
Verify with `git remote -v` — should show heroku remote.

### 3. Redis Configuration
**Production (Upstash):**
```bash
# Create Redis database
curl -X POST -H "Idempotency-Key: $(uuidgen)" https://upstash.com/start-redis

# Set env vars from the hosting secret manager; never place values in commands,
# source control, logs, memory, DTHINK, or THINK.
heroku config:set REDIS_URL="$REDIS_URL"
heroku config:set UPSTASH_REDIS_REST_URL="$UPSTASH_REDIS_REST_URL"
heroku config:set UPSTASH_REDIS_REST_TOKEN="$UPSTASH_REDIS_REST_TOKEN"
```

**CI (GitHub Actions):** Uses `redis:7-alpine` service container on port 6379.
```yaml
services:
  redis:
    image: redis:7-alpine
    ports: [6379:6379]
env:
  REDIS_URL: 'redis://localhost:6379'
```

### 4. Deploy Pipeline
**Automatic (on push to main):**
- `.github/workflows/deploy.yml` triggers
- Runs `npm ci` → `npm run build` → Heroku deploy
- Post-deploy health check on `/health`

**Manual:**
```bash
git push heroku main
# or
heroku deploy --app kudbee-fuel-gage
```

### 5. Verify Pipeline
```bash
# Check workflow status
gh run list --workflow=deploy.yml

# Check Heroku logs
heroku logs --tail --app kudbee-fuel-gage

# Check dyno status
heroku ps --app kudbee-fuel-gage
```

## Common Issues

### Redis Connection Refused (ECONNREFUSED 127.0.0.1:6379)
- **Cause:** `REDIS_URL` not set or pointing to localhost
- **Fix:** Set `REDIS_URL` env var to Upstash URL or start local Redis

### Heroku CLI Not Found
- **Cause:** Heroku CLI not installed in container
- **Fix:** Use GitHub Actions for deploys, or install Heroku CLI:
  ```bash
  curl https://cli-assets.heroku.com/install.sh | sh
  ```

### authenticateAgentPass is not defined
- **Cause:** Function not exported from `bearerAuthMiddleware.ts`
- **Fix:** Export `authenticateAgentPass()` and import in `server.js`:
  ```ts
  // bearerAuthMiddleware.ts
  export function authenticateAgentPass(headerValue: string): string | null { ... }
  
  // server.js
  import { authenticateAgentPass } from '../lib/bearerAuthMiddleware.ts';
  ```

## Pipeline Status
- **deploy.yml:** Push to main → Heroku deploy
- **verify.yml:** Push/PR → typecheck + lint + build + e2e (38 checks)
- **session-log.yml:** Session archival

## Key Files
- `.github/workflows/deploy.yml` — Heroku deployment
- `.github/workflows/verify.yml` — CI verification
- `Procfile` — Heroku process definitions
- `app.json` — Heroku app configuration
- `services/lib/bearerAuthMiddleware.ts` — Auth middleware
- `services/ingestion/server.js` — Main server entrypoint
