# Claude — Kudbee Architecture Context

## Current Architecture State (July 2026)

### Critical Paths
- **Ingestion**: `POST /api/telemetry/ingest` (single) + `POST /api/telemetry/ingest/batch` (batch)
- **OS Stream**: `GET /api/os-stream` — unified SSE replacing 8+ polling endpoints
- **SSE Events**: `GET /api/events`, `GET /api/telemetry/stream`
- **Rate Limiting**: 100 req/min general, 25 req/min ingest, with explicit `X-Forwarded-For` keyGenerator

### Database Architecture
- **Neon Postgres** via `pg.Pool` with max 20 connections, 5s connection timeout, 10s idle timeout
- **UPSERT** on `telemetry_traces` by `trace_id` (ON CONFLICT DO UPDATE)
- **Prime-Lens Sampling**: `SAMPLE_RATE` env var (1=all, 5=20%, 10=10%)
- **Dedup Window**: 5s in-memory LRU for duplicate trace_ids
- **Vector writes**: Skipped for events with ≤10 total tokens + status=OK
- **Query timeouts**: 10s normal, 25s vector queries, 30s vector inserts

### Redis Architecture
- **ioredis** with 5s connect timeout, 3s command timeout, 15s TCP keepalive
- **Key namespace**: `kudbee:events`, `kudbee:events:v2`, `kudbee:think:tokens`, `kudbee:telemetry_feed`
- **SSE subscribers**: Dedicated ioredis subscriber client with retry/backoff

### Frontend Architecture
- **apiClient**: AbortController timeouts (15s GET, 30s POST), exponential backoff with jitter on 429/503
- **Telemetry Batcher**: 1000ms batching window, 50 max batch, queue-based fire-and-forget
- **OS Stream Provider**: React Context providing single SSE snapshot to all components
- **Token Bucket Throttler**: Client-side rate limiting via `useRateThrottle`
- **Adaptive Polling**: Health-based interval scaling (1x/2x/4x)
- **Visibility Polling**: Auto-pause when tab hidden

### Key Env Variables
- `SAMPLE_RATE` — telemetry sampling (1=all, 5=20%)
- `DATABASE_URL` — Neon PG connection
- `REDIS_URL` — Redis connection
- `GROQ_API_KEY` — Groq LPU inference
- `GEMINI_API_KEY` — Gemini embedding + triage

### Documentation
- Full docs: `/docs/README.md` (master TOC)
- Architecture: `/docs/architecture/01-06`
- API reference: `/docs/reference/API_REFERENCE.md`
- Schema reference: `/docs/reference/SCHEMA_REFERENCE.md`
