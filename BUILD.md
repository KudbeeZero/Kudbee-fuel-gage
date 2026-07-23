# Kudbee — Build & Verification Guide

Full documentation: [`/docs/README.md`](docs/README.md)

## One-Command Verification

```bash
npm ci && npm run typecheck && node scripts/verify-e2e.mjs && cd apps/web && npm run build
```

## New Architecture Features

### Telemetry Pipeline
- **Batch ingest**: `POST /api/telemetry/ingest/batch` accepts up to 100 events
- **UPSERT**: `telemetry_traces` uses `ON CONFLICT (trace_id) DO UPDATE`
- **Sampling**: Set `SAMPLE_RATE=5` for ~20% event storage
- **Dedup**: 5s in-memory window for duplicate trace_ids

### OS Stream (SSE)
- **Endpoint**: `GET /api/os-stream` — single SSE replacing per-panel polling
- **Event**: `os:snapshot` every 5s with db, redis, governance, think, memory, alerts
- **Frontend**: `OsStreamProvider` + `useOsSnapshot()` React context

### Rate Limiting
- **General API**: 100 req/min with `Retry-After: 60` header
- **Ingest**: 25 req/min with explicit `X-Forwarded-For` keyGenerator
- **Trust proxy**: 1 hop (`app.set('trust proxy', 1)`)

### Frontend Resilience
- **apiClient**: 15s timeout, jittered exponential backoff on 429/503, X-RateLimit-Reset header support
- **Telemetry Batcher**: `telemetryBatcher.ts` queues events for 1000ms, flushes to batch endpoint
- **OsStreamProvider**: Wraps `<App />` in main.tsx — OS stream initializes on app load
- **Studio AgentTerminal**: Collapsible live console with !recall, !remember, status commands

### Backend Agents (new)
- **shutdown.js**: `registerShutdown(redis)` with 30s force-exit timeout, structured JSON logging
- **tokenBucket.ts**: Redis-backed rate limiter — Groq (30/5rps), Gemini (100/10rps), Neon (100/20rps)
- **agentLogger.ts**: Structured JSON logging + `broadcastAgentState()` → SSE stream
- **jobQueue.ts**: `enqueueJob()`, `dequeueJob()`, `retryJob()` with jittered exponential backoff, dead-letter queue
- **geminiBreaker**: Circuit breaker on `services/lib/circuitBreaker.ts` — trips after 5 failures, 30s reset
- **Procfile**: All workers use `--max-old-space-size` (256MB workers, 512MB web), fixed duplicate worker entries

### Connection Pool (Neon Postgres)
- `max: 20`, `idleTimeoutMillis: 10_000`, `connectionTimeoutMillis: 5_000`
- `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000`
- `withTimeout()` wrapper on all raw pool.query calls
- Unified `teardownAll(redisClient)` for graceful shutdown

### Redis
- `connectTimeout: 5_000`, `commandTimeout: 3_000`, `keepAlive: 15_000`

## Tab Architecture

The Control Tower sidebar uses a dedicated-tab-per-domain architecture. 14 tabs separate concerns:

| # | Tab | Component File | Domain |
|:--|:---|:---|:---|
| 0 | STUDIO | `layouts/StudioRouter.tsx` | Hardware lab: nested /tower/* routes with 4 domain panels |
| 1 | TELEMETRY | `pages/telemetry.tsx` | Live metrics, model matrix, circuit breaker chart |
| 2 | THINK | `pages/think.tsx` | ThinkStorm, Stream, Storage, Trajectories plugins |
| 3 | GOVERNANCE | `pages/governance.tsx` | HITL governance gate + policy engine |
| 4 | HERMES | `pages/hermes.tsx` | Live audit sweep, probe, log filter |
| 5 | SENTINEL | `pages/sentinel.tsx` | Edge egress monitor, blast radius gauge |
| 6 | PLAYGROUND | `<PlaygroundView />` | Agent testing sandbox |
| 7 | FIREWALL | `pages/firewall.tsx` | Firewall rules |
| 8 | GATEWAY | `<GatewayView />` | API gateway config |
| 9 | INTERCEPTOR | `<InterceptorView />` | Payload interception |
| 10 | HISTORY | `pages/history.tsx` | Telemetry log history |
| 11 | ALERTS | `<AlertsPanel />` | Alert notifications |
| 12 | INTELLIGENCE | `<IntelligenceView />` | AI insights |
| 13 | SETTINGS | `components/SettingsView.tsx` | System settings, theme |

## Codebase Simplification (July 2026)

App.tsx reduced from **4,271 → 1,059 lines (75% reduction)**:

| What | Removed |
|:---|:---|
| Dead component files | 16 removed |
| Dead hook files | 9 removed |
| HistoryView inline component | 1,580 lines |
| FirewallView inline component | 495 lines |
| CostLedgerCard widget | All-zeros placeholder |
| eventLogs static state | Hardcoded fake data |
| footerPing duplicate state | Mirrored from OS stream |
| ConsoleDock synthetic logs | 120ms fake log generator |
| Duplicate hook pairs | useHistoryStream → useTelemetryStream, usePollingQueue extracted |

### Plugin → Tab Mapping

| Rack Plugin | Tab | Page File |
|:---|:---|:---|
| EdgeSentinelPlugin | SENTINEL | pages/sentinel.tsx |
| ThinkStormPlugin | THINK | pages/think.tsx |
| ThinkStreamPlugin | THINK | pages/think.tsx |
| ThinkStoragePlugin | THINK | pages/think.tsx |
| ThinkTrajectoriesPlugin | THINK | pages/think.tsx |
| GovernanceGatePlugin | GOVERNANCE | pages/governance.tsx |
| HermesAuditorPlugin | HERMES | pages/hermes.tsx |

### Studio Layout (Hardware Lab)

Nested routing at `/tower/*` with 4 domain-specific panels:

| Panel | File | Hooks | Route |
|:---|:---|:---|:---|
| GovernancePanel | `components/studio/GovernancePanel.tsx` | useGovernanceStream, useEventStream | /tower/governance |
| ThinkTokensPanel | `components/studio/ThinkTokensPanel.tsx` | useGovernanceStream, useCommandDispatcher | /tower/tokens |
| TelemetryPanel | `components/studio/TelemetryPanel.tsx` | useDegradationStatus, useEventStream | /tower/telemetry |
| FirewallPanel | `components/studio/FirewallPanel.tsx` | useEventStream, useCommandDispatcher | /tower/firewall |

All panels use `React.lazy()` with `Suspense` + `Loader2` spinner fallback. Tab switching triggers `useEffect` cleanup — all `setInterval` and SSE subscriptions destroyed on unmount.

Recovered **AgentTerminal** (225 lines) from deleted DashboardPage — mounted as collapsible bottom console in StudioLayout with commands: `help`, `status`, `governance`, `hermes`, `!recall`, `!remember <data>`.

## Latest Fixes (July 2026)
- **OsStreamProvider** now wraps `<App />` in `main.tsx` — OS stream `/api/os-stream` initializes on app load
- **Unused lucide-icons** removed from StudioLayout (11 icons → 7)
- **All imports verified** — zero broken references across the codebase
- **DashboardPage.tsx** fully replaced by 4 studio panels + deleted (2,959 lines removed)
- **CI hardening**: Redundant `ci.yml` removed (superseded by `verify.yml`); `session-log.yml` YAML indent fixed
- **Rate limiter**: Atomic Lua script replaces pipeline TOCTOU leak; per-endpoint 60/min cap added
- **Import style**: `server.js` node imports normalized to `node:` prefix (matching 11 other files)
- **SPA routing**: `_redirects` file added for `/tower/*` client-side route fallback
