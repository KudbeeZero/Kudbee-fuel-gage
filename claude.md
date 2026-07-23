# Claude — Kudbee Architecture Context (July 2026)

Complete fix encyclopedia: `STATE_OF_THE_OS.md` — 20 documented production fixes with root cause analysis.

## Architecture

### Tab Architecture (14 tabs)
STUDIO → TELEMETRY → THINK → GOVERNANCE → HERMES → SENTINEL → PLAYGROUND → TERMINAL → FIREWALL → GATEWAY → INTERCEPTOR → HISTORY → ALERTS → INTELLIGENCE → SETTINGS

### Studio Layout (Hardware Lab)
Nested routing at `/tower/*` with 4 domain panels: GovernancePanel, ThinkTokensPanel, TelemetryPanel, FirewallPanel. All use React.lazy() + Suspense + mountedRef cleanup on unmount.

### Database (Neon Postgres)
- Pool: max:20, idleTimeout:10s, connectionTimeout:5s, keepAlive:10s
- UPSERT on telemetry_traces (ON CONFLICT trace_id)
- SAMPLE_RATE env var for statistical sampling
- 5s dedup window for duplicate trace_ids
- Query timeouts: 10s normal, 25s vector search, 30s vector insert
- Vector writes skipped for ≤10-token events

### Redis
- connectTimeout:5s, commandTimeout:3s, keepAlive:15s
- Key namespace: kudbee:events, kudbee:think:tokens, kudbee:telemetry_feed
- SSE subscriber with jittered reconnection

### Backend Agents
- shutdown.js: Unified graceful shutdown (30s force-exit)
- tokenBucket.ts: Rate limiters for Groq(30/5rps), Gemini(100/10rps), Neon(100/20rps)
- agentLogger.ts: Structured JSON logging + SSE broadcast
- jobQueue.ts: Redis-backed queue with retry + dead-letter
- geminiBreaker: Circuit breaker (5 failures → open, 30s reset)

### Frontend Resilience
- apiClient: AbortController timeouts (15s/30s), jittered backoff on 429/503
- OS Stream: Single SSE replacing 8+ polling endpoints
- Telemetry Batcher: 1000ms batching window
- All pages wrapped in PanelErrorBoundary
- All setTimeout callbacks guarded with _mountedRef

### Rate Limiting
- General API: 100 req/min, Retry-After:60 header
- Ingest: 25 req/min, X-Forwarded-For keyGenerator
- Trust proxy: 1 hop

### Key Env Vars
SAMPLE_RATE, DATABASE_URL, REDIS_URL, GROQ_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN, PORT, NODE_ENV

### Critical Fixes Applied (See STATE_OF_THE_OS.md for all 20)
- Procfile sentinel crash (node → tsx)
- Governance approval race condition (idempotency)
- Hardcoded API keys removed from source
- All silent catch blocks now log errors
- TypeScript ^7.0.0 → ^5.7.0
- CI Node 22 standardization
- Turbo typecheck task added
- StatusBadge PROVEN color
- OS stream exponential backoff
- Empty states for telemetry/think
