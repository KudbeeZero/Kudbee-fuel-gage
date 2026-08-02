# Route Retirement Plan

**Date:** 2026-08-02 | **Auditor:** KILOH

## Tabs to Retire (8 of 20)

| Tab | Action | Reason |
|:---|:---|:---|
| **OVERVIEW** | MERGE → Control Tower | Health signals + incidents overlap with ops overview. No separate tab needed. |
| **WORKSPACE** | MERGE → THINKBOX | Mock session/worknote UI. Replaced by THINKBOX engineering workspace. |
| **TELEMETRY** | MERGE → STUDIO | Cost charts overlap with STUDIO TelemetryPanel. Use STUDIO as canonical. |
| **GOVERNANCE** | MERGE → STUDIO | Container only. Overlaps with STUDIO GovernancePanel. Use panel directly. |
| **TERMINAL** (OllamaChat) | ARCHIVE | Local LLM chat. LiveTerminal in THINKBOX is canonical. |
| **PLAYGROUND** | REBUILD → LABS | Model testing. Rebuild as LABS module. |
| **INTERCEPTOR** | MERGE → FIREWALL | Overlaps with Firewall tab + FirewallPanel. Merge. |
| **GATEWAY** | ARCHIVE | Provider routing. Low priority. |
| **INTELLIGENCE** | ARCHIVE | 1KB shell. No content. |

## Tabs to Keep (12 of 20)

| Tab | Reason |
|:---|:---|
| **STUDIO** | Beacon tower. 8 production sub-panels. |
| **THINKBOX** | Core product. Engineering workspace. |
| **OBSERVABILITY** | Middleware/agent/latency monitoring. |
| **THINK** | Think plugins. Active. |
| **CONTROL TOWER** | Operations center. Governance actions. |
| **HERMES** | Auditor. Production. |
| **SENTINEL** | Edge monitoring. Production. |
| **FIREWALL** | Interceptor triage. Production. |
| **HISTORY** | Session/telemetry logs. Production. |
| **ALERTS** | System alerts. Production. |
| **LABS** | Currently unwired. Wire to a tab. |
| **SETTINGS** | Currency, theme, density. Production. |

## Implementation Order

1. **PR-014C-1:** Remove LoginView + App.tsx auth gate (10 lines)
2. **PR-014C-2:** Retire OVERVIEW, WORKSPACE, TELEMETRY, GOVERNANCE tabs from nav
3. **PR-014C-3:** Archive TERMINAL (OllamaChat), PLAYGROUND, INTERCEPTOR, GATEWAY, INTELLIGENCE
4. **PR-014C-4:** Wire LABS tab
5. **PR-014C-5:** Archive `tenants.ts` (disable RBAC; keep code for Team Mode)

Each PR is independently reviewable, testable, and reversible via `git revert`.

## Pages to Remove from Codebase

| File | Action | PR |
|:---|:---|:---|
| `apps/web/src/components/LoginView.tsx` | DELETE | PR-014C-1 |
| `apps/web/src/pages/workspace.tsx` | ARCHIVE (keep file, remove tab) | PR-014C-2 |
| `apps/web/src/pages/overview.tsx` | ARCHIVE (keep file, remove tab) | PR-014C-2 |
| `apps/web/src/pages/telemetry.tsx` | KEEP (used by STUDIO prop) | N/A |
| `apps/web/src/pages/governance.tsx` | KEEP (container, small) | N/A |
| `apps/web/src/components/IntelligenceView.tsx` | ARCHIVE | PR-014C-3 |
