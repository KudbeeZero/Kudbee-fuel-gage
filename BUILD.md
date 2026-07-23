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
- **apiClient**: 15s timeout, jittered exponential backoff on 429/503
- **Telemetry Batcher**: `telemetryBatcher.ts` queues events for 1000ms
- **Token Bucket**: `useRateThrottle(maxReqPerMin)` client-side throttling
- **Adaptive Polling**: `useAdaptivePolling(callback, baseMs, healthLevel)`
- **Visibility Polling**: `useVisibilityPolling(callback, ms)` auto-pauses hidden tabs

### Connection Pool (Neon Postgres)
- `max: 20`, `idleTimeoutMillis: 10_000`, `connectionTimeoutMillis: 5_000`
- `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000`
- `withTimeout()` wrapper on all raw pool.query calls
- Unified `teardownAll(redisClient)` for graceful shutdown

### Redis
- `connectTimeout: 5_000`, `commandTimeout: 3_000`, `keepAlive: 15_000`
