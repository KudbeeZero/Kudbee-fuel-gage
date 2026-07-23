# Kudbee — State of the OS (July 2026)

> Auto-generated from the current monorepo state after the Stack Stability & 429 Mitigation sprint.

## 1. Plugin Registry (CORE_RACK_PLUGINS)

| ID | Component | Category | ColSpan | Status |
|:---|:---|:---|:---|:---|
| `plugin-storm` | ThinkStormPlugin | storm | 4 | proven |
| `plugin-stream` | ThinkStreamPlugin | stream | 4 | proven |
| `plugin-storage` | ThinkStoragePlugin | storage | 4 | proven |
| `plugin-trajectories` | ThinkTrajectoriesPlugin | trajectories | 6 | proven |
| `plugin-gov-gate` | GovernanceGatePlugin | governance | 6 | pending |
| `plugin-hermes-auditor` | HermesAuditorPlugin | auditor | 6 | proven |

Always-mounted: `EdgeSentinelPlugin` (col-span-12, after all rack plugins)

## 2. OS Event Bus

| Channel | Transport | Consumers |
|:---|:---|:---|
| `kudbee:events:v2` | Redis pub/sub | SSE clients, unified events bus |
| `kudbee:think:tokens` | Redis pub/sub | Think token telemetry |
| `kudbee:telemetry_feed` | Redis list (LPUSH/LTRIM) | History view |
| `GET /api/events` | SSE | Dashboard, RackLayout, live tasks |
| `GET /api/telemetry/stream` | SSE | History page |
| `GET /api/os-stream` | SSE (unified) | Header status, footer ping, all panels |

## 3. Web Worker Architecture

**None currently.** No Web Workers are registered in the codebase. The PCA reducer (`services/memory/pcaReducer.ts`) runs in the main thread. Vector math (`cosineSimilarity`, `embedTextLocal`) runs synchronously. Future: offload PCA and embedding math to a dedicated worker for better UI responsiveness.

## 4. Database Rate Limits

### Ingress (API-level)
| Limit | Value | Scope |
|:---|:---|:---|
| General API (`/api/*`) | 100 req/min | Per real client IP (X-Forwarded-For) |
| Ingest (`/api/telemetry/ingest`) | 25 req/min | Per real client IP |
| Request timeout | 15,000ms | All endpoints |

### Pipeline (DB-level)
| Feature | Value |
|:---|:---|
| `telemetry_traces` write mode | UPSERT (`ON CONFLICT (trace_id) DO UPDATE`) |
| Statistical sampling | `SAMPLE_RATE` env (1=all, 5=20%) |
| In-memory dedup window | 5,000ms |
| Vector writes | Skipped for ≤10 total tokens + status=OK |
| Batch ingest max | 100 events per batch request |
| DB query timeout (normal) | 10,000ms |
| DB query timeout (vector) | 25,000ms |
| DB insert timeout (vector) | 30,000ms |

### Connection Pool (Neon Postgres)
| Setting | Value |
|:---|:---|
| Max connections | 20 |
| Idle timeout | 10,000ms |
| Connection timeout | 5,000ms |
| TCP keepalive | Yes, 10s initial delay |

## 5. Frontend Polling Reduction

**Before**: 45+ active `setInterval` instances, ~25 distinct API endpoints polled independently.

**After OS Stream**: Single `GET /api/os-stream` SSE connection pushes unified state snapshot every 5 seconds. Individual plugins that need real-time data use `useOsSnapshot()` from the `OsStreamProvider` React Context. Remaining stand-alone pollers use:

- **`useAdaptivePolling`**: Health-based interval scaling (1x/2x/4x)
- **`useVisibilityPolling`**: Auto-pause when browser tab hidden
- **`useRateThrottle`**: Client-side token bucket rate limiting

## 6. New Architecture Components

### Backend
- `POST /api/telemetry/ingest/batch` — Batch ingest (max 100 events)
- `GET /api/os-stream` — Unified SSE with `os:snapshot` event type
- `ipFromRequest()` — Explicit X-Forwarded-For IP extraction for rate limiting
- `teardownAll(redisClient)` — Graceful DB/Redis shutdown on SIGTERM
- `withTimeout()` — Exported from db.js for callers with raw pool.query
- `shouldSample()`, `isDuplicateTrace()`, `recordThroughput()` — Prime-lens sampling pipeline

### Frontend
- `apiClient.ts` — Jittered exponential backoff, AbortController timeouts, NetworkError class, X-RateLimit-Reset support
- `telemetryBatcher.ts` — 1000ms batching queue for telemetry events
- `OsStreamProvider.tsx` — React Context wrapping `useOsStream()`
- `ConnectionBanner.tsx` — Alert banner on OS stream disconnect
- `useBackoffHandling.ts` — Rate limit/server timeout backoff state
- `useOnlineStatus.ts` — Browser online/offline detection
- `useRateThrottle.ts` — Client-side token bucket throttler
- `useAdaptivePolling.ts` — Health-aware interval scaling
- `usePageVisibility.ts` / `useVisibilityPolling.ts` — Tab visibility-aware polling

## 7. Trust Proxy Configuration

```js
app.set('trust proxy', 1); // Trust exactly 1 Heroku router hop
```

Rate limiters use explicit `keyGenerator` reading `req.headers['x-forwarded-for']` first, falling back to `req.ip`. This prevents all traffic appearing to come from the Heroku router IP.
