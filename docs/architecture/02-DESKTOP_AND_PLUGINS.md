# 02 — Desktop Grid & Micro-App Mounts

## Plugin Registry Map

All rack plugins are registered in `apps/web/src/registry/frontend-plugins.ts` as
`CORE_RACK_PLUGINS`. Each entry maps a stable string id to an `IKudbeePlugin`
descriptor.

| ID                      | Component                | Category      | Grid Span (lg) | Status  |
| ----------------------- | ------------------------ | ------------- | -------------- | ------- |
| `plugin-storm`          | `ThinkStormPlugin`       | storm         | 4              | active  |
| `plugin-stream`         | `ThinkStreamPlugin`      | stream        | 4              | active  |
| `plugin-storage`        | `ThinkStoragePlugin`     | storage       | 4              | active  |
| `plugin-trajectories`   | `ThinkTrajectoriesPlugin`| trajectories  | 6              | active  |
| `plugin-gov-gate`       | `GovernanceGatePlugin`   | governance    | 6              | pending |
| `plugin-hermes-auditor` | `HermesAuditorPlugin`    | auditor       | 6              | active  |
| _(static 12-col)_       | `EdgeSentinelPlugin`     | sentinel      | 12             | —       |

The `EdgeSentinelPlugin` is rendered as a static 12-column full-width child of the
CSS grid below all dynamically mapped plugins.

---

## CSS Grid Specification

Defined in `apps/web/src/components/RackLayout.tsx:184`.

```html
<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-12 min-w-0">
```

- **Columns**: 1 (mobile) → 2 (sm, ≥640px) → 12 (lg, ≥1024px).
- **Gap**: 1.25rem (20px) on every breakpoint.
- **Grid-child `min-w-0`**: Every grid child (`RackLayout.tsx:123–207`) and the
  root `PluginCard` `<article>` (`PluginCard.tsx:27`) carry `min-w-0` to prevent
  flex/grid children from blowing out their column on narrow viewports.
- **Span mapping**: `COL_SPAN_CLASS` (`RackLayout.tsx:17–30`) translates the
  registry `gridSpan.colSpan` into a `lg:col-span-{1..12}` Tailwind class.
  Default for unmapped spans is `lg:col-span-4`.

### Responsive Behaviour

| Breakpoint | Grid                       | Plugin Width Per Span |
| ---------- | -------------------------- | --------------------- |
| < 640px    | 1 column, full width       | 100%                  |
| 640–1023px | 2 columns                  | 50% each              |
| ≥ 1024px   | 12 columns, span honoured  | (span/12) × 100%      |

---

## Mount / Unmount Lifecycle

```
App::render (AnimatePresence on activeTab)
 └─ DashboardPage (direct import, NOT lazy)
     └─ RackLayout
         ├─ useHermesAuditLogs()   — SSE subscription + 1s connected poll
         ├─ useEdgeSignals()       — SSE subscription + initial /api/telemetry/logs + 1s connected poll
         ├─ useThinkTrajectories() — external hook
         └─ grid > renderPlugin() per CORE_RACK_PLUGINS entry
              ├─ PanelErrorBoundary  (per-plugin crash isolation)
              │   └─ SkeletonPanel    (Suspense fallback)
              │       └─ <PluginCard>
              │            └─ <Think*Plugin / HermesAuditorPlugin / GovernanceGatePlugin>
              └─ (EdgeSentinelPlugin, static 12-col)
                   ├─ PanelErrorBoundary
                   │   └─ SkeletonPanel
                   │       └─ <EdgeSentinelPlugin>
```

### Cleanup Contracts

| Component               | Subscriptions cleaned up on unmount?                |
| ----------------------- | ---------------------------------------------------- |
| `RackLayout` (hooks)    | SSE `off()` + `clearInterval` for connected watchers |
| `GovernanceGatePlugin`  | `AbortController` on pending fetch + `clearInterval` |
| `EdgeSentinelPlugin`    | `clearTimeout` for probeResult auto-hide             |
| `HermesAuditorPlugin`   | `clearTimeout` for probeResult auto-hide             |
| `ThinkStoragePlugin`    | No persistent subscriptions (manual search only)     |
| `ThinkStormPlugin`      | Pure render, no effects                              |
| `ThinkStreamPlugin`     | Pure render, no effects                              |
| `ThinkTrajectoriesPlugin` | Pure render + local state (drawer)                 |

---

## Error Boundary Hierarchy

```
<ErrorBoundary>                         ← App.tsx global (full-page crash)
 ├─ <AnimatePresence>                   ← tab transitions
 │   └─ <DashboardPage>
 │       └─ <RackLayout>
 │           └─ <PanelErrorBoundary>    ← per-plugin isolation (RackLayout.tsx)
 │               └─ <ThinkStormPlugin>
 │           └─ <PanelErrorBoundary>
 │               └─ <ThinkStreamPlugin>
 │           └─ <PanelErrorBoundary>
 │               └─ <ThinkStoragePlugin>
 │           └─ <PanelErrorBoundary>
 │               └─ <ThinkTrajectoriesPlugin>
 │           └─ <PanelErrorBoundary>
 │               └─ <GovernanceGatePlugin>
 │           └─ <PanelErrorBoundary>
 │               └─ <HermesAuditorPlugin>
 │           └─ <PanelErrorBoundary>
 │               └─ <EdgeSentinelPlugin>
 └─ <HistoryErrorBoundary>              ← App.tsx inlined (History view)
```

**`ErrorBoundary`** (global, `apps/web/src/components/ErrorBoundary.tsx`):
Covers the entire application. On error renders a full-screen "Control Tower
Unavailable" page with a "Reload Page" button.

**`PanelErrorBoundary`** (per-plugin, `apps/web/src/components/PanelErrorBoundary.tsx`):
Wraps every rack plugin individually. On error renders an inline "Panel Fault"
card with a "Retry" button. This ensures one plugin crash never takes down
neighbouring plugins or the entire desktop.

**`HistoryErrorBoundary`** (inlined in `App.tsx:459`):
Isolates the History View's data table from crashing the parent Desktop tab.

---

## Known Performance Considerations

1. **Polling intervals in RackLayout hooks**: `useHermesAuditLogs` and
   `useEdgeSignals` each run a 1-second `setInterval` to mirror `stream.connected`
   into React state. Two intervals per component mount is acceptable, but
   consider collapsing into a single shared poll if the number of hooks grows.

2. **GovernanceGatePlugin 8s auto-fetch**: The plugin polls
   `/api/governance/pending` every 8 seconds. Each poll now uses an
   `AbortController` so stale requests are cancelled when the component unmounts
   or a new poll fires before the previous completes.

3. **EdgeSentinelPlugin telemetry fetch on mount**: The `useEdgeSignals` hook
   fetches `/api/telemetry/logs?limit=12` on mount. If the backend is slow, this
   can delay the Sentinel's initial render. The hook uses a `cancelled` guard so
   the component won't leak state updates after unmount.

4. **PluginCard CSS**: The `<article>` has `min-height: 180px` and uses absolute
   positioned pseudo-rails. The layout is static per card — no runtime layout
   thrashing.

5. **HermesAuditorPlugin auto-scroll**: The `useEffect` that scrolls to bottom
   fires on every render (no deps array). For high-frequency log streams (>100
   lines/sec), consider throttling via `requestAnimationFrame`.

6. **CSS Grid `min-w-0`**: Added to all grid children and the PluginCard root to
   prevent flex items from overflowing horizontally on mobile screens. This is
   essential for the mobile 1-column layout where long plugin text (e.g.
   Hermes audit lines) could otherwise force horizontal overflow.
