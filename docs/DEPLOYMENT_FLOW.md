# DEPLOYMENT_FLOW.md

## Observed Flow

```
Push to main
    ↓
Kudbee Bounded CI + CodeQL
    ↓
GitHub Deployment record
    ↓
Heroku auto-deploy (staging + production concurrently)
    ↓
Production: https://kudbee-fuel-gage-330ade653a62.herokuapp.com/
Staging: https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/
```

## Key Findings

- **Production deploys directly from main push.** No staging promotion.
- **Staging and production deploy same SHA concurrently** (observed 2026-08-02).
- **No artifact promotion.** Both rebuild independently.
- **No human approval gate** for production.
- **Direct pushes to main** bypass PR review (observed: `4b91da1` pushed directly).
- Deployment is driven by Heroku GitHub integration, not repository scripts.

## Gaps

- No staging verification before production.
- No rollback automation.
- No release tags or changelog.
- No deployment lock or concurrency control.
