# Kudbee — Build & Replication Guide

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

## Environment

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
│       │   ├── PluginCard.tsx       # Rack-mount module base
│       │   ├── HealthMatrixPlugin   # Live system health
│       │   ├── ThreatHeatmapPlugin  # Firewall threats
│       │   ├── AnomalyFeedPlugin    # Low-confidence alerts
│       │   ├── EnergyDecayPlugin    # E(token) thermodynamics
│       │   ├── UnionMonitorPlugin   # Nash unions
│       │   ├── ContractMonitorPlugin # AGC contracts
│       │   └── ... (13 more)
│       └── pages/
│           ├── dashboard.tsx  # Main Control Tower
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

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| GET /health | System health (PG + Redis probes) |
| POST /api/telemetry/ingest | Telemetry ingestion |
| POST /api/governance/mint-think-token | Think token creation with receptor gating |
| GET /api/think/trajectories | Vector trajectory listing |
| GET /api/dashboard/summary | Dashboard aggregate stats |
| POST /api/system/lifecycle | Full system health matrix |
| POST /api/system/test-connections | 9-subsystem connection probe |
| GET /api/agents/fleet | Agent fleet tracking |
| POST /api/agents/dispatch | Agent dispatch |
| GET /api/groq/archives | Groq token archives |

## Troubleshooting

### E2E fails: "trust proxy" or "keyGenerator" errors
express-rate-limit v7+ enforces IPv6/IP validation. The server disables
`trust proxy` in test mode and uses default key generator. If upgrading
the rate-limit package, check these settings in server.js:53 and :170.

### "receptorGate is not defined"
The receptor gating engine import was restored. Verify:
`import { defaultEngine as receptorGate } from '../memory/src/receptorGating.ts'`

### Redis connection refused
Ensure Redis is running on port 6379. Set `REDIS_URL=redis://localhost:6379`.

### No Neon Postgres
The server uses in-memory fallback store automatically. All E2E tests pass
without Neon. Set `DATABASE_URL` for pgvector features.
