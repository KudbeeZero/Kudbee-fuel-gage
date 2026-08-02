# Auth Removal Plan

**Date:** 2026-08-02 | **Auditor:** KILOH | **Read-Only Recommendations**

## What to Remove (Alpha Mode)

### 1. LoginView.tsx — REMOVE
**Evidence:** Hardcoded passkey `kudbee-admin-2026` in localStorage. Zero server validation. "Secure Access Gateway" branded UI with animated boot sequence (127 lines).

**Removal impact:** None. No server validates this token. It's a decorative gate.

### 2. App.tsx localStorage auth gate — REMOVE
**Evidence:** `isAuthenticated = localStorage.getItem('kudbee_session') === 'authenticated'` (line 142). Controls whether LoginView or dashboard renders. 6-second timeout for `authChecked`.

**Removal impact:** Dashboard loads immediately. No LoginView flash.

### 3. App.tsx logout button — REMOVE
**Evidence:** `localStorage.removeItem('kudbee_session')` + `setIsAuthenticated(false)` (lines 508-512, 637).

**Removal impact:** No auth = no logout needed.

### 4. Tenants.ts RBAC — ARCHIVE (do not delete)
**Evidence:** 3 tenants, 3 roles (ADMIN/OPERATOR/AUDITOR), per-route RBAC matrix. Zero users exist to assign to these roles.

**Recommendation:** Archive, don't delete. The multi-tenancy architecture is correct for Team Mode. For Alpha, `requireRole()` calls in governance/audit routes should pass through or be stubbed. Keep the files, keep the tests. Reintroduce when adding multi-user support.

---

## What to Keep (Essential for Platform Operation)

### Server-Side Auth — KEEP
- `bearerAuthMiddleware.ts` — Bearer tokens, Agent Pass, Session cookies. All required for agent-to-server communication, sentinel egress, and inter-service auth.
- `crypto-identity.ts` — Ed25519 primitives. Foundation of agent identity.
- `synapseProtectionLayer.ts` — C4769 threat barrier. Sits before auth. Protects against behavioral attacks.
- `disruptionLayer.ts` — Auth bypass detection. Security layer.
- `middlewareGuard.ts` — Circuit-breaker for auth middleware.
- `middlewarePipeline.test.ts` — Auth tests. Keep.

### Stream Ticket — KEEP
- SSE ticket-granting (`POST /api/auth/stream-ticket`). Required for `useEventStream` and `useOsStream`.
- Client hooks: `useEventStream.ts`, `useOsStream.ts`.

### Agent Registry — KEEP
- `config/agents.json` — Ed25519 public keys for registered agents.
- Agent pass verification on telemetry, token, think-token endpoints.

### Env Vars — KEEP
- `STREAM_SECRET`, `SESSION_SECRET` (for HMAC), `EDGE_AGENT_PASS`, `SENTINEL_AGENT_PASS`.

---

## What to Fix

### Critical Bug
**`verifyAgentPassFromKey`** — called at `server.js:2308`, never defined. Either implement or remove the dead code path. Recommend: remove the `public_key` branch from the interceptor verify handler (it's unreachable in practice). If the feature is needed, implement the function properly before the path is exercised.

---

## Migration Path

### Alpha (Current) → Engineering Mode
- Remove LoginView.tsx
- Remove localStorage auth gate from App.tsx
- Remove logout button
- Add "Engineering Mode" badge to Control Tower header
- Document that auth is intentionally absent (see ENGINEERING_MODE.md)

### Alpha → Team Mode (Future)
- Reintroduce tenanted RBAC from archived files
- Add user registration
- Wire AuthProvider/Context
- Add protected route guards
- Implement session management UI

The archived tenant/RBAC code is already structured correctly for this migration. No rewrite needed — just re-enable.
