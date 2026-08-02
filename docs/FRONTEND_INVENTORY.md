# Frontend Inventory

**Date:** 2026-08-02 | **Auditor:** KILOH | **Scope:** Full frontend

## Pages (13 files)

| Page | File | Size | Status |
|:---|:---|:---|:---|
| Overview | `overview.tsx` | 16KB | Production — system health dashboard |
| Workspace | `workspace.tsx` | 15KB | Active — session/worknote UI (no API calls) |
| THINKBOX | `thinkbox.tsx` | 26KB | Active — unified engineering workspace |
| Telemetry | `telemetry.tsx` | 18KB | Production — cost charts, circuit breaker |
| Observability | `observability.tsx` | 4KB | Production — middleware, agents, latencies |
| THINK | `think.tsx` | 4KB | Active — think plugins |
| Governance | `governance.tsx` | 2KB | Production — governance gate |
| Control Tower | `ControlTowerPanel.tsx` | 11KB | Production — governance actions |
| HERMES | `hermes.tsx` | 2KB | Production — auditor |
| SENTINEL | `sentinel.tsx` | 1KB | Production — edge monitoring |
| PLAYGROUND | `PlaygroundView.tsx` | — | Experimental — model testing |
| History | `history.tsx` | 26KB | Active — session/telemetry logs |
| OllamaChat | `OllamaChat.tsx` | 25KB | Active — local LLM chat |
| Firewall | `firewall.tsx` | 23KB | Production — interceptor triage |
| INTERCEPTOR | `InterceptorView.tsx` | 12KB | Production — interceptor |
| Labs | `labs.tsx` | 12KB | **UNWIRED** — not in any tab |

## Tabs (20 — 12 primary + 8 secondary)

### Primary Navigation
| Tab | Icon | Status | Real Data? |
|:---|:---|:---|:---|
| OVERVIEW | LayoutDashboard | Production | ✅ |
| WORKSPACE | Sparkles | Active | ❌ local state only |
| STUDIO | Monitor | Production | ✅ sub-router |
| THINKBOX | Boxes | Active | ✅ WorkspaceViewModel |
| TELEMETRY | Activity | Production | ✅ props-driven |
| OBSERVABILITY | Gauge | Production | ✅ hooks |
| THINK | Zap | Active | ✅ |
| GOVERNANCE | Scale | Production | ✅ |
| CONTROL TOWER | Shield | Production | ✅ |
| HERMES | TerminalSquare | Production | ✅ |
| SENTINEL | Radio | Production | ✅ |
| PLAYGROUND | Calculator | Experimental | ✅ |

### Secondary Navigation ("More" dropdown)
| Tab | Status | Real Data? |
|:---|:---|:---|
| TERMINAL (OllamaChat) | Legacy | ✅ Ollama |
| FIREWALL | Production | ✅ |
| GATEWAY | Production | ✅ |
| INTERCEPTOR | Production | ✅ |
| HISTORY | Active | ✅ |
| ALERTS | Production | ✅ |
| INTELLIGENCE | **Unknown** — 1KB shell | ❌ |
| SETTINGS | Production | ✅ |

## Terminals (3 implementations)
1. **OllamaChat** (page + standalone entrypoint `terminal.html`) — local LLM chat via Ollama, TERMINAL tab
2. **AgentTerminal** — studio dock with `kudbee@studio:~$` prompt, memory recall/remember
3. **LiveTerminal** — THINKBOX embedded terminal, SSE/BUS event stream

Plus: TerminalStreamView (renderer), ConsoleDock (persistent console), TerminalHUDTicker (news)

## Dashboards
- **Control Tower** — governance actions, proposed/rejected tracking
- **THINKBOX** — 24 sub-components, engineering workspace
- **Overview** — system health, incidents, service grid
- **Telemetry** — cost charts, circuit breaker
- **Labs** — unwired, 8 lab modules

## Hooks (41)
- 10 stream/event hooks (SSE/BUS)
- 14 data-fetching hooks (API calls)
- 5 utility hooks
- 12 specialized hooks

## API Calls (~85 endpoints)
- 8 auth/governance groups
- Full coverage: health, telemetry, governance, interceptor, think, thinkbox, vector, router, metrics, audit, edge, CI, session, alerts, playground

## Mobile
- **No dedicated mobile pages or components**
- Responsive CSS only (grid breakpoints)
