# Review App Configuration — Heroku Pipeline Pattern

## Problem
Heroku review apps auto-created from PRs do NOT inherit config vars from parent pipeline environments. The app deploys but shows "Connecting...", "Offline", and Redis/Postgres unhealthy because DATABASE_URL and REDIS_URL are missing.

## Solution Pipeline

### Step 1: Fix CORS (server.js)
Review apps serve the frontend and API from the same origin, but the browser still sends OPTIONS preflight requests for certain API calls. Without CORS middleware, all API calls are blocked.

```javascript
// Add as first middleware in server.js
const corsAllowOrigin = (process.env.CORS_ALLOW_ORIGINS || '*').split(',')[0].trim();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsAllowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Pass, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
```

### Step 2: Copy Config Vars from Staging
Review apps only auto-receive: HEROKU_APP_NAME, HEROKU_BRANCH, HEROKU_PR_NUMBER, NODE_ENV. Everything else must be manually set.

```bash
# Get staging config vars
curl -s -n https://api.heroku.com/apps/kudbee-fuel-gage-staging/config-vars \
  -H "Authorization: Bearer ${HEROKU_API_KEY}" \
  -H "Accept: application/vnd.heroku+json; version=3"

# Set critical vars on review app
curl -s -n -X PATCH https://api.heroku.com/apps/kudbee-think-or-pr-233/config-vars \
  -H "Authorization: Bearer ${HEROKU_API_KEY}" \
  -H "Accept: application/vnd.heroku+json; version=3" \
  -H "Content-Type: application/json" \
  -d '{"DATABASE_URL":"...","REDIS_URL":"...","STREAM_SECRET":"...","GROQ_API_KEY":"..."}'
```

### Step 3: Restart Dynos
```bash
curl -s -n -X DELETE https://api.heroku.com/apps/kudbee-think-or-pr-233/dynos \
  -H "Authorization: Bearer ${HEROKU_API_KEY}" \
  -H "Accept: application/vnd.heroku+json; version=3"
```

### Step 4: Verify Health
```bash
curl -sf https://kudbee-think-or-pr-233.herokuapp.com/health
# Expected: {"status":"ok","dependencies":{"ingestion_db":"healthy","redis":"healthy",...}}
```

## Key Files
- `scripts/deploy-dev.sh` — development deploy script
- `scripts/deploy-staging.sh` — staging deploy script
- `scripts/deploy-prod.sh` — production deploy script
- `scripts/edisbox-deploy.mjs` — EDISBOX deploy verification via Upstash Box
- `scripts/edisbox-pipeline.mjs` — EDISBOX full pipeline verification
- `scripts/box-web-verify.mjs` — Upstash Box HTTP verification
- `services/ingestion/server.js` — Express server with CORS middleware
- `heroku-pipelines.json` — pipeline environment configuration
- `app.json` — Heroku app configuration with review apps

## Heroku CI Failure Patterns

| Symptom | Cause | Fix |
|:---|:---|:---|
| `node --check` fails on 1 script | Top-level `await` in .mjs | Replace `const x = await import()` with static `import` |
| 96 unused lucide-react imports | Dead icon imports not caught | Remove unused icons, improve regex scan |
| app.json parse error line 31 | Bare string env values | Convert to `{ "value": "..." }` format |
| "Cannot run more than 2 Eco size dynos" | Review app tries 4 dynos | Set worker dynos to `quantity: 0` in reviewApps |
| "Connecting..."/"Offline" on frontend | Missing CORS middleware | Add global CORS handler as first middleware |
| Redis/Postgres OFFLINE after deploy | Missing config vars | Copy DATABASE_URL, REDIS_URL from staging |

## Review App URL Pattern
```
https://kudbee-think-or-pr-{PR_NUMBER}.herokuapp.com
```
