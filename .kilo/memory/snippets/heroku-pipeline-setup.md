# Heroku Pipeline Setup — 3-Environment CI/CD Workflow

## Architecture

Three-environment Heroku pipeline with EDISBOX verification at every stage:

| Environment | App | Branch | Deploy Script | EDISBOX |
|:---|:---|:---|:---|:---|
| **Development** | `kudbee-fuel-gage-dev` | `session/agent_*` | `scripts/deploy-dev.sh` | ✓ verify |
| **Staging** | `kudbee-fuel-gage-staging` | `staging/security-durability` | `scripts/deploy-staging.sh` | ✓ verify |
| **Production** | `kudbee-fuel-gage` | `main` | `scripts/deploy-prod.sh` | ✓ verify |

## CI Bounds (Enforced in All Environments)

| Bound | CI/Dev | Staging | Production |
|:---|:---|:---|:---|
| `CI_MUTATION_BUDGET` | 20 | 20 | 20 |
| `MAX_REQUEST_BODY` | 256kb | 512kb | 512kb |
| `DB_POOL_MAX` | 5 | 10 | 10 |
| `MONTHLY_DB_OPERATION_BUDGET` | 500000 | 2000000 | 5000000 |

## Deploy Scripts

### Development Deploy
```bash
./scripts/deploy-dev.sh [branch]
```
- Pushes session branch to `kudbee-fuel-gage-dev`
- Runs quick CI gates (`verify-gates.mjs --quick`)
- Logs deploy trigger and feeds DTHINK

### Staging Deploy
```bash
./scripts/deploy-staging.sh [branch]
```
- Pushes branch to `kudbee-fuel-gage-staging`
- Health check + Redis verification
- Feeds deploy event to DTHINK pipeline

### Production Deploy
```bash
./scripts/deploy-prod.sh [branch]
```
- **Requires staging health check** before proceeding
- Runs full CI gates
- Pushes to `kudbee-fuel-gage` production app
- Feeds deploy event to DTHINK pipeline

## EDISBOX Integration (Upstash Box)

### Scripts
- `scripts/edisbox-deploy.mjs` — isolated HTTP health check inside Upstash Box container
- `scripts/edisbox-pipeline.mjs` — full pipeline verification (API key check, box-web-verify, package check, DTHINK feed)
- `scripts/box-web-verify.mjs` — staging HTTP verification via Upstash Box

### How It Works
1. Creates an isolated Upstash Box container
2. Runs HTTP health check against staging URL
3. Verifies response status and root element
4. Records result in DTHINK pipeline
5. Cleans up Box container

### Environment
- `UPSTASH_BOX_API_KEY` — required for EDISBOX verification (set in Heroku config)
- `STAGING_URL` — target URL for HTTP verification (default: `https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com`)

## Configuration Files

- `heroku-pipelines.json` — pipeline configuration (dev/staging/prod environments, EDISBOX verification flags)
- `app.json` — Heroku app configuration (environments, formation, review apps, CI bounds)
- `config/pr/stack.json` — PR stack configuration (PR #233, EDISBOX verification rule)
- `Procfile` — Heroku process definitions (web, monitor-worker, hermes-worker, sentinel, release phase)

## PR Stack Workflow

Current stack: PR #233 (`staging/security-durability` → `main`)
- Single layer (session branch was squashed into main)
- EDISBOX verification rule enabled
- Bottom-up merge enforced
- Production deploy from trunk only

## Key Files
- `scripts/deploy-dev.sh` — development deploy
- `scripts/deploy-staging.sh` — staging deploy
- `scripts/deploy-prod.sh` — production deploy
- `scripts/edisbox-deploy.mjs` — EDISBOX deploy verification
- `scripts/edisbox-pipeline.mjs` — EDISBOX pipeline verification
- `scripts/box-web-verify.mjs` — Upstash Box HTTP verification
- `scripts/deploy-log.mjs` — deploy logging with DTHINK integration
- `scripts/verify-gates.mjs` — pre-flight CI gate runner
- `scripts/verify-stack.mjs` — PR stack verification
- `heroku-pipelines.json` — pipeline configuration
- `app.json` — Heroku app configuration
- `config/pr/stack.json` — PR stack configuration
- `Procfile` — Heroku process definitions
