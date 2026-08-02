# UPDATED_RUNTIME_ARCHITECTURE — OPS-004 Phase 4

**THINK Governance Engine** | **Date:** 2026-08-02

---

## Process Model (current, verified)

```
                     ┌─────────────────────────────────────────┐
                     │              HEROKU (heroku-26)         │
                     │  kudbee-fuel-gage-pipeline              │
                     │                                         │
  ┌──────────────┐   │  PROD:  web(1×Std-1X) + hermes(1×Std-1X) │
  │   GitHub     │──▶│  monitor(0)  sentinel(0)  [on-demand]   │
  │  Actions CI  │   │  STAGING: web(1×Eco) + hermes(1×Eco)     │
  │  (bounded)   │   │  REVIEW:  auto per PR, destroy on stale  │
  └──────────────┘   └──────┬──────────────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │  Neon Postgres      │  ┌─────────────────────┐
                 │  (pgvector, 1536)   │  │  Upstash Redis ×2   │
                 │  pool 5-20 clamped  │  │  fast + slow brain  │
                 └─────────────────────┘  │  500k breaker cap   │
                                         └─────────────────────┘
```

## Component Inventory

| Component | Entry | Dyno | Scaling | Restart | Health | Logging | Dependencies |
|:---|:---|:---|:---|:---|:---|:---|:---|
| Ingestion (web) | `services/ingestion/server.js` | 1×Std-1X | fixed | Heroku | `/health` | stdout + logtail | Postgres, Redis |
| HERMES auditor | `services/agents/hermes.js` | 1×Std-1X | fixed | Heroku | heartbeat | stdout | Redis streams |
| Monitor | `services/monitor/agent.js` | 0 | on-demand | Heroku | — | stdout | Redis (BLPOP) |
| Sentinel | `services/sentinel/src/index.ts` | 0 | on-demand | Heroku | native:3001 | stdout | Redis |
| Governance worker | `services/agents/worker.ts` | (inline) | on-demand | Heroku | — | stdout | Redis queue+DLQ |
| THINKBOX | `services/thinkbox/` | CLI | on-demand | — | — | stdout | filesystem, BUS |

## Data Flow

```
Client → web (11-layer middleware, fail-open)
  → Postgres (durable: traces, memories, governance, think)
  → Redis fast (telemetry, rate limits, budgets)
  → Redis slow (workers: governance queue, DLQ, telemetry feed)
  → SSE /api/os-stream → Control Tower panels
```

## Governance Integration

- Every deploy path is gated: GitHub CI (bounded) → review app → merge →
  staging → (approval) → production.
- THINK Governance Engine policies evaluated pre-coding/pre-commit/pre-push/pre-pr.
- Evidence trail: `.kilo/memory/guardian/evidence.jsonl`.

## Design Decisions

1. **web + hermes always-on** — control tower + audit continuity.
2. **monitor/sentinel at 0** — cost discipline; start on demand.
3. **external Postgres/Redis** — no Heroku data add-on cost; provider-managed.
4. **200 release points** — deterministic rollback.
