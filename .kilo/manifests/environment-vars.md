# Environment Variable Manifest (EPE-1)
## Generated 2026-07-30T05:58Z | Pipeline: kudbee-fuel-gage-pipeline

### Variable Inventory

| Variable | Classification | Staging | Production | CI | Required |
|:---|:---|:---|:---|:---|:---|
| NODE_ENV | PUBLIC | staging | production | test | ✓ |
| KUDBEE_ENV | PUBLIC | staging | production | test | ✓ |
| HEROKU_APP_NAME | PUBLIC | Kudbee_think | ? | ci-runner | ⚠ |
| API_KEY | SECRET | ✓ | ✓ | ? | ✓ |
| DATABASE_URL | SECRET | ✓ | ✓ | test-db | ✓ |
| DATABASE_URL_AGENT_v2 | SECRET | ✓ | ✓ | — | — |
| DEEPSEEK_API | SECRET | ✓ | ✓ | — | — |
| GROK_API | SECRET | ✓ | ✓ | — | — |
| GROQ_API_KEY | SECRET | ✓ | ✓ | — | — |
| GROQ_BASE_URL | SECRET | ✓ | ✓ | — | — |
| INCEPTION_API | SECRET | ✓ | ✓ | — | — |
| INCEPTION_URL | SECRET | ✓ | ✓ | — | — |
| REDIS_URL | SECRET | ✓ | ✓ | test-redis | ✓ |
| REDIS_WORKER_URL | SECRET | ✓ | ✓ | — | — |
| STREAM_SECRET | SECRET | ✓ | ✓ | — | — |
| UPSTASH_REDIS_REST_TOKEN | SECRET | ✓ | ✓ | test-token | ✓ |
| UPSTASH_REDIS_REST_TOKEN_2 | SECRET | ✓ | ✓ | — | — |
| UPSTASH_REDIS_REST_TOKEN_SLOW | SECRET | ✓ | ✓ | — | — |
| UPSTASH_REDIS_REST_URL | SECRET | ✓ | ✓ | test-url | ✓ |
| UPSTASH_REDIS_REST_URL_2 | SECRET | ✓ | ✓ | — | — |

### Classification Legend
- **PUBLIC** — safe to log, no rotation needed
- **SECRET** — never in logs, never in DTHINK, rotation policy applies
- **CI_ONLY** — only set in CI test apps
- **STAGING** — only set in staging
- **PRODUCTION** — only set in production
- **SHARED** — used across multiple environments

### Provisioning Rules (Configuration Broker)
1. SECRET variables require explicit allowlist per environment.
2. CI test apps get: DATABASE_URL (test DB), REDIS_URL (test Redis), UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL, NODE_ENV=test, KUDBEE_ENV=test, HEROKU_APP_NAME.
3. CI apps MUST NOT receive: production DB URLs, production Redis URLs, API keys for LLM providers, stream secrets.
4. Staging mirrors production secrets by design (pre-production testing).
5. Never rotate production credentials from staging provisioning.
6. HEROKU_APP_NAME should be the actual app name per environment.

### Known Issues
- Staging HEROKU_APP_NAME is "Kudbee_think" — should be "kudbee-fuel-gage-staging"
- Production is missing KUDBEE_ENV — should be "production"
