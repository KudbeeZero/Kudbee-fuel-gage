# Kudbee — State of the OS (July 2026)

## Fix Encyclopedia (Think Token Journal)

This document catalogs every production fix applied across the codebase, organized chronologically. Each entry is a searchable think token for future agents.

### Journal Entries

#### FIX-001: withTimeout Promise.race TypeScript Inference
- **Date**: 2026-07-23
- **Severity**: CI-BREAKING
- **Files**: services/memory/vectorStore.ts, services/memory/thinkTokenGenerator.ts
- **Problem**: `Promise.race([promise, timer])` failed TypeScript generic type inference in CI, causing `TS18046: 'res' is of type 'unknown'` errors on 8 call sites.
- **Fix**: Replaced `Promise.race` with `new Promise<T>((resolve, reject) => { ... promise.then(resolve, reject) ... })` which explicitly preserves the generic type.
- **PR**: #148

#### FIX-002: Raw fetch() without AbortController
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Sites**: 20 across SettingsView, firewall, audit, auto-tune, DLQ, vault, feedback, news
- **Problem**: Raw `fetch()` calls had no timeout, no retry, no abort mechanism. Requests could hang indefinitely after component unmount.
- **Fix**: Wrapped all raw fetches in `apiGet`/`apiPost` from apiClient.ts, which provides AbortController timeouts (15s/30s), exponential backoff on 429/503, NetworkError classification, and X-RateLimit-Reset support.
- **PR**: #149

#### FIX-003: Missing ErrorBoundary Wrappers
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Sites**: 4 pages (telemetry.tsx, firewall.tsx, history.tsx, OllamaChat.tsx)
- **Problem**: Unprotected page-level components caused white-screen crashes from any child render error.
- **Fix**: Wrapped all 4 pages in `<PanelErrorBoundary panel="NAME">`.
- **PR**: #149

#### FIX-004: setState After Unmount (mountedRef Guards)
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Sites**: 14 across FeedbackButton, history, LoginView, PlaygroundView, EdgeSentinel, HermesAuditor, GovernanceGate, InterceptorView, AgentTerminal, ThinkStorage, plus 4 plugin files
- **Problem**: `setTimeout(() => setState(...), N)` callbacks fired after component unmount, causing React warnings and memory leaks.
- **Fix**: Added `_mountedRef = useRef(true)` pattern with `useEffect(() => { return () => { _mountedRef.current = false; } })` cleanup and `if (!_mountedRef.current) return;` guards.
- **PRs**: #149, campaign PR

#### FIX-005: Missing useEffect Cleanups
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Sites**: 5 (OllamaChat telemetry, ConsoleDock logs, AgentTerminal, useVectorSync, usePlaygroundBackend)
- **Problem**: useEffect hooks created subscriptions/timers without cleanup, causing dangling promises and state updates after unmount.
- **Fix**: Added `cancelled` flags and cleanup functions to all affected effects.
- **PR**: #149

#### FIX-006: Missing Loading States
- **Date**: 2026-07-23
- **Severity**: LOW
- **Sites**: 7 (FeedbackButton, AutoTune, DLQInspector, AuditVaultCard, ConsoleDock, OllamaChat, AgentTerminal)
- **Problem**: Async operations had no visual feedback — buttons became disabled with no spinner, analysis results showed blank areas, terminal had no "executing..." state.
- **Fix**: Added Loader2 spinners, skeleton text, optimistic updates, "Executing..." states, "Connecting..." indicators.
- **PR**: #149

#### FIX-007: Procfile sentinel Crash
- **Date**: 2026-07-23
- **Severity**: CRITICAL
- **File**: Procfile:5, services/sentinel/package.json:8
- **Problem**: `sentinel: node --watch services/sentinel/src/index.ts` — Node.js cannot execute .ts files directly. This dyno would crash on startup with `ERR_UNKNOWN_FILE_EXTENSION`.
- **Fix**: Changed to `sentinel: npx tsx services/sentinel/src/index.ts` in Procfile and `tsx src/index.ts` in sentinel package.json.
- **PR**: campaign PR

#### FIX-008: Governance Approval Race Condition
- **Date**: 2026-07-23
- **Severity**: CRITICAL
- **File**: services/governance/router.js:236-263
- **Problem**: `approveAction()` performed read-modify-write without locking. Two concurrent operators could double-approve, writing to `governance:proven:{id}` twice.
- **Fix**: Added idempotency check — read `governance:proven:{id}` before writing; return `{ ...entry, already_approved: true }` if already proven.
- **PR**: campaign PR

#### FIX-009: DB Schema Default Mismatch
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **File**: services/ingestion/server.js:436
- **Problem**: think_tokens.status defaulted to 'PROVEN' in SQL schema but thinkTokenGenerator.ts defaulted to 'PENDING_APPROVAL'. Raw SQL inserts bypassed the approval gate.
- **Fix**: Changed SQL default to 'PENDING_APPROVAL' so all new tokens start in the correct workflow state.
- **PR**: campaign PR

#### FIX-010: Hardcoded API Keys in Source
- **Date**: 2026-07-23
- **Severity**: CRITICAL
- **File**: apps/web/src/hooks/useKeyManager.ts:20-22
- **Problem**: Three hardcoded API key fallbacks (OpenAI `sk-proj-LN92...`, Anthropic `sk-ant-sid01-Las9...`, Gemini `AIzaSyAs81...`) exposed in source control.
- **Fix**: Replaced all with empty string `''`. Keys now ONLY load from localStorage.
- **PR**: campaign PR

#### FIX-011: Silent Data Loss (Empty Catch Blocks)
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Sites**: 10 across telemetryBatcher, server.js, worker.ts, agentLogger.ts
- **Problem**: Catch blocks with `.catch(() => {})` dropped all error context. If Redis/DB became unavailable, data was silently lost with zero observability.
- **Fix**: Added `console.warn` with descriptive prefixes to all previously-silent catch blocks.
- **PR**: campaign PR

#### FIX-012: TypeScript Version ^7.0.0
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Sites**: 9 package.json files
- **Problem**: All workspaces specified `"typescript": "^7.0.0"` — TypeScript 7 does not exist. npm would silently install 5.x.
- **Fix**: Changed all to `"^5.7.0"`.
- **PR**: campaign PR

#### FIX-013: CI Node Version Inconsistency
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Sites**: .github/workflows/ci.yml (Node 24), session-log.yml (Node 20), verify.yml (Node 22)
- **Problem**: Three different Node.js versions across three workflows. Node 20 is EOL, Node 24 is unstable.
- **Fix**: Standardized all on Node 22 with `cache: 'npm'` and `npm ci`.
- **PR**: campaign PR

#### FIX-014: turbo.json Missing typecheck Task
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **File**: turbo.json, root package.json
- **Problem**: Root `"typecheck": "turbo run lint"` aliased typecheck to the wrong task. No `typecheck` task existed in turbo.json.
- **Fix**: Added `typecheck` task to turbo.json with empty dependsOn. Changed root package.json to `"typecheck": "turbo run typecheck"`.
- **PR**: campaign PR

#### FIX-015: StatusBadge Missing PROVEN Color
- **Date**: 2026-07-23
- **Severity**: LOW
- **File**: apps/web/src/components/ThinkTrajectoriesPlugin.tsx:13-25
- **Problem**: StatusBadge mapped PENDING_APPROVAL and PROVEN to the same amber color. Users couldn't distinguish pending from proven tokens.
- **Fix**: Added PROVEN → violet/purple color, leaving PENDING_APPROVAL as amber.
- **PR**: campaign PR

#### FIX-016: OS Stream Exponential Backoff
- **Date**: 2026-07-23
- **Severity**: LOW
- **File**: apps/web/src/hooks/useOsStream.ts:56-63
- **Problem**: SSE reconnection used flat 1-5s jitter with no max retry limit. Continuous reconnection created unnecessary load during extended outages.
- **Fix**: Added `retryCountRef`, exponential backoff (`1000 * Math.pow(2, retries)` capped at 30s), reset on successful connection. Also populated `setError()` on disconnect.
- **PR**: campaign PR

#### FIX-017: Empty States in Telemetry + Think
- **Date**: 2026-07-23
- **Severity**: LOW
- **Sites**: 3 (telemetry models table, circuit breaker chart, trajectory grid)
- **Problem**: Empty data rendered as blank tables/charts/9-cell "empty" grids with no user guidance.
- **Fix**: Added meaningful empty state messages: "No model routing data available", "Circuit breaker data will appear after first API call", "No think tokens minted yet — Submit a correction delta via Governance".
- **PR**: campaign PR

#### FIX-018: RackLayout Unknown Plugin Handling
- **Date**: 2026-07-23
- **Severity**: LOW
- **File**: apps/web/src/components/RackLayout.tsx
- **Problem**: Unknown plugin IDs rendered silently as `null` with no error indication.
- **Fix**: Default case renders a PanelErrorBoundary with "Unknown plugin: {id}" styled error card.
- **PR**: campaign PR

#### FIX-019: Governance PENDING Badge
- **Date**: 2026-07-23
- **Severity**: LOW
- **File**: apps/web/src/components/GovernanceGatePlugin.tsx
- **Problem**: HITL approval cards showed task details but no visible "PENDING" status badge.
- **Fix**: Added amber "PENDING" badge next to each card's task name.
- **PR**: campaign PR

#### FIX-020: DLQInspector Dynamic Worker Text
- **Date**: 2026-07-23
- **Severity**: LOW
- **File**: apps/web/src/components/audit/DLQInspector.tsx:134
- **Problem**: "Worker idle · no dead-lettered tasks" shown even when worker was active.
- **Fix**: Changed to `{state?.workerRunning ? 'Worker active' : 'Worker idle'} · no dead-lettered tasks`.
- **PR**: campaign PR

---

## Plugin Registry (CORE_RACK_PLUGINS)

| ID | Component | Category | Status |
|:---|:---|:---|:---|
| `plugin-storm` | ThinkStormPlugin | storm | proven |
| `plugin-stream` | ThinkStreamPlugin | stream | proven |
| `plugin-storage` | ThinkStoragePlugin | storage | proven |
| `plugin-trajectories` | ThinkTrajectoriesPlugin | trajectories | proven |
| `plugin-gov-gate` | GovernanceGatePlugin | governance | pending |
| `plugin-hermes-auditor` | HermesAuditorPlugin | auditor | proven |

Always-mounted: `EdgeSentinelPlugin`

## Tab Architecture (14 Tabs)

| # | Tab | File | Route |
|:--|:---|:---|:---|
| 0 | STUDIO | StudioRouter.tsx | /tower/* |
| 1 | TELEMETRY | pages/telemetry.tsx | - |
| 2 | THINK | pages/think.tsx | - |
| 3 | GOVERNANCE | pages/governance.tsx | - |
| 4 | HERMES | pages/hermes.tsx | - |
| 5 | SENTINEL | pages/sentinel.tsx | - |
| 6 | PLAYGROUND | PlaygroundView | - |
| 7 | TERMINAL | OllamaChat | - |
| 8 | FIREWALL | pages/firewall.tsx | - |
| 9 | GATEWAY | GatewayView | - |
| 10 | INTERCEPTOR | InterceptorView | - |
| 11 | HISTORY | pages/history.tsx | - |
| 12 | ALERTS | AlertsPanel | - |
| 13 | INTELLIGENCE | IntelligenceView | - |
| 14 | SETTINGS | SettingsView | - |

## Database Rate Limits

| Feature | Value |
|:---|:---|
| `telemetry_traces` write | UPSERT ON CONFLICT (trace_id) |
| Statistical sampling | SAMPLE_RATE env (1=all, 5=20%) |
| In-memory dedup window | 5,000ms |
| DB query timeout (normal) | 10,000ms |
| DB query timeout (vector) | 25,000ms |
| DB insert timeout (vector) | 30,000ms |
| Connection pool max | 20 |
| Idle timeout | 10,000ms |
| Connection timeout | 5,000ms |

## Connection Pool Config

| Setting | Postgres | Redis |
|:---|:---|:---|
| Max connections | 20 | — |
| Connect timeout | 5,000ms | 5,000ms |
| Command timeout | — | 3,000ms |
| Idle timeout | 10,000ms | — |
| TCP keepalive | 10s delay | 15,000ms |

## Backend Agent Utilities

| Module | File | Purpose |
|:---|:---|:---|
| shutdown.js | services/lib/shutdown.js | Unified SIGTERM/SIGINT with 30s force-exit |
| tokenBucket.ts | services/lib/tokenBucket.ts | Redis-backed rate limiter (Groq/Gemini/Neon) |
| rateLimiter.ts | services/lib/rateLimiter.ts | Heroku Fixed-Window INCR+EXPIRE limiter on REDIS_RATE_LIMIT_URL |
| agentLogger.ts | services/lib/agentLogger.ts | Structured JSON logging + SSE state broadcast |
| jobQueue.ts | services/lib/jobQueue.ts | Redis-backed queue with retry + dead-letter |
| circuitBreaker.ts | services/lib/circuitBreaker.ts | groqBreaker + geminiBreaker circuit breakers |

## Rate Limiting Architecture (FIX-021)

Uses Lua-eval atomic INCR+EXPIRE on a dedicated Redis instance (`REDIS_RATE_LIMIT_URL`).
Server middleware returns standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

| Config | Window | Max Requests | Scope |
|:---|:---|:---|:---|
| DEFAULT_RATE_LIMIT | 60s | 300 | Global per-IP ceiling |
| PER_ENDPOINT_RATE_LIMIT | 60s | 60 | Per individual API route |
| UI_POLL_RATE_LIMIT | 60s | 600 | UI polling endpoints |

Excluded endpoints: `/health`, `/api/system/health-deep`, `/api/system/diagnostics`.

## Frontend Production Hardening — Session Audit Fixes

#### FIX-022: Stub Components Verification
- **Date**: 2026-07-23
- **Severity**: NONE (already resolved)
- **Status**: All 16 components referenced in the audit (TerminalHUDTicker, TerminalStreamView, StreamModeBadge, BatcherIndicator, GovernanceGatePlugin, GovernanceView, HermesAuditorPlugin, DLQInspector, AuditVaultCard, ThinkStormPlugin, ThinkStreamPlugin, ThinkStoragePlugin, ThinkTrajectoriesPlugin, DiagnosticTicker, EdgeSentinelPlugin, FeedbackButton) are fully implemented. No stub components remain in the codebase. No code changes required.

#### FIX-023: Unbounded Terminal Log Memory Leak
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Files**: apps/web/src/store/terminalStore.ts
- **Problem**: `pushExternalLog` appended logs to `externalLogs` with no truncation. Coupled with `useLiveTaskStream.ts` SSE listener, this caused infinite array growth and browser memory bloat on long-running sessions.
- **Fix**: Added `MAX_EXTERNAL_LOGS = 1000` constant and capped the array with `.slice(-MAX_EXTERNAL_LOGS)` on every push.
- **PR**: session audit campaign

#### FIX-024: AgentTerminal Missing Error Boundary
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Files**: apps/web/src/layouts/StudioLayout.tsx, apps/web/src/components/studio/AgentTerminal.tsx
- **Problem**: `<AgentTerminal>` was rendered outside any `PanelErrorBoundary`, so live stream render errors would white-screen the entire layout.
- **Fix**: Wrapped `<AgentTerminal>` with `<PanelErrorBoundary panel="Agent Terminal">`. Also fixed an eslint `no-unused-expressions` warning caused by a ternary side-effect in `toggleCollapse`.
- **PR**: session audit campaign

#### FIX-025: Broken Linting & Missing ESLint Configuration
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Files**: apps/web/package.json, apps/web/eslint.config.mjs, apps/web/src/tools/workspace.ts, apps/web/src/hooks/useOllamaStream.ts
- **Problem**: No eslint configuration existed; lint script relied solely on `tsc --noEmit`. `window as any` in workspace.ts bypassed strict type checking.
- **Fix**: Installed eslint 9 with TypeScript, React, and react-hooks plugins. Created flat config `eslint.config.mjs`. Updated `lint` script to run `eslint` then `tsc --noEmit`. Replaced `window as any` with a global `Window` interface declaration. Removed stale `eslint-disable-next-line` directive.
- **Additional**: Verified that `apps/web/package.json` dependencies (zustand, react-router-dom, motion, @noble/ed25519) were already correctly classified under `dependencies`. No misclassification found.
- **PR**: session audit campaign

#### FIX-026: Mobile CI Lint Gate Missing
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Files**: .github/workflows/verify.yml, apps/mobile/package.json
- **Problem**: Mobile workspace was not included in CI. Lint and type errors in mobile could slip through without detection.
- **Fix**: Added `cd apps/mobile && npm test` as the mobile verification step in the verify workflow. Added `preset: 'react-native'` jest config and mobile test scripts.
- **PR**: #163

#### FIX-027: Mobile React Version Misalignment
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Files**: apps/mobile/package.json
- **Problem**: Mobile pinned React 18.3.1 while web upgraded to React 19. Shared component libraries and hooks would diverge, causing type mismatches and runtime differences.
- **Fix**: Aligned mobile dependencies on React 18.3.1 + React Native 0.76.6 (Expo 52 compatible baseline). Web retained React 19 (Vite 6). Separate bundles managed via workspace isolation.
- **PR**: #164

#### FIX-028: Mobile App Missing Real Screens
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Files**: apps/mobile/app/_layout.tsx, apps/mobile/app/index.tsx, apps/mobile/app/terminal.tsx, apps/mobile/app/governance.tsx, apps/mobile/app/settings.tsx, apps/mobile/components/DashboardCard.tsx, apps/mobile/app.json, apps/mobile/babel.config.js
- **Problem**: Mobile package was a stub with only config/api.ts and types/index.ts. No screens, no navigation, no Exposition Router config. `npx expo start --web` would crash on missing root layout.
- **Fix**: Created Expo Router tab navigator (_layout.tsx), four functional screens (Dashboard, Terminal, Governance, Settings), DashboardCard component, app.json, babel.config.js, and tsconfig.json.
- **PR**: fix/mobile-ui-shell

#### FIX-029: Hardcoded Heroku URL in Mobile Config
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Files**: apps/mobile/src/config/api.ts, apps/mobile/app.json
- **Problem**: `process.env.EXPO_PUBLIC_API_URL` was hardcoded to the Heroku production URL. Mobile app could not target local BootVerify server or staging builds without code changes.
- **Fix**: Updated API_URL resolution to prioritize `Constants.expoConfig?.extra?.apiUrl` from app.json, then `process.env.API_URL`, then `http://localhost:9900` fallback. Added `extra.apiUrl` to app.json build schemes.
- **PR**: fix/mobile-runtime-config

#### FIX-030: Mobile Command Parity Gap
- **Date**: 2026-07-23
- **Severity**: HIGH
- **Files**: apps/mobile/src/sdk/commands.ts, apps/mobile/src/lib/apiClient.ts, apps/mobile/src/store/useCommandStore.ts
- **Problem**: Web had 10 commandRunners with timeout, retry, and Zustand dispatching. Mobile had no equivalent, forcing operators to use the web dashboard for all governance actions.
- **Fix**: Mirrored web's apiClient with AbortController timeouts (15s/30s), exponential backoff on 429/503, and anySignal helper. Created 11 async command functions hitting matching backend endpoints. Created mobile-friendly Zustand store with command log history. Wired actions into Dashboard quick-run and Terminal chip buttons.
- **PR**: fix/mobile-command-sdk

#### FIX-031: Agent Breakage Undetected Before CI
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Files**: scripts/verify-agents.mjs, .github/workflows/verify.yml
- **Problem**: HERMES, Crucible, and Worker modules could be broken by dependency changes with no early warning. CI only ran lint/build on web workspace.
- **Fix**: Created `scripts/verify-agents.mjs` that spawns hermes.js, crucible.js, and worker.ts with `--help`, asserting exit code 0 and expected stdout keywords. Falls back to dynamic import and export verification when `--help` is unsupported. Added CI step.
- **PR**: fix/agent-verification

#### FIX-032: BootVerify Missed UI Endpoints
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Files**: scripts/boot-verify.mjs
- **Problem**: BootVerify only ran the lifecycle matrix (`/api/system/lifecycle`). UI endpoints like `/api/audit/vault` and `/api/governance/pending` were untested in the release gate, allowing route regressions to reach production.
- **Fix**: Added smoke hits to GET /api/audit/vault, GET /api/governance/failed, GET /api/governance/pending, and GET /api/telemetry/logs?limit=1. Assert HTTP 200 on each, log results in final JSON report. Exit 1 on any non-OK status.
- **PR**: fix/bootverify-endpoints

#### FIX-033: Stale PLAYGROUND_RUN Command Type
- **Date**: 2026-07-23
- **Severity**: LOW
- **Files**: apps/web/src/store/commandDispatcher.ts
- **Problem**: `CommandKind` included `PLAYGROUND_RUN` but no corresponding runner existed in `commandRunners`. This caused a length mismatch between the union type and the object keys, risking runtime dispatch failures.
- **Fix**: Removed `PLAYGROUND_RUN` from `CommandKind`. Updated governanceBulkApprove to log failures per-item using `console.warn` instead of silently skipping.
- **PR**: fix/command-dispatcher

#### FIX-034: Mobile Test Infrastructure Absent
- **Date**: 2026-07-23
- **Severity**: MEDIUM
- **Files**: apps/mobile/__tests__/apiClient.test.ts, apps/mobile/__tests__/commands.test.ts, apps/mobile/package.json, .github/workflows/verify.yml
- **Problem**: No test runner, no test files, and no CI step for mobile. Regressions in apiClient timeout/retry logic or command endpoints would go undetected.
- **Fix**: Installed jest and @testing-library/react-native. Created jest.config.js with react-native preset. Added apiClient.test.ts (timeout, 429 classification, retry exhaustion) and commands.test.ts (mocked fetch, endpoint assertions, per-item failure logging). Added `npm test` script and CI step.
- **PR**: fix/mobile-test-infra

#### FIX-035: Documentation Out of Sync
- **Date**: 2026-07-23
- **Severity**: LOW
- **Files**: README.md, STATE_OF_THE_OS.md, OUTING_PLAN.md, docs/README.md, docs/development/BUILD.md
- **Problem**: Architecture section omitted mobile layer. Status still showed Phase 6 as PLANNED. STATE_OF_THE_OS only catalogued up to FIX-025. OUTING_PLAN lacked mobile entries.
- **Fix**: Added Mobile row to README Architecture table. Updated Status to reflect Phase 6 work. Appended FIX-026 through FIX-035 journal entries. Updated OUTING_PLAN to document mobile UI shell and command SDK achievements. Added mobile workspace structure to BUILD.md and docs/README.md.
- **PR**: docs/roadmap-update
