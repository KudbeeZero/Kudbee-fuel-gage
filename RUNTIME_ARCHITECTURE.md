# RUNTIME ARCHITECTURE — OPS-002 Workstream D

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY | **Auditor:** KILOH

---

## Executive Summary

The runtime is a **multi-process monolith split into dyno types** via the
Procfile: `web` (Express ingestion), `hermes-worker`, `monitor-worker`,
`sentinel`, plus a `release` phase that runs boot verification before traffic.
Production runs web + hermes-worker at Standard-1X; monitor-worker and sentinel
are scaled to 0 (on-demand). All processes share one codebase with Node 22 +
tsx.

## 1. Service Inventory

| Service | Entry point | Procfile type | Purpose |
|:---|:---|:---|:---|
| Ingestion (web) | `services/ingestion/server.js` | web | Express monolith: 11-layer middleware, SSE, API routes |
| HERMES Auditor | `services/agents/hermes.js` | hermes-worker | Audit sweep, probe, log filter, crucible |
| Monitor Agent | `services/monitor/agent.js` | monitor-worker | BLPOP telemetry feed polling |
| Sentinel | `services/sentinel/src/index.ts` | sentinel | Edge egress monitor, health keep-alive |
| Governance Worker | `services/agents/worker.ts` | (worker, inline) | BRPOP task queue + DLQ |
| THINKBOX | `services/thinkbox/src/index.ts` | (CLI) | Workspace detection (PR-001) |
| Global Workspace | `services/workspace/globalWorkspace.ts` | (lib) | Latent-vector swarm tensor |

## 2. Process Model (Procfile)

```
release:        node scripts/boot-verify.mjs        (pre-deploy verification)
web:            npx tsx services/ingestion/server.js  (512MB heap)
monitor-worker: node services/monitor/agent.js         (256MB)
hermes-worker:  npx tsx worker.js                       (256MB)
sentinel:       npx tsx services/sentinel/src/index.ts (256MB)
```

## 3. Per-Service Detail

### web — Ingestion (owner: KILOH)
- Middleware chain: duration → spheroid audit → rate limiter → timeout → CORS → body parser → bearer auth → kilo bridge → ECP → API rate limit → zod
- All 11 layers fail-open with `MiddlewareGuard` (N failures → bypass, auto-recover 30s)
- Health: `/health`, `/api/system/health-deep`
- Logging: `[PERF_WARN]` >3s, `[http]` >1s
- Metrics: route-latency buffer, telemetry_traces

### hermes-worker (owner: HERMES agent)
- Audit sweep + probe + log filter + crucible integration
- Depends on: governance queue, Redis streams

### monitor-worker — scaled to 0 (owner: monitor agent)
- BLPOP on `kudbee:telemetry_feed`, 5s timeout
- On-demand: start when monitoring needed

### sentinel — scaled to 0 (owner: sentinel agent)
- Edge egress monitor, blast-radius gauge
- Native http health keep-alive on PORT 3001

### governance worker (owner: governance)
- TCP BRPOP `kudbee-governance-tasks`, 5s timeout, 3-attempt DLQ, exponential backoff
- State transitions broadcast on `kudbee:events`

## 4. Dependencies Graph

```
web ──> Neon Postgres (pgvector) ──> Upstash Redis (fast brain)
 │            │                          │
 │            └── telemetry_traces       ├── queues (BRPOP)
 │                                      ├── streams (audit, breadcrumbs)
 │                                      └── pub/sub (kudbee:events)
 ├── hermes-worker ──> Redis queues/streams
 ├── monitor-worker ──> telemetry_feed (BLPOP)
 └── sentinel ────────> Redis (telemetry publish)
```

## 5. Operational Characteristics

| Aspect | web | hermes | monitor | sentinel |
|:---|:---|:---|:---|:---|
| Restart policy | Heroku-managed dyno restart | same | same | same |
| Health check | `/health` | heartbeat | heartbeat | native server |
| Logging | stdout + logtail drain | stdout | stdout | stdout |
| Alerts | via telemetry/alerts panel | audit events | degradation events | blast gauge |
| Scaling | 1 (Std-1X) | 1 (Std-1X) | 0 (Eco) | 0 (Eco) |

## 6. Recommendations

| # | Action | Classification |
|:---|:---|:---|
| D-1 | Keep monitor/sentinel at 0 until a real workload justifies them | Safe |
| D-2 | Add startup-time + memory metrics to `/api/system` | Safe (non-production) |
| D-3 | Document the governance worker process type in Procfile (currently "worker") | Safe |
| D-4 | Verify sentinel's keep-alive port doesn't conflict with web | Safe |
