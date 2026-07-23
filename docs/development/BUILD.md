# Build and Verification Guide

## One-Command Verification

```bash
npm ci && npm run typecheck && node scripts/verify-e2e.mjs && cd apps/web && npm run build
```

All four must pass:
- `npm run typecheck` → 10/10 workspaces, 0 errors
- `node scripts/verify-e2e.mjs` → 36/36 checks
- `cd apps/web && npm run build` → production bundle

## Prerequisites

- Node.js 22+ (ESM native)
- Redis (port 6379) — local or Upstash
- Optional: Neon Postgres (in-memory fallback works without it)
- Optional: Groq API key (set `GROQ_API_KEY` for LPU inference)
- Optional: Gemini API key (set `GEMINI_API_KEY` for telemetry triage)

## Environment

```bash
cp config/template.env .env
```

Edit `.env` with your credentials:

- `DATABASE_URL` — Neon Postgres connection string (optional, server degrades to in-memory fallback)
- `REDIS_URL` — Redis URL for state layer and event bus
- `GEMINI_API_KEY` — Gemini API key for triage/HERMES reasoning
- `GITHUB_TOKEN` — GitHub token for auto-commit/PR workflow
- `APP_URL` — Deployed app URL (injected by Heroku/AI Studio)
- `REACT_APP_API_URL` — Backend base URL (leave empty for same-origin)
- `CORS_ALLOW_ORIGINS` — Comma-separated allowed origins
- `PORT` — Server port (default 3000)
- `NODE_ENV` — `development` | `test` | `production`

### Minimal Setup for Local Dev

```bash
export REDIS_URL=redis://localhost:6379
export NODE_ENV=test
export DATABASE_URL=postgres://...  # optional
export GROQ_API_KEY=gsk_...         # optional
```

## Project Structure

```
├── apps/web/              # React 19 + Vite frontend
│   └── src/
│       ├── components/    # 17+ dashboard plugins
│       │   ├── PluginCard.tsx          # Rack-mount module base
│       │   ├── ThinkStormPlugin.tsx    # Distributed reasoning storm
│       │   ├── ThinkStreamPlugin.tsx   # Live chain-of-thought stream
│       │   ├── ThinkStoragePlugin.tsx  # Vector memory query & storage
│       │   ├── ThinkTrajectoriesPlugin.tsx # Think token trajectory explorer
│       │   ├── GovernanceGatePlugin.tsx # HITL approval gate
│       │   ├── HermesAuditorPlugin.tsx  # Live audit sweep with probe/filter
│       │   ├── EdgeSentinelPlugin.tsx   # Telemetry egress & blast radius
│       │   ├── HealthMatrixPlugin      # Live system health
│       │   ├── ThreatHeatmapPlugin     # Firewall threats
│       │   ├── AnomalyFeedPlugin       # Low-confidence alerts
│       │   ├── EnergyDecayPlugin       # E(token) thermodynamics
│       │   ├── UnionMonitorPlugin      # Nash unions
│       │   ├── ContractMonitorPlugin   # AGC contracts
│       │   └── ... (more)
│       └── pages/
│           ├── telemetry.tsx    # TELEMETRY tab — live metrics, model matrix, Circuit Breaker
│           ├── think.tsx        # THINK tab — Storm, Stream, Storage, Trajectories plugins
│           ├── governance.tsx   # GOVERNANCE tab — HITL gate + GovernanceView
│           ├── hermes.tsx       # HERMES tab — audit sweep, probe, filter
│           ├── sentinel.tsx     # SENTINEL tab — egress monitor, blast radius
│           ├── dashboard.tsx    # Legacy Control Tower (Control Tower page)
│           ├── history.tsx
│           └── firewall.tsx
├── services/
│   ├── ingestion/server.js   # Main Express server (60+ routes)
│   ├── agents/worker.ts      # Background task queue
│   ├── memory/
│   │   ├── thinkTokenGenerator.ts
│   │   ├── vectorStore.ts
│   │   ├── receptorGating.ts  # Receptor gate engine
│   │   └── pcaReducer.ts
│   ├── sentinel/src/poller.ts # Telemetry egress
│   └── lib/
│       ├── redis.js, db.js
│       ├── groqClient.ts, ftwbMiddleware.ts
│       ├── energyMesh.ts, tokenUnion.ts
│       ├── agcContract.ts, probationRegistry.ts
│       ├── circuitBreaker.ts, sinkAccumulator.ts
│       └── agentAudit.ts, settingsStore.ts
├── packages/types/           # Zod schemas
├── scripts/
│   ├── verify-e2e.mjs        # 36 integration checks
│   ├── verify-receptor-gating.mjs  # 6 gating checks
│   ├── verify-energy-mesh.mjs      # 4 energy checks
│   ├── verify-adversarial-challenge.mjs # 13 adversarial
│   ├── verify-middleware-chaos.mjs     # 6 chaos checks
│   └── verify-system-integrity.mjs
└── .github/workflows/verify.yml  # CI pipeline
```

## Tab Architecture

The Control Tower sidebar uses a plugin-domain tab structure where each rack-mount module gets its own dedicated station — like a hardware lab bench with each piece of equipment at its own slot.

### Navigation Layout

**Primary tabs (sidebar):**
| Tab | Component | Domain |
|:---|:---|:---|
| TELEMETRY | `pages/telemetry.tsx` | Live metrics cards, model matrix, DiagnosticTicker, Circuit Breaker chart |
| THINK | `pages/think.tsx` | ThinkStorm + ThinkStream + ThinkStorage + ThinkTrajectories plugins |
| GOVERNANCE | `pages/governance.tsx` | GovernanceGatePlugin (HITL) + GovernanceView |
| HERMES | `pages/hermes.tsx` | HermesAuditorPlugin — live audit sweep, probe, filter |
| SENTINEL | `pages/sentinel.tsx` | EdgeSentinelPlugin — egress monitor, blast radius gauge |
| PLAYGROUND | `<PlaygroundView />` | Interactive agent testing sandbox |

**Secondary tabs ("More" dropdown):**
| Tab | Component | Domain |
|:---|:---|:---|
| FIREWALL | `pages/firewall.tsx` | Firewall rules and threat management |
| GATEWAY | `<GatewayView />` | API gateway configuration |
| INTERCEPTOR | `<InterceptorView />` | Payload interception and verification |
| HISTORY | `pages/history.tsx` | Telemetry log history |
| ALERTS | `<AlertsPanel />` | System alert notifications |
| INTELLIGENCE | `<IntelligenceView />` | AI intelligence and insights |
| SETTINGS | `<SettingsView />` | System engine settings, thresholds, theme |

### Page-to-Plugin Mapping

- **Think plugins** (Storm, Stream, Storage, Trajectories) get their own tab via `pages/think.tsx`
- **Governance plugins** (GovernanceGate + GovernanceView) share `pages/governance.tsx`
- **Standalone plugins** (HermesAuditor, EdgeSentinel) each get a dedicated page
- **Legacy tabs** (Firewall, Gateway, Interceptor, History, Alerts, Intelligence, Settings) remain as before
- The old **Control Tower** tab (`pages/dashboard.tsx`) is preserved but removed from navigation

All of these pages are rendered in `apps/web/src/App.tsx` via the `<main>` content panel routed on `activeTab`.

## Key Commands

| Command | Purpose |
|:---|:---|
| `npm install` | Install all workspace dependencies |
| `npm run dev` | Start all workspaces via Turborepo |
| `npm run build` | Production build (all workspaces) |
| `npm run typecheck` | TypeScript strict check (10 workspaces) |
| `npm run lint` | ESLint across all workspaces |
| `node scripts/verify-e2e.mjs` | 36 end-to-end checks |
| `node scripts/diagnose-redis.mjs` | Redis connectivity + latency report |
| `node scripts/boot-verify.mjs` | Pre-release environment validation |
| `node scripts/verify-flow.mjs` | Full transaction flow verification |
| `node scripts/verify-receptor-gating.mjs` | Receptor affinity scoring checks |
| `node scripts/verify-governance-loop.mjs` | HITL propose → approve/reject → enforce |
| `node scripts/verify-think-loop.mjs` | Think archival flow verification |
| `node scripts/verify-resilience.mjs` | DB/Redis/LLM failure scenario tests |
| `node scripts/verify-middleware-chaos.mjs` | FTWB firewall chaos testing |
| `node scripts/traffic-sim.mjs` | High-throughput traffic simulator |
| `node scripts/dashboard-load-sim.mjs` | Dashboard concurrency load tester |
| `tsx scripts/deploy-check.ts` | Pre-deployment readiness check |
| `tsx scripts/ingest-topology.ts` | Self-ingestion pipeline for topology |
| `tsx scripts/auto-commit.mjs` | E2E + auto-commit + open PR |

## Key Endpoints

| Endpoint | Purpose |
|:---|:---|
| `GET /health` | System health (PG + Redis probes) |
| `POST /api/telemetry/ingest` | Telemetry ingestion |
| `POST /api/governance/mint-think-token` | Think token creation with receptor gating |
| `GET /api/think/trajectories` | Vector trajectory listing |
| `GET /api/dashboard/summary` | Dashboard aggregate stats |
| `POST /api/system/lifecycle` | Full system health matrix |
| `POST /api/system/test-connections` | 9-subsystem connection probe |
| `GET /api/agents/fleet` | Agent fleet tracking |
| `POST /api/agents/dispatch` | Agent dispatch |
| `GET /api/groq/archives` | Groq token archives |

## Troubleshooting

### E2E fails: "trust proxy" or "keyGenerator" errors
express-rate-limit v7+ enforces IPv6/IP validation. The server disables `trust proxy` in test mode and uses default key generator. If upgrading the rate-limit package, check these settings in server.js:53 and :170.

### "receptorGate is not defined"
The receptor gating engine import was restored. Verify:
`import { defaultEngine as receptorGate } from '../memory/src/receptorGating.ts'`

### Redis connection refused
Ensure Redis is running on port 6379. Set `REDIS_URL=redis://localhost:6379`.

### No Neon Postgres
The server uses in-memory fallback store automatically. All E2E tests pass without Neon. Set `DATABASE_URL` for pgvector features.

### 15-second Request Timeout
Server.js includes a 15-second hard timeout middleware (line 71). Requests exceeding this return `503` to prevent Heroku H27 errors.
