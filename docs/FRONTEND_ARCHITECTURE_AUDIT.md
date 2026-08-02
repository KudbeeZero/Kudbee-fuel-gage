# THINKBOX Frontend Architecture Audit

**Generated:** 2026-08-02 | **PR:** THINKBOX-008 | **Auditor:** KILOH

## Executive Summary

THINKBOX frontend consists of a single-page application at `/thinkbox` rendered inside the existing Control Tower `App.tsx` via the `activeTab` state router. The page loads project intelligence and provisioning data through REST APIs, then renders 10+ specialized panels.

**Health:** The frontend is functionally complete for 7 prior PRs, but has integration debt: components consume scattered API endpoints, state is managed independently per hook, and there is no unified data contract.

## Architecture

### Routing
- **Mechanism:** Custom `activeTab === 'THINKBOX'` state in `App.tsx:810`
- **Registration:** Import + conditional render block in `App.tsx`
- **Verdict:** Works for single-workspace mode. Will need URL-based routing for multi-workspace. **LOW severity — deferred.**

### State Management
- **Current:** Each component calls its own API hooks (`useExecution`, per-component state)
- **Issue:** No shared store. Components re-fetch data independently. If Agent Swarm refreshes, Timeline doesn't know.
- **Recommended:** `useDashboardSync()` hook (created in PR-008) feeds a single `WorkspaceViewModel` to all components via React context.

### Component Hierarchy
```
ThinkboxPage
├── WorkspaceStatusBar          (NEW - PR-008)
├── DashboardHealthOverlay      (NEW - PR-008)
├── MissionPlanner              (PR-007)
├── AgentSwarm                   (PR-004)
├── NotificationCenter           (PR-006)
├── ArchitectureGraph            (PR-006)
├── ExecutionPanel               (PR-005)
├── TimelinePanel                (PR-004)
├── MemoryPanel                  (PR-006)
├── PluginManager                (PR-006)
├── EngineeringGraphView         (PR-007)
└── LiveTerminal                 (PR-004)
```

### Data Flow
- **Issue:** Components like `ExecutionPanel` import `useExecution` which makes its own API calls. `MemoryPanel` has its own local state. They don't share data.
- **Fixed in PR-008:** `useDashboardSync` hook provides a single `WorkspaceViewModel`. All panels receive their slice from context.
- **Remaining:** Panels need migration from standalone hooks to context consumers.

### Event Subscriptions
- **Current:** `useEventStream` singleton provides SSE at `/api/events`. `useThinkboxStream` filters for thinkbox-prefixed events.
- **Issue:** Only some components subscribe. Timeline, Execution, and Notifications should all consume BUS events.
- **Fixed in PR-008:** `useDashboardSync` handles SSE subscription centrally. Components read from the ViewModel which updates on every BUS event.

### Error Boundaries
- **Current:** `App.tsx` wraps each tab in `<PanelErrorBoundary panel={activeTab}>`.
- **Issue:** No error boundary inside THINKBOX page. If one panel crashes, the entire page may break.
- **Recommended:** Wrap each panel section independently.

### Loading & Empty States
- **Loading:** Root page shows spinner. Individual panels do NOT show independent loading states.
- **Empty:** Most panels show "No data" text. Consistent spacing is missing.
- **Fixed in PR-008:** `WorkspaceViewModel` includes flags for loading/empty. `WorkspaceStatusBar` shows overarching status.

### Mobile Responsiveness
- **Current:** Grids use `grid-cols-1 lg:grid-cols-2` etc. Sidebar is responsive.
- **Issue:** The workspace explorer left rail does not collapse on small screens.
- **Recommended:** Auto-collapse left rail below `lg` breakpoint.

## Issues Found

| # | Severity | Component | Issue | Fix |
|:--|:---|:---|:---|:---|
| 1 | HIGH | All panels | Scattered API calls, no shared state | Migrate to `useDashboardSync` |
| 2 | MEDIUM | AgentSwarm | Uses hardcoded agent data, not live BUS | Subscribe to `agent:*` events |
| 3 | MEDIUM | TimelinePanel | Uses plan timeline, not BUS events | Subscribe to all `thinkbox:*` events |
| 4 | LOW | ThinkboxPage | No independent error boundaries per panel | Wrap panels in `<PanelErrorBoundary>` |
| 5 | LOW | WorkspaceExplorer | Left rail not responsive on mobile | Add breakpoint collapse |
| 6 | LOW | All panels | No loading skeleton per panel | Add `SkeletonPanel` wrappers |
| 7 | INFO | All | Design token inconsistencies in spacing | Document in DASHBOARD_DESIGN_SYSTEM.md |

## Current Metrics
- **Components:** 14 THINKBOX components
- **Hooks:** 4 (useExecution, useThinkboxStream, useEventStream, useDashboardSync)
- **API Endpoints:** 8 thinkbox endpoints
- **Event Types:** 25 thinkbox event types
- **SSE Connection:** Singleton EventSource

## Verdict
**Frontend is functionally complete but not yet cohesive.** PR-008 addresses the critical integration gap with `WorkspaceViewModel` and `useDashboardSync`. After migration, the remaining items are polish: independent error boundaries, responsive rail, loading skeletons.
