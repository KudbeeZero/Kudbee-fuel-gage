# 01 - Header & Taskbar Architecture

> Kudbee Dashboard OS Control Bar, Workspace Switcher, Health Indicator, and Terminal HUD Ticker

## Component Tree — Header Region (Bottom OS Taskbar)

```
App.tsx (DashboardView)
├── OSControlBar.tsx                       [Bottom-fixed OS taskbar]
│   ├── ToggleChip "DB INGESTION"          [localStorage toggle]
│   ├── ToggleChip "STREAM LIVE"           [localStorage toggle]
│   ├── ToggleChip "PULSE ARMED"           [localStorage toggle]
│   ├── MANUAL PULSE button                → commandRunners.crucibleDispatch() → apiPost /api/governance/dispatch
│   ├── RESYNC button                      → commandRunners.resyncVector()     → apiPost /api/telemetry/ingest
│   ├── WorkspaceBar.tsx                   [Workspace switcher dropdown]
│   ├── DispatchStatus                     [Shows last dispatched command state]
│   ├── Search button (Cmd+K)              → Opens CommandPalette
│   └── Clock                              [locale time, 1s interval]
├── CommandPalette.tsx (inlined in OSControlBar)
│   ├── Navigate commands                  → onNavigate(tab)
│   ├── Dispatch commands                  → commandRunners.*
│   └── Diagnostic commands                → apiGet /api/dashboard/summary (ping)
│                                          → apiGet /api/system/diagnostics
├── WorkspaceBar.tsx
│   └── useTenantStore                     → apiGet /api/governance/tenants
├── HealthIndicator.tsx                    [Traffic light — stateless, prop-driven]
│   └── Used in DashboardPage (via App.tsx status bar)
├── TerminalHUDTicker.tsx
│   └── apiGet /api/news/headlines         [60s polling, AbortController]
└── Status Bar (in App.tsx header)
    ├── pgHealthy/redisHealthy indicators  [computed from DashboardSummary]
    ├── Governance status                   → useGovernanceHealth (apiGet /api/governance/health, 5s poll)
    └── HERMES auditor status               → useGovernanceHealth
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  STORES & HOOKS                                                 │
│                                                                 │
│  ┌───────────────────────┐   ┌──────────────────────────────┐  │
│  │ commandDispatcher     │   │ tenantStore                   │  │
│  │ (zustand)             │   │ (zustand)                     │  │
│  │                       │   │                               │  │
│  │ enqueue()/setState()  │   │ fetchTenants() → apiGet()     │  │
│  │ commandRunners.*      │   │ switchTenant() → localStorage │  │
│  │   → apiPost/apiGet    │   │                               │  │
│  └───────┬───────────────┘   └──────────┬────────────────────┘  │
│          │                              │                        │
│  ┌───────┴───────────────┐   ┌──────────┴────────────────────┐  │
│  │ useGovernanceHealth   │   │ TerminalHUDTicker              │  │
│  │                       │   │                               │  │
│  │ apiGet(health)        │   │ apiGet(headlines)             │  │
│  │ 5s polling            │   │ 60s polling                   │  │
│  │ AbortController via   │   │ AbortController (manual)      │  │
│  │   apiClient timeout   │   │ localStorage toggles          │  │
│  └───────────────────────┘   └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ OSControlBar    │  │ WorkspaceBar     │  │ Status Bar (App.tsx)  │
│                 │  │                  │  │                      │
│ Toggle chips    │  │ Tenant dropdown  │  │ PG/Redis indicators  │
│ Dispatch status │  │ Role badge       │  │ Gov health LEDs      │
│ Command palette │  │ Error state      │  │ HERMES status        │
│ Clock           │  │ Loading state    │  │                      │
└─────────────────┘  └──────────────────┘  └──────────────────────┘
```

## Network Request Audit Table

| Origin Component | Endpoint | Method | Client | Timeout | Retry (429/503) | AbortController |
|---|---|---|---|---|---|---|
| TerminalHUDTicker | `/api/news/headlines` | GET | `apiGet` | 15s | Exponential backoff | Yes (ref) |
| WorkspaceBar / tenantStore | `/api/governance/tenants` | GET | `apiGet` | 15s | Exponential backoff | Via apiClient |
| CommandPalette (diag-ping) | `/api/dashboard/summary` | GET | `apiGet` | 15s | Exponential backoff | Via apiClient |
| CommandPalette (diag-system) | `/api/system/diagnostics` | GET | `apiGet` | 15s | Exponential backoff | Via apiClient |
| OSControlBar (MANUAL PULSE) | `/api/governance/dispatch` | POST | `apiPost` via commandRunners | 30s | Exponential backoff | Via apiClient |
| OSControlBar (RESYNC) | `/api/telemetry/ingest` | POST | `apiPost` via commandRunners | 30s | Exponential backoff | Via apiClient |
| OSControlBar (commandRunners.*) | `/api/governance/dispatch` | POST | `apiPost` | 30s | Exponential backoff | Via apiClient |
| App.tsx (useAgentInterceptor poll) | `/api/proxy/pending` | GET | `apiGet` | 15s | Exponential backoff | Via apiClient |
| App.tsx (resolve/reject proxy) | `/api/proxy/resolve` | POST | `apiPost` | 30s | Exponential backoff | Via apiClient |
| App.tsx (governance health) | `/api/governance/health` | GET | `apiGet` via useGovernanceHealth | 15s | Exponential backoff | Via apiClient |

All network requests from the header/taskbar now use `apiClient` (`apiGet`/`apiPost`), which provides:
- Automatic `AbortController` with timeout
- Exponential backoff retry (2 retries) on 429/503
- Structured error objects with `status` and `isRateLimit` properties

## Accessibility Compliance Notes

### OSControlBar
- All toggle chips have `aria-label`, `aria-pressed`, and `title` attributes
- Dispatch status uses `role="status"` and `aria-live="polite"`
- Manual Pulse and Resync buttons have `aria-label`
- Search button (Cmd+K) has `aria-label` and `aria-keyshortcuts`
- Command palette input uses `role="combobox"`, `aria-expanded`, and `aria-controls`
- Command results container uses `role="listbox"`
- Command items use `role="option"` with `aria-selected`
- Keyboard navigation: ArrowUp/ArrowDown/Enter/Escape

### WorkspaceBar
- Dropdown trigger is a native `<button>` with text content (accessible by default)
- Dropdown backdrop uses `aria-hidden="true"`
- Error state displayed with appropriate icon
- Keyboard: Not fully accessible (missing Enter/Escape on dropdown items — see tech debt)

### HealthIndicator
- Uses `role="status"` and `aria-label` for screen readers
- Supports `loading` state for pending health checks

### TerminalHUDTicker
- Uses `role="marquee"` and `aria-live="off"` (intentional: announcing rotating headlines would be disruptive)
- `aria-label` describes the overall widget purpose
- Loading state has `role="status"`
- Refresh button has `aria-label`

## Known Tech Debt

1. **WorkspaceBar keyboard trap**: Dropdown items are not keyboard navigable (missing ArrowUp/ArrowDown/Escape handler). The backdrop click-away is the only way to close.
2. **HealthIndicator is not connected to a live health endpoint**: It is stateless and prop-driven. The parent (App.tsx status bar) computes `pgHealthy`/`redisHealthy` from the dashboard summary response but does not pass status into HealthIndicator. The status bar renders inline indicators instead.
3. **TerminalHUDTicker "FPS: 60/SEC"** is hardcoded and not reflective of actual rendering performance.
4. **OSControlBar toggles** (dbIngestion, pauseStream, manualPulse) are client-only localStorage state with no backend synchronization. The visual state may be out of sync with actual backend state.
5. **CommandPalette `as` cast removal needed**: The `DiagPing` `perform` was previously using raw fetch. Now uses `apiGet`. The `Performs` type could benefit from a union type instead of `void | Promise<void>`.
6. **OSControlBar clock** updates every second — could be optimized with `requestAnimationFrame` for battery savings, though 1s intervals are acceptable.
7. **App.tsx interceptor poll** (`useAgentInterceptor`) runs every 1.5s unconditionally. Should be paused when the Interceptor tab is not active to reduce network load.
8. **apiClient.ts `formatError`** line 26 uses `as Error & {...}` cast which is necessary since `new Error()` returns `Error` but we need to add `.status` and `.isRateLimit` properties.
