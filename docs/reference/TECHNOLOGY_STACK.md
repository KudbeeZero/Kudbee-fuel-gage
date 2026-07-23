# Technology Stack

## 1. Runtime: Node.js 22 + tsx

**Why chosen:** Node.js 22 provides native ESM support, stable `fetch`, `WebSocket`, and `node:test`. Combined with `tsx` for zero-config TypeScript transpilation, the project achieves full-stack TypeScript without a compile step during development.

**How used:** The project root `package.json` declares `"type": "module"`, enabling ESM across all packages. `tsx` strips types at runtime via `esbuild` under the hood — no `tsc` needed for execution. The `tsconfig.json` extends a base config (`packages/config/tsconfig.base.json`) with `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"allowImportingTsExtensions": true`, and `"noEmit": true`.

**How ESM works with tsx:** `tsx` loads `.ts` files directly via the Node.js ESM loader hook. Import specifiers must include explicit `.ts` / `.js` extensions (enforced by the project's Immutable Law `EXPLICIT_ESM_EXTENSION`). Cross-workspace packages resolve through npm workspace paths, while ambient `.d.ts` files provide types for plain-JS runtime modules.

**Key files:**
- `package.json` — `"type": "module"`, `tsx` dependency
- `tsconfig.json` — project-wide compiler settings
- `packages/config/tsconfig.base.json` — shared base config
- `services/lib/db.d.ts`, `services/lib/redis.d.ts` — ambient type declarations

**Docs:** https://nodejs.org/docs/latest-v22.x/api/, https://tsx.is

---

## 2. Backend Framework: Express.js

**Why chosen:** Lightweight, unopinionated HTTP server with a well-established middleware ecosystem. Express allows Kudbee to serve both REST APIs and Vite's development middleware from a single process, keeping the monorepo simple.

**How used:** The main entry point is `services/ingestion/server.js`, which creates an Express app, mounts JSON body parsing and request logging middleware, then registers route handlers inline and via sub-router imports. The server boots on port 3000, and in development mode wraps Vite as middleware so the React SPA and API share one origin.

**Sub-router pattern:** Route modules in `services/ingestion/routes/` export Express `Router` instances. The server imports and mounts them under `/api/...` prefixes. The governance router (`services/governance/router.js`) exposes `matchLogic`, `listProposed`, `approveAction`, `rejectAction` for Fast Brain / Slow Brain routing.

**Key files:**
- `services/ingestion/server.js` — Express app bootstrap, inline routes, Vite middleware
- `services/ingestion/routes/telemetry.ts` — telemetry ingestion routes
- `services/ingestion/routes/governance.ts` — governance action routes
- `services/ingestion/routes/audit.ts` — audit log routes
- `services/governance/router.js` — governance router

**Docs:** https://expressjs.com/

---

## 3. Database: Neon Postgres + pgvector

**Why chosen:** Neon provides serverless Postgres with auto-scaling and a generous free tier. pgvector extends Postgres with native vector operations, enabling semantic search over embeddings without a separate vector database. This single-database approach reduces operational complexity.

**How used:** The database connection is managed through `services/lib/db.js` (plain JS with an ambient `db.d.ts` declaration). It exposes `getDbPool()`, `isDbHealthy()`, `runQuery()`, and `runInsert()`. All operations are Resilient-First — when the pool is unhealthy, the system degrades to an in-memory fallback.

**pgvector cosine similarity:** pgvector provides the `<=>` operator for cosine distance. Queries use `ORDER BY embedding <=> $1::vector` to rank rows by semantic similarity. The vector store (`services/memory/vectorStore.ts`) wraps this in `searchSimilar()` and `querySystemTopology()`, converting the distance to similarity via `1 - (embedding <=> $1::vector)`.

**Key files:**
- `services/lib/db.js` / `services/lib/db.d.ts` — connection factory
- `services/memory/vectorStore.ts` — pgvector insert/query, cosine similarity, fallback
- `services/memory/thinkTokenGenerator.ts` — think_tokens table writes
- `services/memory/embedText.ts` — 1536-dim text embedding

**Docs:** https://neon.tech/docs, https://github.com/pgvector/pgvector

---

## 4. Cache: Redis / Upstash

**Why chosen:** Redis provides sub-millisecond in-memory operations for caching, pub/sub messaging, circuit breaker state, distributed locks, and audit streams. The `ioredis` client (v5) is used for full Redis protocol support including streams, sorted sets, and key expiry.

**Subsystem key map:**

| Subsystem | Redis Pattern | Key Prefix |
|:---|:---|:---|
| Pub/Sub channels | Notify frontend of real-time events | `kudbee:events:v2`, `kudbee:think:tokens` |
| Lock registry | AGC contract lease enforcement | `kudbee:contract:*` |
| Circuit breaker | State tracking with `INCR`/`EXPIRE` | `kudbee:circuit:*` |
| Settings store | Per-tenant config as JSON strings | `kudbee:settings:*` |
| Audit tracking | LPUSH/LTRIM list + XADD stream | `kudbee:agent:audit`, `kudbee:agent:stream` |
| Probation registry | Sorted set for deadline-based evaluation | `kudbee:probation:pending` / `:resolved` |
| Query cache | `SETEX` with TTL for expensive queries | `kudbee:cache:*` |

**Unified event bus:** `services/lib/unifiedEvents.ts` publishes a single-format envelope `{ id, ts, source, kind, data }` to `kudbee:events:v2`.

**Resilient-First:** Every Redis operation is wrapped in try/catch. If the Redis client is unavailable, all subsystems degrade gracefully to in-memory fallbacks.

**Key files:**
- `services/lib/redis.js` / `services/lib/redis.d.ts` — ioredis client factory
- `services/lib/cache.ts` — `withCache()` / `invalidateCache()` wrapper
- `services/lib/circuitBreaker.ts` — circuit breaker backed by Redis
- `services/lib/settingsStore.ts` — per-tenant settings persistence
- `services/lib/agentAudit.ts` — Redis list + stream audit log
- `services/lib/probationRegistry.ts` — sorted-set probation docket
- `services/lib/unifiedEvents.ts` — v2 event bus publisher
- `services/lib/agcContract.ts` — Assume-Guarantee contract leases

**Docs:** https://redis.io/docs/latest/, https://upstash.com/docs/redis/overall/getstarted, https://github.com/redis/ioredis

---

## 5. LLM Provider: Groq LPU

**Why chosen:** Groq's LPU (Language Processing Unit) inference engine delivers ultra-low-latency token generation (800+ tokens/sec) via an OpenAI-compatible API.

**How used:** The client adapter (`services/lib/groqClient.ts`) exposes:
- `synthesizeThinkToken()` — verify a reasoning correction delta
- `evaluateTokenMatch()` — semantic comparison between token contexts
- `groqSecurityEvaluate()` — firewall threat analysis

**Models used:** Default `llama-3.1-8b-instant` (overridable via `GROQ_MODEL`). Also available: `mixtral-8x7b-32768`, `llama-3.3-70b-versatile`.

**Resilient-First:** If `GROQ_API_KEY` is not set, a warning is logged and all functions return `ok: false`. The `groqBreaker` circuit breaker opens after 5 consecutive failures and resets after 30 seconds.

**Key files:**
- `services/lib/groqClient.ts` — Groq API adapter
- `services/lib/circuitBreaker.ts` — `groqBreaker` instance

**Docs:** https://console.groq.com/docs

---

## 6. Frontend: React 19 + Vite

**Why chosen:** React 19 provides server components, improved hydration, and the `use()` hook. Vite 6 offers sub-second HMR, native ESM dev serving, and CSS import support via `@tailwindcss/vite`.

**How used:** The web app (`apps/web/`) uses Vite as the build tool and dev server. `vite.config.ts` configures React plugin, Tailwind CSS v4, path aliases (`@` → `src/`), and dev server proxies (`/api`, `/health`, `/v1` → `http://127.0.0.1:3000`).

**Component structure:** Organized by domain:
- `dashboard/` — CostLedgerCard, DiagnosticTicker
- `gateway/` — ProviderKeyCard, ProviderStatusGrid, RoutingVisualizer
- `playground/` — MultiModelSelector, RagContextDrawer, TokenEstimator
- `governance/` — GovernanceQueueTray, PolicyEnginePanel
- `audit/` — DLQInspector, AuditVaultCard

**Zustand stores:** `uiStore.ts` (console toggle), `tenantStore.ts` (multi-tenant), `terminalStore.ts` (log buffer)

**Key files:**
- `apps/web/package.json` — React 19, Vite 6, TailwindCSS v4
- `apps/web/vite.config.ts` — Vite config, path aliases, proxy
- `apps/web/src/App.tsx` — root component
- `apps/web/src/components/PluginCard.tsx` — rack-mount plugin card
- `apps/web/src/components/RackLayout.tsx` — 12-col grid layout

**Docs:** https://react.dev, https://vitejs.dev/

---

## 7. Charts: Recharts

**Why chosen:** Declarative React charting library built on D3 scales. Provides `<AreaChart>`, `<BarChart>`, `<LineChart>`, and `<PieChart>` with responsive containers.

**How used:** `App.tsx` renders charts inline with data from `/api/dashboard/summary` and local telemetry stream.

**Key files:** `apps/web/src/App.tsx`

**Docs:** https://recharts.org/en-US/api

---

## 8. Animations: Motion (Framer Motion)

**Why chosen:** Declarative animation primitives — `motion.div`, `AnimatePresence`, layout animations, spring physics.

**How used:** Components throughout the web app use `motion.div` with variants, `AnimatePresence` for collapsible sections, `whileHover` with springs. Import path: `motion/react` (v12+).

**Key files:** `apps/web/src/App.tsx`, `apps/web/src/components/LatencyHistogram.tsx`

**Docs:** https://motion.dev/docs/react-quick-start

---

## 9. Graph: D3.js

**Why chosen:** Low-level SVG manipulation for custom visualizations. Used for the force-directed swarm visualizer and latency density histogram.

**How used:** The `LatencyHistogram` component uses `d3.scaleLinear()`, `d3.bin()`, axis rendering, neon-glow gradients, enter/update pattern, transition animations, and mouseover tooltips.

**Key files:** `apps/web/src/components/LatencyHistogram.tsx`, `apps/web/src/components/SpatialProjector.tsx`

**Docs:** https://d3js.org/

---

## 10. Validation: Zod

**Why chosen:** Runtime type validation with static type inference via `z.infer<>`. Single schema definition serves as both TypeScript type and runtime validator.

**How used:** Schemas centralized in `packages/types/index.ts`. Used for ingestion validation, governance actions, think tokens, AGC contracts, agent payloads, and skill tags.

**Key files:**
- `packages/types/index.ts` — all Zod schemas and inferred types
- `packages/types/plugin.ts` — `IKudbeePlugin` interface
- `services/lib/agcContract.ts` — `AGCSchema`, `ContractState`

**Docs:** https://zod.dev/

---

## 11. Build: Turborepo

**Why chosen:** Monorepo build orchestrator with caching and parallel execution.

**How used:** `turbo.json` configures pipeline for `build`, `lint`, `dev`, and `start` tasks across workspaces.

**Key files:** `turbo.json`, `package.json`

**Docs:** https://turbo.build/

---

## 12. Deployment: Heroku

**Why chosen:** Cloud application platform with Procfile support.

**How used:** `Procfile` defines `web` (ingestion server) and `worker` (monitor agent) processes. Environment variables injected via GitHub Actions secrets.

**Key files:** `Procfile`, `.github/workflows/verify.yml`

---

## 13. Observability: OpenTelemetry

**Why chosen:** Standardized tracing and observability across the ingestion pipeline.

**How used:** OTel trace ingestion via the telemetry endpoints, stored in `telemetry_traces` table.

**Docs:** https://opentelemetry.io/

---

## 14. CSS: Tailwind CSS v4

**Why chosen:** Utility-first CSS framework with Vite integration via `@tailwindcss/vite` plugin.

**How used:** Configured in `vite.config.ts` with the Tailwind plugin. Utility classes used throughout all React components.

**Key files:** `apps/web/vite.config.ts`

**Docs:** https://tailwindcss.com/

---

## 15. Icons: lucide-react

**Why chosen:** Lightweight, tree-shakeable icon library with consistent design.

**How used:** Icons imported from `lucide-react` throughout the dashboard components.
