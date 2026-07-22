# Kudbee — Technology Stack

---

## 1. Runtime: Node.js 22 + tsx

**Why chosen:** Node.js 22 provides native ESM support, stable `fetch`, `WebSocket`, and `node:test`. Combined with `tsx` for zero-config TypeScript transpilation, the project achieves full-stack TypeScript without a compile step during development.

**How used:** The project root `package.json` declares `"type": "module"`, enabling ESM across all packages. `tsx` strips types at runtime via `esbuild` under the hood — no `tsc` needed for execution. The `tsconfig.json` extends a base config (`packages/config/tsconfig.base.json`) with `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"allowImportingTsExtensions": true`, and `"noEmit": true`. Scripts like `tsx scripts/deploy-check.ts` and `tsx scripts/ingest-topology.ts` in `package.json` demonstrate direct TypeScript execution.

**How ESM works with tsx:** `tsx` loads `.ts` files directly via the Node.js ESM loader hook. Import specifiers must include explicit `.ts` / `.js` extensions (enforced by the project's Immutable Law `EXPLICIT_ESM_EXTENSION`). Cross-workspace packages resolve through npm workspace paths, while ambient `.d.ts` files (`services/lib/db.d.ts`, `services/lib/redis.d.ts`) provide types for plain-JS runtime modules.

**Key files:**
- `package.json` — `"type": "module"`, `tsx` dependency
- `tsconfig.json` — project-wide compiler settings
- `packages/config/tsconfig.base.json` — shared base config
- `services/lib/db.d.ts`, `services/lib/redis.d.ts` — ambient type declarations

**Docs:** https://nodejs.org/docs/latest-v22.x/api/, https://tsx.is

---

## 2. Backend Framework: Express.js

**Why chosen:** Lightweight, unopinionated HTTP server with a well-established middleware ecosystem. Express allows Kudbee to serve both REST APIs and Vite's development middleware from a single process, keeping the monorepo simple.

**How used:** The main entry point is `services/ingestion/server.ts`, which creates an Express app, mounts JSON body parsing and request logging middleware, then registers route handlers inline and via sub-router imports. The server boots on port 3000, and in development mode wraps Vite as middleware so the React SPA and API share one origin.

**Sub-router pattern:** Route modules in `services/ingestion/routes/` (e.g. `telemetry.ts`, `governance.ts`, `audit.ts`) export Express `Router` instances. The server imports and mounts them under `/api/...` prefixes. Phase-based route registration functions (`registerPhase20Routes`, `registerPhase21Routes`, `registerPhase22Routes`) keep the monolithic server organized by feature milestone. The governance router (`services/governance/router.js`) exposes `matchLogic`, `listProposed`, `approveAction`, `rejectAction` for Fast Brain / Slow Brain routing.

**Key files:**
- `services/ingestion/server.ts` — Express app bootstrap, inline routes, Vite middleware
- `services/ingestion/routes/telemetry.ts` — telemetry ingestion routes
- `services/ingestion/routes/governance.ts` — governance action routes
- `services/ingestion/routes/audit.ts` — audit log routes
- `services/governance/router.d.ts` — governance router types

**Docs:** https://expressjs.com/

---

## 3. Database: Neon Postgres + pgvector

**Why chosen:** Neon provides serverless Postgres with auto-scaling and a generous free tier. pgvector extends Postgres with native vector operations, enabling semantic search over embeddings without a separate vector database. This single-database approach reduces operational complexity.

**How used:** The database connection is managed through `services/lib/db.js` (plain JS with an ambient `db.d.ts` declaration). It exposes `getDbPool()`, `isDbHealthy()`, `runQuery()`, and `runInsert()`. All operations are Resilient-First — when the pool is unhealthy, the system degrades to an in-memory fallback.

**Table creation (ALTER TABLE):** Tables are created via `INSERT INTO ...` with pgvector columns declared inline as `$n::vector`. The `system_topology_embeddings`, `think_tokens`, and `vector_memory` tables all use embedding columns of type `vector` (1536-dimensional). Schema ensures idempotent creation — `INSERT ... RETURNING id` on first write creates the row shape.

**pgvector cosine similarity:** pgvector provides the `<=>` operator for cosine distance. Queries use `ORDER BY embedding <=> $1::vector` to rank rows by semantic similarity. The vector store (`services/memory/vectorStore.ts`) wraps this in `searchSimilar()` and `querySystemTopology()`, converting the distance to similarity via `1 - (embedding <=> $1::vector)`. When Neon is unavailable, a JS fallback computes `cosineSimilarity()` manually over the in-memory store.

**Key files:**
- `services/lib/db.js` / `services/lib/db.d.ts` — connection factory
- `services/memory/vectorStore.ts` — pgvector insert/query, cosine similarity, fallback
- `services/memory/thinkTokenGenerator.ts` — think_tokens table writes
- `services/memory/embedText.ts` — 1536-dim text embedding

**Docs:** https://neon.tech/docs, https://github.com/pgvector/pgvector

---

## 4. Cache: Redis / Upstash

**Why chosen:** Redis provides sub-millisecond in-memory operations for caching, pub/sub messaging, circuit breaker state, distributed locks, and audit streams. The `ioredis` client (v5) is used for full Redis protocol support including streams (`XADD`, `XTRIM`), sorted sets (`ZADD`, `ZRANGE`), and key expiry.

**How used — by subsystem:**

| Subsystem | Redis Pattern | Key Prefix |
|-----------|--------------|------------|
| **Pub/Sub channels** | Notify frontend of real-time events | `kudbee:events:v2`, `kudbee:think:tokens` |
| **Lock registry** | AGC contract lease enforcement | `kudbee:contract:*` |
| **Circuit breaker** | State tracking with `INCR`/`EXPIRE` | `kudbee:circuit:*` |
| **Settings store** | Per-tenant config as JSON strings | `kudbee:settings:*` |
| **Audit tracking** | LPUSH/LTRIM list + XADD stream | `kudbee:agent:audit`, `kudbee:agent:stream` |
| **Probation registry** | Sorted set for deadline-based evaluation | `kudbee:probation:pending` / `:resolved` |
| **Query cache** | `SETEX` with TTL for expensive queries | `kudbee:cache:*` |

**Unified event bus:** `services/lib/unifiedEvents.ts` publishes a single-format envelope `{ id, ts, source, kind, data }` to `kudbee:events:v2` while also publishing to legacy channels for backward compatibility. Sources include `worker`, `sentinel`, `receptor`, `governance`, `hermes`, `system`, and `groq`.

**Resilient-First:** Every Redis operation is wrapped in try/catch. If the Redis client is unavailable — whether because `REDIS_URL` is unset or Upstash is down — all subsystems degrade gracefully to in-memory fallbacks. The `getRedisClient()` factory accepts a `label` option for telemetry grouping.

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

**Why chosen:** Groq's LPU (Language Processing Unit) inference engine delivers ultra-low-latency token generation (800+ tokens/sec) via an OpenAI-compatible API. This makes it ideal for real-time Think Token synthesis, receptor gating evaluation, and security firewall analysis — tasks that must complete in under 250ms to avoid blocking agent pipelines.

**How used:** The client adapter (`services/lib/groqClient.ts`) wraps the `@kudbee/utils/llm/providers` abstraction with an `openai-compatible` provider config pointing to `https://api.groq.com/openai/v1`. It exposes three functions:

- `synthesizeThinkToken()` — verifies a reasoning correction delta against its task context, returning `{ verified, reasoning, confidence_adj }`
- `evaluateTokenMatch()` — semantic comparison between guard and candidate token contexts, returning `{ matches, probability, reasoning }`
- `groqSecurityEvaluate()` — firewall threat analysis on telemetry payloads

**Models used:** The default model is `llama-3.1-8b-instant` (overridable via `GROQ_MODEL` env var). The header comment also references `mixtral-8x7b-32768` and `llama-3.3-70b-versatile` as available options.

**Resilient-First:** If `GROQ_API_KEY` is not set, a warning is logged at boot and all exported functions return graceful degradation results (`ok: false` with an error message). The `groqBreaker` circuit breaker in `services/lib/circuitBreaker.ts` opens after 5 consecutive failures and resets after 30 seconds.

**Key files:**
- `services/lib/groqClient.ts` — Groq API adapter, OpenAI-compatible client
- `services/lib/circuitBreaker.ts` — `groqBreaker` instance

**Docs:** https://console.groq.com/docs, https://console.groq.com/docs/models

---

## 6. Frontend: React 19 + Vite

**Why chosen:** React 19 provides server components, improved hydration, and the `use()` hook. Vite 6 offers sub-second HMR, native ESM dev serving, and CSS import support via `@tailwindcss/vite`. Together they create a fast, modern SPA development experience.

**How used:** The web app (`apps/web/`) uses Vite as the build tool and dev server. `vite.config.ts` configures the `@vitejs/plugin-react` plugin, Tailwind CSS v4, path aliases (`@` → `src/`), and dev server proxies (`/api`, `/health`, `/v1` → `http://127.0.0.1:3000`). In production, `vite build` outputs to `dist/`, which Express serves as a static SPA.

**Component structure:** The app follows a flat component directory under `apps/web/src/components/`. Components are organized by feature domain:
- `dashboard/` — CostLedgerCard, DiagnosticTicker
- `gateway/` — ProviderKeyCard, ProviderStatusGrid, RoutingVisualizer
- `playground/` — MultiModelSelector, RagContextDrawer, TokenEstimator
- `governance/` — GovernanceQueueTray, PolicyEnginePanel
- `audit/` — DLQInspector, AuditVaultCard

**PluginCard rack-mount design:** The `PluginCard` component (`apps/web/src/components/PluginCard.tsx`) renders each plugin as a rack-mountable hardware unit with top/bottom rail gradients, screw-dot indicators, I/O connector lights, a status LED, category channel badges, and FAULT/SIGNAL LOST states. The `RackLayout` component (`apps/web/src/components/RackLayout.tsx`) arranges these cards in a 12-column CSS grid, with plugins spanning columns via `gridSpan.colSpan`. Each plugin (ThinkStorm, ThinkStream, ThinkStorage, etc.) is rendered by `renderPlugin()` with real-time data from SSE hooks.

**Zustand stores:** Three lightweight stores manage global state:
- `uiStore.ts` — console expanded/collapsed toggle
- `tenantStore.ts` — multi-tenant selection with localStorage persistence and API-driven tenant list
- `terminalStore.ts` — external console log buffer for the HUD ticker

**Pages:** `pages/dashboard.tsx`, `pages/history.tsx`, `pages/firewall.tsx` (lazy-loaded)

**Key files:**
- `apps/web/package.json` — React 19, Vite 6, TailwindCSS v4
- `apps/web/vite.config.ts` — Vite config, path aliases, proxy
- `apps/web/src/App.tsx` — root component, Recharts integration, motion animations
- `apps/web/src/main.tsx` — React entry point
- `apps/web/src/components/PluginCard.tsx` — rack-mount plugin card
- `apps/web/src/components/RackLayout.tsx` — 12-col grid layout
- `apps/web/src/store/uiStore.ts` — Zustand UI store
- `apps/web/src/store/tenantStore.ts` — Zustand tenant store
- `apps/web/src/store/terminalStore.ts` — Zustand terminal store
- `apps/web/src/registry/frontend-plugins.ts` — plugin registry definitions

**Docs:** https://react.dev/reference/react/19, https://vitejs.dev/

---

## 7. Charts: Recharts

**Why chosen:** Recharts is a composable React charting library built on D3 scales. It provides declarative `<AreaChart>`, `<BarChart>`, `<LineChart>`, and `<PieChart>` components that integrate naturally with React's render cycle and support responsive containers out of the box.

**How used:** The `App.tsx` component imports and renders multiple Recharts chart types inline:
- **AreaChart** — token usage trend sparklines over time windows
- **BarChart** — daily/weekly token input/output comparisons
- **LineChart** — cost trend lines with Cartesian grid axes
- **PieChart** — provider distribution with custom Cell colors

All charts use `<ResponsiveContainer>` for fluid layout and `<Tooltip>` / `<CartesianGrid>` for interactivity. Data is derived from the `/api/dashboard/summary` endpoint and the local telemetry log stream.

**Key files:**
- `apps/web/src/App.tsx` — imports `AreaChart`, `BarChart`, `LineChart`, `PieChart` from recharts

**Docs:** https://recharts.org/en-US/api

---

## 8. Animations: Motion (Framer Motion)

**Why chosen:** Motion (the successor to Framer Motion, v12+) provides declarative animation primitives for React — `motion.div`, `AnimatePresence`, layout animations, and spring physics. It handles mount/unmount transitions, staggered children, and gesture-based interactions with minimal boilerplate.

**How used:** Components throughout the web app use `motion`:
- `motion.div` with `initial`/`animate`/`exit` variants for page sections and cards
- `AnimatePresence` wrapping collapsible UI sections (CSV dropzone, drawers) so elements animate out before unmounting
- `whileHover` with spring physics on interactive cards (project rollup, plugin hover states)
- `variants` and `staggerContainer` for cascading reveals of grid children
- `transition: { type: "spring", stiffness: 150, damping: 12 }` for physical-feeling interactions

The import path `motion/react` reflects the v12+ package structure (vs the legacy `framer-motion`).

**Key files:**
- `apps/web/src/App.tsx` — `motion.div`, `AnimatePresence`, animation variants
- `apps/web/src/components/LatencyHistogram.tsx` — `motion.div` wrapper

**Docs:** https://motion.dev/docs/react-quick-start

---

## 9. Graph: D3.js

**Why chosen:** D3 provides low-level SVG manipulation for custom data visualizations that go beyond pre-built chart components. Kudbee uses D3 for two primary visualizations: the force-directed swarm visualizer and the latency density histogram, both of which require precise control over SVG elements, axes, transitions, and interaction.

**How used:**

**Force-directed swarm visualizer:** The `SpatialProjector` component (`apps/web/src/components/SpatialProjector.tsx`) uses CSS 3D transforms rather than D3 for its projective mapping of Think Trajectory cluster topologies. Coordinates come from the `spatial_coordinates` array of each `ThinkTrajectory`, optionally falling back to a Fibonacci sphere distribution for uniform point placement.

**D3 histogram:** The `LatencyHistogram` component (`apps/web/src/components/LatencyHistogram.tsx`) imports `d3` directly and uses:
- `d3.scaleLinear()` for x/y axes
- `d3.bin()` histogram generator with `x.ticks(14)` for bucket thresholds
- `d3.axisBottom()` / `d3.axisLeft()` for axis rendering with custom tick formatting
- SVG `<defs>` with `<linearGradient>` and `<filter>` for neon-glow bar effects
- `d3.select()` with enter/update pattern for bar rendering
- Transition animations with `duration(750)` and staggered `delay()`
- Mouseover tooltip via `d3.pointer()` positioning
- SVG `<text>` labels for axis titles

**Key files:**
- `apps/web/src/components/LatencyHistogram.tsx` — D3-powered histogram with tooltips, gradients, P95 line
- `apps/web/src/components/SpatialProjector.tsx` — 3D projective mapping of trajectory clusters

**Docs:** https://d3js.org/

---

## 10. Validation: Zod

**Why chosen:** Zod provides runtime type validation with static type inference via `z.infer<>`. This means a single schema definition serves as both the TypeScript type and the runtime validator, eliminating type/validation drift. Zod's `.safeParse()` returns discriminated unions for graceful error handling without try/catch.

**How used:** Schemas are centralized in `packages/types/index.ts` and `packages/types/plugin.ts`. The project uses Zod for:

- **Ingestion validation:** `IngestRequestSchema` (aliased `TelemetryTraceSchema`) validates incoming OpenTelemetry log payloads in `POST /api/telemetry/log`. The server calls `IngestRequestSchema.partial(...).safeParse(req.body)` with partial field overrides to handle flexible input shapes.
- **Vector memory contracts:** `VectorMemoryChunkSchema` validates embedded system-topology chunks before they're stored in pgvector.
- **Governance actions:** `GovernanceActionSchema`, `GovernanceVerifyRequestSchema`, `ApprovalRequestSchema`, and `ApprovalDecisionSchema` enforce strict payload shapes for the HITL approval flow.
- **Think Token lifecycle:** `ThinkTokenSchema` and `ThinkTrajectorySchema` define the canonical shape of semantic memory tokens — embedding arrays, status enums (`PENDING_APPROVAL | VERIFIED | RECYCLED`), KD affinity, efficacy weights, and lock coordination.
- **AGC contracts:** `AGCSchema` in `services/lib/agcContract.ts` locks agent leases with numeric bounds (`maxTokensPerWindow`, `maxMemoryBytes`, `maxLatencyMs`, `minSimilarityScore`, etc.). The kernel verifies tokens against these contracts with `verifyContract()`.
- **Agent payload gating:** `AgentPayloadSchema` validates agent actions with `confidence_score` and `uncertainty_flag` fields used by the probabilistic uncertainty router.
- **Skill tags:** `SkillTagSchema` and `ImmutableLawIdSchema` define dynamic prompt assembly fragments with destructive-flag governance gating.
- **CSV injection:** `CsvInjectRequestSchema` validates bulk log imports.

**Key files:**
- `packages/types/index.ts` — all Zod schemas and inferred types
- `packages/types/plugin.ts` — `IKudbeePlugin` interface, `PluginStatus`, `PluginCategory`
- `services/lib/agcContract.ts` — `AGCSchema`, `ContractState`

**Docs:** https://zod.dev/
