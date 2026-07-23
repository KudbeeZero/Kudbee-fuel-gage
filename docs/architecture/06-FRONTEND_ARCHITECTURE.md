# 06 — Frontend Architecture

## Overview

The Kudbee Control Tower is a React 19 SPA built with Vite 6 and Tailwind CSS v4. It renders the dashboard as a **rack-mount hardware console** with 17+ specialized plugin cards, real-time SSE data streams, and a keyboard-driven command palette.

---

## Technology Stack

| Technology | Version | Purpose |
|:---|:---|:---|
| React | 19 | UI framework with concurrent rendering |
| Vite | 6 | Build tool and dev server |
| Tailwind CSS | v4 | Utility-first CSS framework |
| Zustand | latest | Lightweight global state management |
| Recharts | latest | Declarative charting (Area, Bar, Line, Pie) |
| D3.js | latest | Custom SVG visualization (latency histogram) |
| Motion | v12+ | Animation library (successor to Framer Motion) |
| lucide-react | latest | Icon library |

---

## Component Tree

```
App.tsx
├── OSControlBar                    # System taskbar
│   ├── HealthIndicator             # PG/Redis health lights
│   ├── Fleet status                # Agent fleet indicators
│   └── System controls             # Crucible, Groq archives
├── WorkspaceBar                    # Tabbed workspace switching
├── [Route: /]
│   └── Dashboard (dashboard.tsx)
│       ├── RackLayout              # 12-column CSS grid container
│       │   ├── PluginCard          # Rack-mount hardware unit shell
│       │   │   ├── ThinkStormPlugin     # Live token injection
│       │   │   ├── ThinkStreamPlugin    # Thought stream log
│       │   │   ├── ThinkStoragePlugin   # Vector memory stats
│       │   │   ├── ThinkTrajectoriesPlugin # 3D projection
│       │   │   ├── GovernanceGatePlugin     # Approval queue
│       │   │   ├── HermesAuditorPlugin      # HERMES log viewer
│       │   │   ├── HealthMatrixPlugin       # System health grid
│       │   │   ├── ThreatHeatmapPlugin      # Firewall threat map
│       │   │   ├── EnergyDecayPlugin        # E(token) thermodynamics
│       │   │   ├── TokenDictionaryPlugin    # Victory memory lookup
│       │   │   ├── UnionMonitorPlugin       # Nash union status
│       │   │   ├── EdgeSentinelPlugin       # Live ingress monitor
│       │   │   ├── AnomalyFeedPlugin        # Low-confidence alerts
│       │   │   ├── ContractMonitorPlugin    # AGC contract watch
│       │   │   ├── ProbationDocketPlugin    # Agent probation cases
│       │   │   ├── AlertsPanel              # Alert history
│       │   │   └── TriageView               # Firewall violation queue
│       │   ├── SkeletonPanel        # Loading placeholder
│       │   └── PanelErrorBoundary   # Per-panel error isolation
│       ├── ApprovalQueueTray        # HITL governance tray
│       ├── GovernanceToast         # Notification toasts
│       ├── ConsoleDock             # Terminal console
│       ├── TerminalHUDTicker       # Live log ticker
│       ├── SubscriptionMeter       # Usage/billing gauge
│       └── FeedbackButton          # User feedback widget
├── [Route: /history] (lazy-loaded)
│   └── History page (history.tsx)
├── [Route: /firewall] (lazy-loaded)
│   └── Firewall page (firewall.tsx)
│       └── LiveInterceptor        # Real-time firewall events
├── [Route: /playground]
│   └── PlaygroundView
│       ├── MultiModelSelector     # LLM model picker
│       ├── RagContextDrawer       # RAG context browser
│       ├── TokenEstimator         # Cost calculator
│       └── CostAnalysisPanel      # Cost breakdown
├── [Route: /gateway]
│   └── GatewayView
│       ├── ProviderKeyCard        # API key management
│       ├── ProviderStatusGrid     # Provider health grid
│       └── RoutingVisualizer      # Request routing graph
├── [Route: /governance]
│   └── GovernanceView
│       ├── GovernanceQueueTray    # Action queue
│       └── PolicyEnginePanel      # Policy configuration
└── [Route: /intelligence]
    └── IntelligenceView
```

---

## Zustand Stores

Global state managed by three lightweight Zustand stores with no middleware or devtools overhead.

### `uiStore.ts`

```typescript
interface UIState {
  isConsoleExpanded: boolean;
  toggleConsole: () => void;
}
```

Controls the terminal console dock expand/collapse state.

### `tenantStore.ts`

```typescript
interface TenantState {
  selectedTenant: string;
  tenants: string[];
  setSelectedTenant: (id: string) => void;
  setTenants: (list: string[]) => void;
}
```

Multi-tenant selection with `localStorage` persistence and API-driven tenant list. Used by settings and preference endpoints.

### `terminalStore.ts`

```typescript
interface TerminalState {
  logs: string[];
  appendLog: (msg: string) => void;
  clearLogs: () => void;
}
```

External console log buffer for the HUD ticker component.

### `commandDispatcher.ts`

Keyboard-driven command dispatch for the Cmd+K palette. Maps command names to actions (navigate, toggle, run).

---

## SSE Hooks (Real-Time Data)

The dashboard polls the backend at **5-second intervals** via these hooks. All hooks are Resilient-First — failures degrade to empty/default state, never throw.

### Core Data Hooks

| Hook | Source | Purpose |
|:---|:---|:---|
| `useTelemetryStream` | `GET /api/telemetry/stream` | Live telemetry data feed |
| `useGovernanceStream` | `GET /api/governance/pending` | HITL approval queue; exposes `submitApproval(id, decision)` |
| `useThinkStream` | `GET /api/think/archive` | Chain-of-thought archive stream |
| `useThinkTrajectories` | `GET /api/think/trajectories` | 3D trajectory data |
| `useThinkGovernanceStream` | Various think endpoints | Combined think + gov stream |
| `useHistoryStream` | `GET /api/telemetry/logs` | Telemetry log history |
| `useTaskStream` | Task queue | Background task monitoring |
| `useLiveTaskStream` | Live events | Real-time task event stream |
| `useEventStream` | SSE events | Server-sent event listener |
| `useStreamEngine` | SSE core | Base SSE engine hook |

### Status & Diagnostics Hooks

| Hook | Source | Purpose |
|:---|:---|:---|
| `useGovernanceHealth` | `GET /api/governance/health` | HERMES status + proposed count |
| `useSystemDiagnostics` | `POST /api/system/lifecycle` | Health matrix (PG, Redis, Groq, worker) |
| `useProviderStatus` | Provider checks | LLM provider availability |
| `useDegradationStatus` | `GET /api/telemetry/degradation-status` | Circuit breaker state |
| `useOnlineStatus` | `navigator.onLine` | Browser connectivity |
| `useBackoffHandling` | Retry logic | Exponential backoff for failed requests |
| `usePanelTrace` | React DevTools | Component performance traces |

### Specialized Hooks

| Hook | Source | Purpose |
|:---|:---|:---|
| `useTelemetrySearch` | Search API | Full-text search over telemetry |
| `useTelemetryLogger` | Telemetry write | Telemetry event dispatch |
| `useCostLedger` | `GET /api/dashboard/summary` | Cost tracking data |
| `useKeyManager` | Key API | API key management |
| `useRoutingRules` | Gateway API | Provider routing configuration |
| `usePlaygroundBackend` | Playground API | Playground backend operations |
| `useAuditExport` | Audit API | Audit data export |
| `useVectorSync` | Memory API | Vector memory synchronization |
| `usePersistentState` | `localStorage` | Persisted state with sync |
| `useInterval` | Timer | Declarative `setInterval` hook |

---

## API Client

**Implementation:** `apps/web/src/lib/apiClient.ts`

Centralized HTTP client for all frontend API calls.

- Base URL: `REACT_APP_API_URL` env var (empty = same-origin)
- Content-Type: `application/json`
- Error handling: graceful degradation; never throws unhandled errors
- Resilient-First: all calls wrapped in try/catch with fallback return values

---

## Error Boundaries

| Component | File | Purpose |
|:---|:---|:---|
| `ErrorBoundary` | `apps/web/src/components/ErrorBoundary.tsx` | Top-level React error boundary wrapping `App` |
| `PanelErrorBoundary` | `apps/web/src/components/PanelErrorBoundary.tsx` | Per-plugin-panel isolation; prevents one crashed plugin from taking down the dashboard |

`PanelErrorBoundary` renders a `SkeletonPanel` as fallback, ensuring the rack grid layout is preserved even when individual plugins fail.

---

## Plugin Registry

**Implementation:** `apps/web/src/registry/frontend-plugins.ts`

### Core Rack Plugins

```typescript
CORE_RACK_PLUGINS: Record<string, IKudbeePlugin>
```

### IKudbeePlugin Interface (`packages/types/plugin.ts`)

```typescript
interface IKudbeePlugin {
  id: string;
  title: string;
  category: PluginCategory;  // storm | stream | storage | trajectories | governance | metric | adapter | auditor
  status: PluginStatus;       // active | degraded | offline | pending | standby
  gridSpan: GridSpan;          // { colSpan: number; rowSpan?: number }
  requiresApprovalGate?: boolean;
}
```

### Rack-Mount Design

Each `PluginCard` renders as a **rack-mountable hardware unit** with:

- Top/bottom rail gradients
- Screw-dot indicators
- I/O connector lights
- Status LED (active/degraded/offline/fault/signal-lost)
- Category channel badges
- Collapsible panel with real-time data from SSE hooks

The `RackLayout` arranges cards in a **12-column CSS grid**, with plugins spanning columns via `gridSpan.colSpan`.

---

## Spatial Projector

**Implementation:** `apps/web/src/components/SpatialProjector.tsx`

3D projective mapping of Think Trajectory cluster topologies using CSS 3D transforms. Coordinates come from `spatial_coordinates[]` on `ThinkTrajectory` objects; falls back to Fibonacci sphere distribution.

## Latency Histogram

**Implementation:** `apps/web/src/components/LatencyHistogram.tsx`

D3-powered histogram with:
- `d3.scaleLinear()` for x/y axes
- `d3.bin()` histogram generator (14 ticks)
- SVG `<linearGradient>` + `<filter>` neon-glow effects
- Mouseover tooltip via `d3.pointer()` positioning
- Transition animations with `duration(750)` and staggered delays
- P95 latency reference line

## Recharts Integration

Four chart types rendered inline in `App.tsx`:

- **AreaChart** — token usage trend sparklines
- **BarChart** — daily/weekly token comparisons
- **LineChart** — cost trend lines with Cartesian grid
- **PieChart** — provider distribution with custom cell colors

---

## OS Stream (Unified Polling Replacement)

**Endpoint**: `GET /api/os-stream` (SSE, 5s interval)

The OS Stream consolidates 8+ polling endpoints into a single persistent SSE connection. Instead of each panel polling its own endpoint independently (45+ active setIntervals), the OS Stream pushes a unified state snapshot every 5 seconds.

**Event**: `os:snapshot` with payload:
```json
{
  "ts": "ISO timestamp",
  "uptime": seconds,
  "services": { "postgres": { "ok": bool, "latencyMs": number }, "redis": { ... } },
  "governance": { "pending": number },
  "think": { "tokens": number, "verified": number },
  "memory": { "vectors": number, "chunks": number },
  "alerts": number
}
```

**Frontend integration**: `OsStreamProvider` (React Context) + `useOsSnapshot()` hook. Wired into App.tsx header status bar, footer PING indicator, and governance pending counter. Includes jittered reconnection on error (1-5s).

## New Resilience Hooks

### `useRateThrottle(maxRequestsPerMinute)`
Token bucket algorithm for client-side rate limiting. Returns `{ tryConsume }` — call before any fetch to check if request is allowed.

### `useAdaptivePolling(callback, baseIntervalMs, healthLevel)`
Health-aware polling that scales intervals based on backend health: HEALTHY→1x, DEGRADED→2x, OFFLINE→4x.

### `useVisibilityPolling(callback, intervalMs)`
Auto-pauses polling when browser tab is hidden (via `document.visibilityState`).

### `useOnlineStatus()`
Monitors `navigator.onLine` and `window.addEventListener('online'/'offline')` events.

### `useBackoffHandling()`
Exponential backoff state management with hardcoded server timeout/rate-limit constants. Returns `{ isFrozen, backoffState, onFetchError }`.

### ConnectionBanner
Vue-like alert component that shows when OS Stream disconnects or backend services are unhealthy. Uses `useOsSnapshot()` to detect connection state.

## Telemetry Batcher

**File**: `apps/web/src/lib/telemetryBatcher.ts`

Module-level batching queue that accumulates telemetry events for 1000ms (or 50 events, whichever comes first) and flushes through `POST /api/telemetry/ingest/batch`. Used by `useTelemetryLogger.ts` to reduce DB write pressure.

## apiClient Network Resilience

**File**: `apps/web/src/lib/apiClient.ts`

| Feature | Behavior |
|:---|:---|
| Timeout | AbortController-based: 15s GET, 30s POST |
| 429/503 Retry | Jittered exponential backoff with `Retry-After` / `X-RateLimit-Reset` header support |
| NetworkError | Typed error class for timeout/offline classification |
| Jitter | `Math.random() * 1000` added to all retry delays to prevent thundering herd |

All use `<ResponsiveContainer>` + `<Tooltip>` + `<CartesianGrid>`.

## Motion Animations

Components use `motion.div` from `motion/react` (v12+) with:
- `initial` / `animate` / `exit` variants for page transitions
- `AnimatePresence` wrapping collapsible sections
- `whileHover` with spring physics (`stiffness: 150, damping: 12`)
- `staggerContainer` variants for cascading grid reveals
