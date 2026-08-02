# Duplicate Component Report

**Date:** 2026-08-02 | **Auditor:** KILOH

## Duplicate Pages

| Concept | Page 1 | Page 2 | Verdict |
|:---|:---|:---|:---|
| **Terminals** | `OllamaChat.tsx` (full-page chat) | `LiveTerminal.tsx` (THINKBOX) | **Duplicate** — OllamaChat is local LLM, LiveTerminal is engineering events. Different purposes but both named "terminal." Keep LiveTerminal. Archive OllamaChat. |
| **Workspaces** | `workspace.tsx` (session/worknotes) | `thinkbox.tsx` (engineering workspace) | **Near-duplicate** — Workspace page has no API calls, mock data only. THINKBOX replaces it. |
| **Dashboards** | `overview.tsx` (health) | `ControlTowerPanel.tsx` (governance) + `TelemetryPanel.tsx` (costs) | **Fragmented** — Three dashboards doing parts of what one Control Tower should do. |

## Duplicate Components

| Concept | Comp 1 | Comp 2 | Verdict |
|:---|:---|:---|:---|
| **Dashboards** | `DashboardHealthOverlay.tsx` (THINKBOX) | `ControlTowerPanel.tsx` (Control Tower) | Both show health. Overlay is dev-mode, ControlTower is ops. Merge health into Control Tower. |
| **Diagnostics** | `DiagnosticsPanel.tsx` (THINKBOX) | `DiagnosticTicker.tsx` (Control Tower) | Both show diagnostics. Merge. |
| **Terminals** | `AgentTerminal.tsx` | `LiveTerminal.tsx` | Both are terminals. Merge. |
| **Consoles** | `ConsoleDock.tsx` | `LiveTerminal.tsx` | Both show logs. Merge. |
| **Agent views** | `AgentSwarm.tsx` (THINKBOX) | `AgentFleetMonitor.tsx` (Observability) | Both show agents. Swarm is per-workspace, Fleet is global. Keep both, clarify scope. |
| **Excellence/Review** | `ExcellenceScoreCard.tsx` | `EngineeringReviewPanel.tsx` | Both show scores/reviews. Merge into one panel. |

## Duplicate Hooks

| Concept | Hook 1 | Hook 2 | Verdict |
|:---|:---|:---|:---|
| **Event streams** | `useEventStream.ts` | `useOsStream.ts` | Both connect to `/api/events` via SSE. `useOsStream` adds OS-specific fields. Merge into one. |
| **System diagnostics** | `useControlTowerStatus.ts` | `useSystemDiagnostics.ts` | Both call `/api/system/diagnostics`. Duplicate. |
| **Governance streams** | `useGovernanceStream.ts` | `useThinkGovernanceStream.ts` | Both resolve governance. Different scopes? Merge. |

## Duplicate Concepts

| Concept | Where it lives | Verdict |
|:---|:---|:---|
| **Health** | `overview.tsx`, `DashboardHealthOverlay.tsx`, `ControlTowerPanel.tsx`, `/health` endpoint, `useOverviewHealth.ts` | 5 places. Consolidate to Control Tower. |
| **Governance** | `governance.tsx`, `GovernancePanel.tsx` (studio), `GovernanceView.tsx`, `GovernanceGatePlugin.tsx`, `ControlTowerPanel.tsx` | 5 components. Consolidate to GOVERNANCE tab + Control Tower overview. |
| **Telemetry** | `telemetry.tsx`, `TelemetryPanel.tsx` (studio), `history.tsx` | 3 views of same data. Keep Telemetry tab + History tab. Merge studio panel. |
