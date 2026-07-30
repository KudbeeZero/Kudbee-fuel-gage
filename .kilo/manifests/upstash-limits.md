# Upstash Free Tier Limits + Monitoring Gates
## Generated 2026-07-30 · Updated hourly

### Redis (KV) — creative-finch (staging)
- Type: Serverless Redis
- Limit: 500,000 commands/month
- Current: 9,272 commands (1.9%)
- Connections: 4,281
- WARN threshold: 250,000 (50%)
- BLOCK threshold: 450,000 (90%)
- Action on BLOCK: Disable Redis, set KUDBEE_REDIS_DISABLED=true

### Redis (KV) — whole-tapir (production)
- Status: LIMIT EXCEEDED (500K/500K)
- Action: Preserved for production only. Do not touch until monthly reset.

### Vector/Search — obliging-shad
- Type: Hybrid (Dense + Sparse), 1536-dim
- Limit: 100,000 vectors (free tier)
- Current: 0 vectors
- WARN threshold: 50,000 (50%)
- BLOCK threshold: 90,000 (90%)

### QStash — qstash-us-east-1
- Type: Message Queue + Workflow
- Limit: 500 messages/day (free tier)
- Current: Unknown (token auth issue — check console)

### Box — box_1015de...
- Type: Secure AI agent container
- Limit: Unknown (check console)

### CI Policy
- CI test runs: NO Redis, NO QStash, Neon DB branch only
- app.json: Redis addon removed, env vars emptied
- Review apps: DISABLED

### Auto-Protection
- If any product hits 90%: auto-disable, log to DTHINK, notify
- Monthly reset: first day of each month
- Daily check: 00:00 UTC via CI or cron
