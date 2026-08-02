# Alpha Engineering Mode Specification

**Version:** 1.0 | **Date:** 2026-08-02

## Definition

**Engineering Mode** is the default operating mode for THINKBOX during Alpha.

**Principle:** The current product is intentionally operating without authentication. This is not a missing feature — it is the correct engineering decision for a single-user, pre-release Alpha product.

---

## Operating Modes (Planned)

### Engineering Mode (Current — Alpha)
- Single engineer
- No login required
- No user accounts
- No permissions or roles
- All engineering tools available
- Dashboard loads immediately
- Local development only

### Team Mode (Future — Beta)
- Multiple engineers
- Shared workspaces
- Authentication required (login)
- Role-based permissions (viewer/editor/admin)
- Session management
- Collaboration features

### Organization Mode (Future — 1.0)
- SSO / OAuth integration
- Full RBAC (reintroduce tenanted RBAC)
- Audit logs per user
- Multiple projects/organizations
- Enterprise governance

---

## What Changes in Engineering Mode

| Remove | Reason |
|:---|:---|
| `LoginView.tsx` | Hardcoded passkey gate — no server validation |
| `App.tsx` localStorage auth check | Blocks dashboard load unnecessarily |
| `App.tsx` logout button | No auth = no logout |
| `tenants.ts` RBAC (archive) | No users to assign roles to |

| Keep | Reason |
|:---|:---|
| `bearerAuthMiddleware.ts` | Agent-to-server auth (Ed25519, Bearer, Session cookie) |
| `crypto-identity.ts` | Ed25519 foundation for agent identity |
| SSE stream tickets | Required for `useEventStream`, `useOsStream` |
| `synapseProtectionLayer.ts` | Threat barrier (separate from user auth) |
| Agent registry (`config/agents.json`) | Agent identity verification |
| Sentinel/edge auth env vars | Inter-service communication |

---

## Migration Path

```
Engineering Mode (now)
    │
    │  When user count > 1 needed
    ▼
Team Mode
    │  Reintroduce tenanted RBAC
    │  Add user registration
    │  Wire AuthProvider/Context
    │
    │  When enterprise features needed
    ▼
Organization Mode
    SSO, full RBAC, audit logs, multiple orgs
```
