# Frontend Runtime Audit

**Date:** 2026-08-02 | **Auditor:** KILOH | **Mission:** THINKBOX-015

## Audit Scope

26 planned components. 16 exist. 10 are stubs. 0 connected to live BUS/SSE. 11 render mock data.

## Component Status

| # | Component | Exists | Reaches | Real Data | BUS/SSE | Mock | Loading | Empty | Error |
|:--|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `AgentSwarm.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 2 | `TimelinePanel.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 3 | `LiveTerminal.tsx` | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ❌ |
| 4 | `ExecutionPanel.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 5 | `MissionCenter.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 6 | `WorkspaceExplorer.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 7 | `NotificationCenter.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 8 | `MemoryPanel.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 9 | `PluginManager.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 10 | `WorkspaceInspector.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 11 | `LearningCenter.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 12 | `ReplayPanel.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 13 | `DiagnosticsPanel.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 14 | `TodaysMission.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 15 | `MissionInbox.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 16 | `EngineeringReviewPanel.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 17 | `ExcellenceScoreCard.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 18 | `CostDashboard.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 19 | `ProviderDashboard.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 20 | `EngineeringKPIs.tsx` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 21 | `MissionPlanner.tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| 22 | `EngineeringGraphView.tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 23 | `DashboardHealthOverlay.tsx` | ✅ | ✅ | ⚠️ | ❌ | ❌ | — | — | — |
| 24 | `WorkspaceStatusBar.tsx` | ✅ | ✅ | ⚠️ | ❌ | ❌ | — | — | — |
| 25 | `pages/labs.tsx` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 26 | `pages/thinkbox.tsx` | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ |

## Summary

| Metric | Count | % |
|:---|:---|:---|
| Total planned | 26 | 100% |
| Exist | 16 | 62% |
| Reachable (visible in tab) | 15 | 58% |
| Real data (no mock) | 2 | 8% |
| BUS/SSE connected | 1 | 4% |
| Mock data present | 14 | 88% |
| Loading state | 3 | 19% |
| Empty state | 3 | 19% |
| Error state | 1 | 6% |

## Critical Gaps

1. **0 BUS connections** — Only LiveTerminal uses `useEventStream`. No other panel subscribes.
2. **14/16 panels use mock data** — Hardcoded arrays, fake metrics, sample timelines.
3. **Labs page unreachable** — No tab renders it. Code exists but is dead.
4. **WorkspaceStatusBar shows hardcoded values** — Always "6/6 agents, BUS connected."
5. **WorkspaceViewModel imported but not consumed** — `useDashboardSync` is imported in thinkbox.tsx but never called to feed panels.

## Integration Readiness

**Only 2 components (8%) are ready for integration:** MissionPlanner (clean props, no mock data) and EngineeringGraphView (empty arrays, no mock data). The remaining 14 need mock data removal and live data wiring.
