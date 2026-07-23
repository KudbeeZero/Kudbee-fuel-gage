# 03 — Pipelines & Network Architecture

## 1. Data Flow Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           INGESTION LAYER                                 │
│                                                                          │
│  Client / Agent / Cron  ──►  POST /api/telemetry/ingest                  │
│                              POST /api/telemetry/edge-ingest              │
│                              POST /api/memory/remember                    │
│                              POST /api/think/archive                      │
│                                                                          │
│   ┌─────────────────┐    ┌────────────────┐    ┌───────────────────────┐ │
│   │ FTWB Middleware  │───►│ Zod Schema     │───►│ Heartbeat Firewall    │ │
│   │ (groqBreaker CB) │    │ Validation      │    │ (low-value filter)    │ │
│   └─────────────────┘    └────────────────┘    └───────┬───────────────┘ │
│                                                        │                 │
│                                                        ▼                 │
│                                              ┌──────────────────┐        │
│                                              │ Gemini Triage    │        │
│                                              │ (critical/ignore) │        │
│                                              └──────┬───────────┘        │
│                                                     │                    │
└─────────────────────────────────────────────────────┼────────────────────┘
                                                      │
                        ┌─────────────────────────────┼───────────────────┐
                        │              VALIDATION & ENRICHMENT            │
                        │                                                │
                        │  ┌──────────────┐   ┌──────────────────────┐   │
                        │  │ Agent Auth   │   │ Memory Recall        │   │
                        │  │ (Pass + Sig) │   │ (pgvector similarity)│   │
                        │  └──────┬───────┘   └──────────┬───────────┘   │
                        │         │                      │               │
                        │         ▼                      ▼               │
                        │  ┌──────────────────────────────────────────┐  │
                        │  │ Embedding Pipeline (embedder.js)         │  │
                        │  │ tokenize → hash → bucket → normalize     │  │
                        │  └──────────────────┬───────────────────────┘  │
                        │                     │                          │
                        └─────────────────────┼──────────────────────────┘
                                              │
              ┌───────────────────────────────┼─────────────────────────┐
              │                    STORAGE LAYER                        │
              │                                                        │
              │  ┌──────────────────┐  ┌────────────────────────────┐  │
              │  │ Neon Postgres    │  │ Redis Cache / PubSub        │  │
              │  │                  │  │                            │  │
              │  │ telemetry_traces │  │ kudbee:telemetry_feed      │  │
              │  │ telemetry_vectors│  │ kudbee:events (SSE bus)    │  │
              │  │ think_tokens     │  │ kudbee:events:v2           │  │
              │  │ vector_memory    │  │ kudbee:governance_actions  │  │
              │  │ reasoning_ledger │  │ kudbee:sink:accumulator    │  │
              │  └────────┬─────────┘  │ kudbee:circuit:*           │  │
              │           │            └──────────────┬─────────────┘  │
              └───────────┼───────────────────────────┼────────────────┘
                          │                           │
              ┌───────────┼───────────────────────────┼────────────────┐
              │           │     BROADCAST LAYER        │                 │
              │           ▼                            ▼                 │
              │  ┌──────────────────────┐  ┌──────────────────────────┐ │
              │  │ SSE /api/events      │  │ SSE /api/telemetry/stream│ │
              │  │ SSE /api/env/sse      │  │ Redis pub/sub subscriber │ │
              │  │ MAX_SSE_CLIENTS=100  │  │ 10s keepalive ping        │ │
              │  └──────────┬───────────┘  └──────────┬───────────────┘ │
              │             │                         │                  │
              │             ▼                         ▼                  │
              │  ┌──────────────────────────────────────────────┐       │
              │  │ Frontend Hooks                               │       │
              │  │ useEventStream.ts  (singleton EventSource)    │       │
              │  │ useTelemetryStream.ts (SSE + POLLING fallback)│       │
              │  │ useOnlineStatus.ts (navigator.onLine)        │       │
              │  └──────────────────────────────────────────────┘       │
              └─────────────────────────────────────────────────────────┘
```

## 2. Timeout Values

| Operation                      | Timeout (ms) | Location                        |
|-------------------------------|-------------|---------------------------------|
| Normal DB query (runQuery)    | 10,000      | `services/lib/db.js:210`        |
| Normal DB insert (runInsert)  | 10,000      | `services/lib/db.js:248`        |
| DB pool connection            | 5,000       | `services/lib/db.js:81`         |
| DB pool idle timeout          | 10,000      | `services/lib/db.js:80`         |
| Vector similarity query       | 25,000      | `services/memory/vectorStore.ts:18` |
| Vector insert (think_token)   | 30,000      | `services/memory/thinkTokenGenerator.ts:19` |
| Vector dictionary lookup      | 25,000      | `services/ingestion/server.js` (via db.js export) |
| Redis command timeout         | 3,000       | `services/lib/redis.js:49`      |
| Redis connect timeout         | 5,000       | `services/lib/redis.js:48`      |
| HTTP request timeout          | 15,000      | `services/ingestion/server.js:78` |
| SSE keepalive interval        | 10,000      | `services/ingestion/server.js:3115` |
| SSE reconnect hint (retry:)   | 3,000       | `services/ingestion/server.js:3100` |
| Circuit breaker reset         | 30,000      | `services/lib/circuitBreaker.ts:33` |
| Redis sink breaker reset      | 15,000      | `services/lib/circuitBreaker.ts:70` |
| DB health reprobe interval    | 30,000      | `services/lib/db.js:125`        |
| Think token query (fallback)  | 25,000      | `services/memory/vectorStore.ts:379` |

## 3. Circuit Breaker State Machine

```
                  ┌──────────────────────────────────────────┐
                  │                                          │
        success    │    5 consecutive failures                │
     ┌─────────────┼─────────────┐                           │
     │             │             │                           │
     ▼             │             ▼                           │
┌─────────┐        │        ┌─────────┐    resetTimeoutMs    │
│ CLOSED  │────────┼───────►│  OPEN   │─────────────────────┐│
│ (normal)│                 │ (reject)│                     ││
└─────────┘                 └─────┬───┘                     ││
     ▲                            │                         ││
     │                            │ 30_000ms                ││
     │                            ▼                         ││
     │                       ┌─────────────┐               ││
     │   halfOpenMax probes  │ HALF_OPEN   │               ││
     ├─── succeed (2/2) ─────│ (probe mode)│               ││
     │                       └──────┬──────┘               ││
     │                              │                      ││
     │   any probe fails ──────────►│ re-trips to OPEN ───►┘│
     │                                                       │
     └───────────────────────────────────────────────────────┘

  States:
    CLOSED    - Requests pass through freely. Failure counter reset to 0.
    OPEN      - All requests immediately rejected. Timer started.
    HALF_OPEN - After resetTimeoutMs, limited probes (halfOpenMax) allowed.
                Success → CLOSED. Failure → OPEN.

  Configuration:
    groqBreaker:         failureThreshold=5,  resetTimeoutMs=30_000
    redisSinkBreaker:    failureThreshold=3,  resetTimeoutMs=15_000

  Implementation: services/lib/circuitBreaker.ts
  Backing store: Redis keys under `kudbee:circuit:{name}:state`
```

## 4. Redis Key Namespace Map

```
┌──────────────────────────────────────┬──────────┬──────────────────────────────────┐
│ Key Pattern                          │ Type     │ Purpose                          │
├──────────────────────────────────────┼──────────┼──────────────────────────────────┤
│ kudbee:telemetry_feed                │ List     │ Recent telemetry entries (LTRIM) │
│ kudbee:events                        │ PubSub   │ Cross-process SSE event bus      │
│ kudbee:events:v2                     │ PubSub   │ Unified v2 envelope events       │
│ kudbee:think:tokens                  │ PubSub   │ Think token minting events       │
│ kudbee:circuit:{name}:state          │ String   │ Breaker state CLOSED/OPEN/HALF   │
│ kudbee:circuit:{name}:failures       │ Counter  │ Consecutive failure count         │
│ kudbee:circuit:{name}:half_open_permits │ Counter│ Permits remaining in HALF_OPEN   │
│ kudbee:governance_counter            │ Counter  │ Governance action sequence        │
│ kudbee:governance_actions            │ ZSet     │ Governance action records         │
│ kudbee:verified_traces               │ Set      │ Verified trace IDs               │
│ kudbee:community_value_score         │ Counter  │ Cumulative community score        │
│ kudbee:governance_count              │ Counter  │ Total governance actions          │
│ kudbee:sink:accumulator              │ ZSet     │ Sink token accumulator window     │
│ kudbee:sink:metrics                  │ Hash     │ Sink metrics (rejected/remediated)│
│ kudbee:anomalies                     │ Set      │ Groq-synthesized anomaly tokens   │
│ kudbee:probation:pending             │ ZSet     │ Probation docket items            │
│ kudbee-governance-tasks              │ List     │ Governance task queue             │
│ kudbee-governance-tasks-failed       │ List     │ Dead letter queue                 │
│ kudbee:agents:hermes                 │ String   │ Hermes heartbeat + TTL            │
│ kudbee:agent:state                   │ Hash     │ Agent fleet state                 │
│ kudbee:groq:archives                 │ List     │ Groq synthesis archives           │
│ kudbee:hermes:log                    │ List     │ Hermes audit log lines            │
│ kudbee:alerts                        │ List     │ Alert history                    │
│ kudbee:session_history               │ List     │ Session history                  │
└──────────────────────────────────────┴──────────┴──────────────────────────────────┘
```

## 5. SSE Event Type Taxonomy

```
  Event Types (delivered over /api/events and /api/telemetry/stream):

  Named events (EventSource.addEventListener):

    ┌──────────────────┬────────────────────────────────────────────────┐
    │ Event Type        │ Payload Shape                                  │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ snapshot          │ { proposed: GovernanceAction[], db_healthy:    │
    │                   │   boolean, redis: boolean }                    │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ telemetry         │ { trace_id, model, tokens_in, tokens_out,      │
    │                   │   cost, status, latency_ms, agent, ts }        │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ triage            │ { payload, violation_reason, timestamp }       │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ governance        │ { kind: 'approved'|'rejected', action }        │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ slow_brain        │ Router decision metadata                       │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ hermes_suggestion │ Hermes audit suggestion                        │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ hermes            │ Hermes audit event                             │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ ask               │ Async probe/query result                       │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ storage_metrics   │ { postgres_size_bytes, redis_size_bytes, ts }  │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ os_telemetry      │ { vector_memory_count, think_tokens_minted, ts │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ router            │ { id, preferred, selected, failover,           │
    │                   │   latencyMs, ts }                              │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ policy            │ { id, enabled, severity, ts }                  │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ alert             │ Alert create/ack/mitigate payload              │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ feedback          │ { kind: 'submitted', feedback }                 │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ vector            │ { state, totalChunks, ts }                     │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ crucible          │ Crucible cycle dispatch payload                │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ uncertainty_gate  │ { decision, intercepted, confidence_score, ...}│
    ├──────────────────┼────────────────────────────────────────────────┤
    │ audit_vault       │ { kind: 'anchored', anchor }                   │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ think_token_minted│ { id, agentId, status, cost, latencyMs, ... }  │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ think_token_status_updated │ { id, hash, status, ... }             │
    ├──────────────────┼────────────────────────────────────────────────┤
    │ message           │ Generic fallback (EventSource.onmessage)       │
    └──────────────────┴────────────────────────────────────────────────┘

  Keepalive: `: ping\n\n` sent every 10s (SSE comment — no event dispatch).

  Frontend consumers:
    - useEventStream.ts     — module-level singleton, ref-counted.
                              Named handlers registered via on(type, handler).
    - useTelemetryStream.ts — SSE with automatic POLLING fallback on error.
                              Reconnect safety net at reconnectMs * 5.
    - useOnlineStatus.ts    — Browser navigator.onLine monitor.

  Backend producers:
    - publishEvent()        — deprecated local helper, publishes to Redis.
    - publishUnifiedEvent() — v2 envelope with id/ts/source/kind/data.
    - broadcast()           — fans to all local SSE clients (from Redis subscriber).
```

## 6. Pipeline Entry Points

| Endpoint                          | Timeout  | Auth/Guard      | Health Check |
|-----------------------------------|----------|-----------------|--------------|
| POST /api/telemetry/ingest        | 15s      | FTWB + AgentPass| DB + Redis   |
| POST /api/telemetry/edge-ingest   | 15s      | AgentPass       | None         |
| POST /api/think/synthesize        | 15s      | None            | Groq key     |
| POST /api/think/archive           | 15s      | None            | None         |
| POST /api/memory/remember         | 15s      | None            | None         |
| POST /api/governance/mint-think-token | 15s  | None            | Receptor gate|

### Pre-ingest Health Gate (POST /api/telemetry/ingest)
- Checks `isDbHealthy()` AND Redis availability.
- Returns 503 if BOTH are down — pipeline cannot accept data without any persistence backend.
- Does NOT block if at least one backend is available (resilient-first).

## 7. Backpressure & Flow Control

### SSE Client Backpressure
- `MAX_SSE_CLIENTS = 100`: hard cap on concurrent SSE connections.
- New connections beyond limit receive HTTP 503 with `Retry-After: 5`.
- Dead clients detected via write failures and ECONNRESET on `res.on('error')`.

### Redis Feed Backpressure
- `kudbee:telemetry_feed` list is LTRIM'ed to 10,000 entries after each push.
- Prevents unbounded growth from high-ingest-rate bursts.

### Sink Accumulator
- `kudbee:sink:accumulator` (ZSet) with 1-hour sliding window.
- `MAX_THEORETICAL = 10,000`: pressure = count / 10,000, capped at 1.0.
- Auto-expires entries older than WINDOW_MS via `zremrangebyscore`.

### Circuit Breaker
- Groq FTWB: opens after 5 consecutive failures, resets after 30s.
- Redis sink: opens after 3 failures, resets after 15s.
- HALF_OPEN state allows `halfOpenMax` probe requests before re-tripping.

## 8. Resilience Patterns

### DB — Resilient-First Degradation
```
  try Neon query (withTimeout 10s) → on success: return results
                                   → on failure: mark _healthy=false, fallback to in-memory store
  Health reprobe runs every 30s: connect() → on success: _healthy=true
```

### Redis — Fire-and-Forget
```
  All Redis writes are best-effort. Failures are logged, never thrown.
  Pub/sub subscriber uses retry strategy (times*250ms, max 5s).
  Command timeout: 3s. Connect timeout: 5s.
```

### SSE — Connection Resilience
```
  Client disconnect (close/ECONNRESET) → cleanup keepalive timer, remove from sseClients.
  Browser EventSource auto-reconnects via `retry: 3000` SSE header.
  Frontend useTelemetryStream: falls back to polling on EventSource error.
```

### Think Token — Double-Insert Guard
```
  Primary: pool.query with 30s timeout → returns id.
  Fallback: runInsert (10s timeout) → returns id.
  Both fail: degrades (never throws).
```
