# ci-watcher — Execution Traces
Exported: 2026-08-01T06:59:33Z
Actions: 3
Decisions: 3

## Recent Decisions

- **[2026-08-01T06:45]** fix-cors-middleware — Added global CORS handler as first middleware in server.js. Fixed browser blocking all API calls on review app. Committed as 3959df1.
- **[2026-08-01T06:30]** configure-review-app — Set DATABASE_URL, REDIS_URL, REDIS_WORKER_URL, STREAM_SECRET, GROQ_API_KEY on kudbee-think-or-pr-233 via Heroku API. Restarted dynos. Health now GREEN.
- **[2026-08-01T06:00]** fix-heroku-ci-150 — Diagnosed and fixed Heroku CI test #150 failure: top-level await in generate-countermeasures.mjs rejected by node --check. Replaced 'const crypto = await import()' with static import.

## CI Failure Pattern Catalog

### Test #150: Syntax Check Failures
- **Symptom**: Heroku CI fails on `node --check scripts/*.mjs`
- **Common cause**: Top-level await in .mjs files
- **Fix**: Replace `await import()` with static `import` at top of file
- **Verification**: `for f in scripts/*.mjs; do node --check "$f"; done`

### Test #150: Unused Import Failures
- **Symptom**: 96 `✗ unused-import` failures from verify-gates.mjs
- **Common cause**: Dead lucide-react imports not caught during development
- **Fix**: Remove unused icons, improve regex scan to check 16 usage patterns
- **Prevention**: CI gate blocks deploy if any unused lucide-react imports found

### Test #150: app.json Parse Error
- **Symptom**: "Failed to parse app.json at environments.test.env line 31"
- **Common cause**: Bare string env values in environment blocks
- **Fix**: Convert to `{ "value": "string" }` format
- **Verification**: `node -e "JSON.parse(require('fs').readFileSync('./app.json'))"`

### Review App: Dyno Limit Error
- **Symptom**: "Cannot run more than 2 Eco size dynos"
- **Common cause**: Review app tries to start 4 eco dynos
- **Fix**: Set worker dynos to quantity:0 in reviewApps.formation

### Review App: Connection Issues
- **Symptom**: Frontend shows "Connecting..." / "Offline" for all agents
- **Common cause**: Missing CORS headers or missing DATABASE_URL/REDIS_URL
- **Fix**: Add global CORS middleware + set config vars via Heroku API
