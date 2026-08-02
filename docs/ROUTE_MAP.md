# Route Map

**Date:** 2026-08-02

## Current Routes

All navigation is tab-based (`activeTab` state in `App.tsx`). No URL-based routing except STUDIO sub-tabs.

| Route | Component | Data Source |
|:---|:---|:---|
| `/` (overview) | `OverviewPage` | `useOverviewHealth` |
| `/` (workspace) | `WorkspacePage` | Local state (no API) |
| `/` (studio) → `/tower/*` | `StudioRouter` (8 sub-routes) | Multiple hooks |
| `/` (thinkbox) | `ThinkboxPage` | `useDashboardSync`, API calls |
| `/` (telemetry) | `TelemetryPage` | Props from App |
| `/` (observability) | `ObservabilityPage` | Multiple hooks |
| `/` (think) | `ThinkPage` | `useThinkTrajectories` |
| `/` (governance) | `GovernancePage` | Governance plugins |
| `/` (control-tower) | `ControlTowerPanel` | `GET /api/governance/proposed` |
| `/` (hermes) | `HermesPage` | `useHermesAuditLogs` |
| `/` (sentinel) | `SentinelPage` | `useEdgeSignals` |
| `/` (playground) | `PlaygroundView` | `usePlaygroundBackend` |
| `/` (terminal) | `OllamaChat` | `useOllamaStream` |
| `/` (firewall) | `FirewallPage` | `GET /api/interceptor/triage` |
| `/` (gateway) | `GatewayView` | `useProviderStatus` |
| `/` (interceptor) | `InterceptorView` | `GET /api/proxy/pending` |
| `/` (history) | `HistoryPage` | `GET /api/session-history` |
| `/` (alerts) | `AlertsPanel` | `GET /api/system/alerts` |
| `/` (intelligence) | `IntelligenceView` | None (1KB shell) |
| `/` (settings) | `SettingsView` | Props from App |
| `/terminal.html` | `OllamaChat` (standalone root) | `useOllamaStream` |

### STUDIO Sub-Routes (`/tower/*`)

| Path | Component |
|:---|:---|
| `/tower/monitor` | `MonitorPanel` |
| `/tower/ci` | `CIHealthPanel` |
| `/tower/governance` | `GovernancePanel` |
| `/tower/tokens` | `ThinkTokensPanel` |
| `/tower/challenge` | `ChallengePanel` |
| `/tower/localdb` | `LocalDbStatus` |
| `/tower/telemetry` | `TelemetryPanel` |
| `/tower/firewall` | `FirewallPanel` |

## Unwired Routes

| Route | Status |
|:---|:---|
| `/labs` | File exists. Not registered in App.tsx. Unreachable. |
