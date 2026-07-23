# API Reference

Complete route map from `runtime-allowlist.json` and `services/ingestion/server.js`. Organized by prefix.

---

## Health & Metrics

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/health` | System health with PG + Redis probes |
| `GET` | `/api/health-check` | Legacy health check (compatibility) |
| `POST` | `/api/health` | HERMES heartbeat sink (stores to `kudbee:agents:hermes`) |
| `GET` | `/api/system/health-deep` | Deep health check (routed via system router) |
| `GET` | `/metrics` | Prometheus-compatible metrics (`kudbee_uptime_seconds`, `kudbee_memory_bytes`, `kudbee_pg_healthy`, `kudbee_redis_healthy`) |
| `GET` | `/api/metrics/community-value` | Community value score with settled budget data |
| `GET` | `/api/think/metrics` | Think token aggregation (total, verified, cumulative cost) |

## Telemetry

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/telemetry/ingest` | **Primary ingestion.** FTWB-guarded, Zod-validated, Gemini-triaged |
| `POST` | `/api/telemetry/edge-ingest` | Edge Sentinel webhook (auth via X-Agent-Pass) |
| `GET` | `/api/telemetry/stats` | Live OS telemetry (vector memory count, think tokens minted, crucible health) |
| `GET` | `/api/telemetry/stream` | Telemetry event stream |
| `GET` | `/api/telemetry/logs` | Raw telemetry traces (paginated, `?limit=N`) |
| `POST` | `/api/telemetry/inject-csv` | Bulk CSV log injection |
| `POST` | `/api/telemetry/purge` | Purge all telemetry data |
| `GET` | `/api/telemetry/degradation-status` | Circuit breaker degradation status |

## Dashboard

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/dashboard/summary` | Aggregate stats: 24h cost, total tokens, active models, error rate, DB sizes |

## Governance

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/governance/feed` | Governance action feed (paginated) |
| `GET` | `/api/governance/pending` | HITL pending approval requests |
| `POST` | `/api/governance/resolve` | Approve/reject a proposed action `{ id, decision }` |
| `POST` | `/api/governance/approve` | Approve by ID |
| `POST` | `/api/governance/reject` | Reject by ID |
| `GET` | `/api/governance/proposed` | All proposed actions (raw) |
| `POST` | `/api/governance/dispatch` | Manual Crucible cycle dispatch |
| `POST` | `/api/governance/mint-think-token` | Mint think token with optional receptor gating |
| `GET` | `/api/governance/health` | Governance health (HERMES status, proposed count) |
| `GET` | `/api/governance/hermes-logs` | Last 50 HERMES auditor log lines |
| `POST` | `/api/governance/feedback` | Submit user feedback |
| `GET` | `/api/governance/feedback` | Retrieve feedback history |
| `POST` | `/api/governance/tune` | Submit auto-tune parameters |
| `GET` | `/api/governance/tune` | Retrieve auto-tune configuration |
| `POST` | `/api/governance/tune/apply` | Apply tuning rules |
| `GET` | `/api/governance/tenants` | List configured tenants |
| `GET` | `/api/governance/failed` | Dead letter queue (failed tasks) |
| `POST` | `/api/governance/failed/retry` | Retry a failed task from DLQ |
| `POST` | `/api/governance/failed/discard` | Discard a failed task from DLQ |
| `GET` | `/api/governance/probation/docket` | Pending probation cases |

### Governance — Contracts

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/governance/contract/sign` | Sign a new AGC contract |
| `POST` | `/api/governance/contract/verify/:id` | Verify token against contract bounds |
| `GET` | `/api/governance/contract/active` | List all active AGC contracts |

### Governance — Nash Unions

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/governance/union/form` | Form a new Nash union |
| `POST` | `/api/governance/union/negotiate` | Negotiate token allocation |
| `GET` | `/api/governance/union/active` | List all active unions |

## Think Tokens

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/think/trajectories` | List trajectories with confidence scoring |
| `PATCH` | `/api/think/trajectories/:hash/status` | Update token status (VERIFIED/RECYCLED) |
| `POST` | `/api/think/archive` | Archive chain-of-thought reasoning |
| `GET` | `/api/think/archive` | Retrieve recent thought blocks |
| `POST` | `/api/think/synthesize` | Groq LPU think token synthesis |
| `GET` | `/api/think/anomalies` | Low-confidence anomaly tokens |
| `GET` | `/api/think/energy-mesh` | Energy mesh heatmap |
| `GET` | `/api/think/metrics` | Aggregated think metrics |

## Memory

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/memory/remember` | Persist a memory string |
| `GET` | `/api/memory/recall` | Recall memories via `?query=...&limit=N&last=N` |
| `POST` | `/api/memory/dictionary/lookup` | Victory Memory Dictionary — pgvector similarity lookup |
| `GET` | `/api/memory/think-tokens` | Token Forge — pgvector semantic search for past successes |

## Agent Context & Evaluation

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/agents/context` | Build agent context (skills + system prompt) |
| `GET` | `/api/agents/context` | Build context via query params |
| `POST` | `/api/agents/evaluate` | Uncertainty gate — evaluate + route agent payload |
| `GET` | `/api/agents/evaluate` | Parse-only uncertainty evaluation |
| `POST` | `/api/agents/dispatch` | Dispatch a task to an agent |
| `POST` | `/api/agents/crucible/run` | Execute a Crucible adversarial cycle |
| `POST` | `/api/agents/fleet` | Update agent fleet state |
| `GET` | `/api/agents/fleet` | List all agents in fleet |

## System

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/system/lifecycle` | System health matrix (PG, Redis, Groq, worker, receptor) |
| `POST` | `/api/system/test-connections` | 9-subsystem connection probe |
| `POST` | `/api/system/diagnose-breadcrumb` | Groq diagnostic engine for a trace |
| `GET` | `/api/system/last-event` | Last published event |
| `GET` | `/api/system/audit-history` | Agent audit trail |
| `GET` | `/api/system/file` | Read a system file |

## Settings

| Method | Route | Description |
|:---|:---|:---|
| `PATCH` | `/api/settings/tenant/:id` | Update tenant settings |
| `GET` | `/api/settings/tenant/:id` | Get tenant settings |
| `PUT` | `/api/settings/preferences` | Save persisted preferences |
| `GET` | `/api/settings/preferences` | Load persisted preferences |

## Audit

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/audit/vault/anchor` | Anchor a hash to the audit vault |
| `GET` | `/api/audit/vault` | Retrieve audit vault records |
| `POST` | `/api/audit/vault/verify` | Verify a hashed record |

## Interceptor (Firewall Triage)

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/interceptor/triage` | List security violations |
| `DELETE` | `/api/interceptor/triage/:id` | Delete a violation |
| `POST` | `/api/interceptor/revalidate/:id` | Re-validate and re-ingest a quarantined trace |
| `POST` | `/api/interceptor/verify` | FTWB-guarded governance verification |
| `GET` | `/api/interceptor/threat-heatmap` | Model threat aggregation |

## Alerts

| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/api/alerts/configure` | Configure alert thresholds |
| `GET` | `/api/alerts/history` | Alert history |

## Groq Archives

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/groq/archives` | Groq token archives |

## Reasoning Ledger

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/reasoning/ledger` | Structured reasoning log |

## Session History

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/session-history` | PR session manifest history |
| `GET` | `/api/events` | SSE event stream |
