# Platform Simplification Report

**Date:** 2026-08-02 | **Auditor:** KILOH

## Summary

The platform has accumulated architectural debt through 13+ PRs built in a cloud sandbox where no browser ever ran. The result: 20 tabs, 3 terminals, 41 hooks, 85 API endpoints, a decorative login page, and 10 missing component stubs — all for a product with one user.

**Recommendation: Remove the unnecessary. Archive the premature. Document the future.**

---

## What to Remove (Immediately)

| Item | Reason | Effort |
|:---|:---|:---|
| `LoginView.tsx` | Hardcoded passkey, no server validation | 1 line |
| `App.tsx` auth gate | localStorage check blocks dashboard | 5 lines |
| `App.tsx` logout button | No auth = no logout | 5 lines |
| OVERVIEW tab | Merged into Control Tower | See rationalization plan |
| WORKSPACE tab | Replaced by THINKBOX | See rationalization plan |

## What to Archive (Keep files, disable)

| Item | Reason | Reintroduce |
|:---|:---|:---|
| `tenants.ts` RBAC | No users to assign roles | Team Mode |
| `tenants.test.ts` | Tests for archived module | Team Mode |
| OllamaChat page | Local LLM chat, not engineering events | If LLM chat returns |
| OllamaChat standalone | `/terminal.html` entrypoint | If needed |
| TELEMETRY tab | Merged into STUDIO TelemetryPanel | N/A |
| GOVERNANCE tab | Merged into STUDIO GovernancePanel | N/A |
| PLAYGROUND tab | Rebuilt as LABS module | N/A |
| INTELLIGENCE tab | 1KB shell, no content | If rebuilt |
| GATEWAY tab | Low priority | If needed |

## What to Fix (Critical)

| Item | Severity | Fix |
|:---|:---|:---|
| `verifyAgentPassFromKey` undefined | **CRITICAL** | Remove dead code path or implement function |
| `simulation` ReferenceError in thinkbox.tsx | FIXED (PR-014A) | ✅ |

## What to Consolidate

| Problem | Solution |
|:---|:---|
| 3 terminals | ONE canonical terminal — LiveTerminal |
| Health in 5 places | Consolidate to Control Tower overview |
| Governance in 5 components | Consolidate to STUDIO GovernancePanel |
| Telemetry in 3 views | Consolidate to STUDIO TelemetryPanel |
| 41 hooks | Remove 3 duplicates. Target: 30 |

## End State

```
Engineering OS (12 tabs)
├── STUDIO (Beacon Tower — 8 sub-panels)
├── THINKBOX (Engineering Workspace — 14 panels + Live Terminal)
├── OBSERVABILITY
├── THINK
├── CONTROL TOWER
├── HERMES
├── SENTINEL
├── FIREWALL
├── HISTORY
├── ALERTS
├── LABS (wired)
└── SETTINGS
```

**Terminals: 1 (LiveTerminal in THINKBOX)**

**Authentication: Engineering Mode — no login, single user.**

**Down from: 20 tabs, 3 terminals, decorative login, unwired labs.**
