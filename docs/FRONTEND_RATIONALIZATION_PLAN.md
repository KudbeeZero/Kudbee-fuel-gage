# Frontend Rationalization Plan

**Date:** 2026-08-02 | **Auditor:** KILOH | **Read-Only Audit**

## Product Structure — Target End State

```
Engineering OS Frontend
│
├── Control Tower (Operations Center)
│   └── Global fleet health, deployments, costs, alerts, active workspaces
│
├── THINKBOX (Engineering Workspace)
│   └── Per-project: intelligence, planning, execution, terminal, agents, timeline
│
├── Labs (Internal Testing)
│   └── Subsystem testing, replay, diagnostics
│
└── Mobile (Companion Experience)
    └── Minimal health/mission view
```

---

## Page Disposition

### KEEP (Production — no changes needed)

| Page | Reason |
|:---|:---|
| **THINKBOX** (`thinkbox.tsx`) | Core product. Engineering workspace. 24 sub-components. |
| **Control Tower** (`ControlTowerPanel.tsx`) | Operations center. Governance actions. |
| **Observability** (`observability.tsx`) | Middleware/agent/latency monitoring. Production. |
| **History** (`history.tsx`) | Session/telemetry log viewer. Production. |
| **Firewall** (`firewall.tsx`) | Interceptor triage, chaos mode, DLQ. Production. |
| **Alerts** (`AlertsPanel.tsx`) | System alerts. Production. |
| **Settings** (`SettingsView.tsx`) | Currency, theme, density. Production. |
| **HERMES** (`hermes.tsx`) | Auditor. Production. |
| **SENTINEL** (`sentinel.tsx`) | Edge monitoring. Production. |
| **STUDIO** (`StudioRouter` + 8 panels) | Beacon tower. Governance, CI, telemetry, tokens. Production. |

### MERGE (Consolidate with another page)

| Page | Reason | Merge Into |
|:---|:---|:---|
| **Overview** (`overview.tsx`) | Health signals + incidents overlap with Control Tower | **Control Tower** — consolidate health into Control Tower overview |
| **Workspace** (`workspace.tsx`) | Local state only, no API calls. Replaced by THINKBOX | **THINKBOX** — migrate session/worknote concepts |
| **Governance** (`governance.tsx`) | Container only. Overlaps with GovernancePanel in studio | **STUDIO GovernancePanel** — remove wrapper, use panel directly |
| **Telemetry** (`telemetry.tsx`) | Cost charts overlap with TelemetryPanel in studio | **STUDIO TelemetryPanel** — merge, keep TelemetryPanel as canonical |
| **OllamaChat** (`OllamaChat.tsx`) | Local LLM chat, not engineering events. Legacy. | **THINKBOX LiveTerminal** — archive chat, keep LiveTerminal |
| **INTERCEPTOR** (`InterceptorView.tsx`) | Overlaps with Firewall tab + FirewallPanel in studio | **FIREWALL tab** — merge, keep strongest implementation |

### REBUILD (Functional but needs rework)

| Page | Reason |
|:---|:---|
| **PLAYGROUND** (`PlaygroundView.tsx`) | Experimental model testing. Useful but disconnected from rest of app. Rebuild as Labs module. |
| **INTELLIGENCE** (`IntelligenceView.tsx`) | 1KB shell. No real content. Rebuild or retire. |
| **Labs** (`labs.tsx`) | Complete but unwired. No tab renders it. Wire to a LABS tab. |

### ARCHIVE (Retire — candidate for removal)

| Page | Reason |
|:---|:---|
| **OllamaChat standalone entrypoint** (`terminal.tsx`) | Separate React root for terminal.html. Legacy. Archive once LiveTerminal is canonical. |
| **GATEWAY** (`GatewayView.tsx`) | Provider routing visualization. Useful but low priority. Archive or merge into observability. |

---

## Terminal Disposition

| Terminal | Verdict |
|:---|:---|
| **LiveTerminal** (THINKBOX) | **KEEP — canonical.** The ONE engineering terminal. |
| **AgentTerminal** (studio dock) | **MERGE** into LiveTerminal. Memory commands, recall, `kudbee@studio:~$` prompt. |
| **OllamaChat** (page) | **ARCHIVE.** Local LLM chat. Not engineering events. |
| **OllamaChat standalone** (terminal.tsx) | **ARCHIVE.** Legacy entrypoint. |
| **ConsoleDock** | **MERGE** into LiveTerminal. Persistent console is same purpose. |
| **TerminalMirror** | **MERGE** into LiveTerminal. Same data, different view. |

**End state: ONE terminal. LiveTerminal in THINKBOX.**

---

## Tab Consolidation — 20 → 12

| Current Tab | New Location | Reason |
|:---|:---|:---|
| OVERVIEW | **Control Tower** | Merged — health is part of ops overview |
| WORKSPACE | **THINKBOX** | Merged — THINKBOX is the workspace |
| STUDIO | **Keep** | Production — beacon tower |
| THINKBOX | **Keep** | Core product |
| TELEMETRY | **STUDIO TelemetryPanel** | Merged — one telemetry view |
| OBSERVABILITY | **Keep** | Production |
| THINK | **Keep** | Active think plugins |
| GOVERNANCE | **STUDIO GovernancePanel** | Merged — one governance view |
| CONTROL TOWER | **Keep** | Operations center |
| HERMES | **Keep** | Auditor |
| SENTINEL | **Keep** | Edge monitoring |
| PLAYGROUND | **Labs** | Rebuilt as Labs module |
| TERMINAL (OllamaChat) | **THINKBOX LiveTerminal** | Archived — one terminal |
| FIREWALL | **Keep** | Production |
| GATEWAY | **Archive** | Low priority |
| INTERCEPTOR | **FIREWALL** | Merged — one triage view |
| HISTORY | **Keep** | Production |
| ALERTS | **Keep** | Production |
| INTELLIGENCE | **Archive** | 1KB shell, no content |
| SETTINGS | **Keep** | Production |

**Result: 12 tabs (down from 20). Clean separation: Control Tower (ops) + THINKBOX (work) + Labs (testing).**

---

## Hook Consolidation — 41 → 30

| Merge | Reason |
|:---|:---|
| `useEventStream` + `useOsStream` | Both connect to same SSE. Unify. |
| `useControlTowerStatus` + `useSystemDiagnostics` | Both call `/api/system/diagnostics`. Merge. |
| `useGovernanceStream` + `useThinkGovernanceStream` | Both resolve governance. Merge. |

---

## If THINKBOX shipped tomorrow:

**Remaining pages (12 tabs):**
- STUDIO, THINKBOX, OBSERVABILITY, THINK, CONTROL TOWER, HERMES, SENTINEL, FIREWALL, HISTORY, ALERTS, SETTINGS, LABS

**Archived pages:**
- Overview (→ Control Tower), Workspace (→ THINKBOX), Telemetry (→ STUDIO), Governance (→ STUDIO), OllamaChat (→ LiveTerminal), Interceptor (→ FIREWALL), PLAYGROUND (→ LABS), INTELLIGENCE (→ retired), GATEWAY (→ archived)

**Terminals unified:** ONE — LiveTerminal in THINKBOX.

**Evidence for every recommendation:** See FRONTEND_INVENTORY.md, DUPLICATE_COMPONENT_REPORT.md, TERMINAL_AUDIT.md.
