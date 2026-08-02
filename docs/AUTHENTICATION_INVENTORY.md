# Authentication Inventory

**Date:** 2026-08-02 | **Auditor:** KILOH | **Read-Only**

## Summary

**No Passport.js, OAuth, JWT, or user-facing login/signup exists.** Authentication is server-side only: Bearer tokens, Agent Pass (Ed25519), signed session cookies, and SSE stream tickets. The frontend has a hardcoded passkey gate (`kudbee-admin-2026`) in localStorage — no server validation.

---

## Auth Surface — By Category

### Bearer Auth (Server)
| File | Lines | Verdict |
|:---|:---|:---|
| `services/lib/bearerAuthMiddleware.ts` | 325 | **KEEP** — core auth middleware. Bearer, Agent-Pass, Session Cookie strategies |
| `services/lib/middlewareGuard.ts` | 127 | **KEEP** — circuit-breaker wrapper for auth guards |
| `services/lib/test/middlewarePipeline.test.ts` | 443 | **KEEP** — auth tests |

### Agent Pass (Ed25519)
| File | Lines | Verdict |
|:---|:---|:---|
| `packages/utils/crypto-identity.ts` | 72 | **KEEP** — Ed25519 keypair, sign, verify |
| `config/agents.json` | 23 | **KEEP** — 3 registered agents |
| `services/ingestion/controllers/telemetry.ts` | 62 | **KEEP** — edge sentinel auth |
| `services/sentinel/src/poller.ts` | 235 | **KEEP** — sentinel egress auth |
| `services/ingestion/server.js:2308` | — | **BUG** — `verifyAgentPassFromKey` undefined |

### Session Cookie (Browser)
| File | Lines | Verdict |
|:---|:---|:---|
| `bearerAuthMiddleware.ts` (session code) | ~100 | **KEEP** — `kudbee_session` cookie, 8h TTL |
| `.env.example` — `SESSION_SECRET` | — | **KEEP** — env var |

### Stream Ticket (SSE)
| File | Lines | Verdict |
|:---|:---|:---|
| `server.js:4089-4163` — ticket endpoint | ~75 | **KEEP** — SSE ticket-granting, 30s TTL |
| `apps/web/src/hooks/useEventStream.ts` | 128 | **KEEP** — client ticket flow |
| `apps/web/src/hooks/useOsStream.ts` | 96 | **KEEP** — client ticket flow |

### RBAC / Tenants
| File | Lines | Verdict |
|:---|:---|:---|
| `services/ingestion/lib/tenants.ts` | 155 | **ARCHIVE** — 3 tenants, 3 roles. No users to assign. Reintroduce in Team Mode. |
| `services/ingestion/lib/tenants.test.ts` | 138 | **ARCHIVE** — tests for archived module |
| `services/ingestion/routes/governance.ts` | 304 | **KEEP** — governance routes (may need role gates simplified) |
| `services/ingestion/routes/audit.ts` | 196 | **KEEP** — audit routes |

### Frontend Auth Gate
| File | Lines | Verdict |
|:---|:---|:---|
| `apps/web/src/components/LoginView.tsx` | 127 | **REMOVE** — hardcoded passkey, no server validation, animated boot screen |
| `apps/web/src/App.tsx` (auth gate: lines 142-150, 485) | ~10 | **REMOVE gate** — localStorage check blocks dashboard |
| `App.tsx` logout button (lines 508-512, 637) | ~10 | **REMOVE** — tied to LoginView |

### Threat Barrier
| File | Lines | Verdict |
|:---|:---|:---|
| `services/lib/synapseProtectionLayer.ts` | 389 | **KEEP** — C4769 behavioral threat scoring, sits BEFORE auth middleware |
| `services/lib/disruptionLayer.ts` | 328 | **KEEP** — auth_bypass attack detection |

### Env Vars
| Variable | Required | Verdict |
|:---|:---|:---|
| `STREAM_SECRET` | Yes | **KEEP** — HMAC for SSE tickets |
| `SESSION_SECRET` | Yes (prod) | **KEEP** — HMAC for browser sessions |
| `EDGE_AGENT_PASS` | Yes | **KEEP** — edge sentinel auth |
| `SENTINEL_AGENT_PASS` | Yes | **KEEP** — sentinel agent auth |
| `KUDBEE_TENANT_MEMBERSHIPS` | No | **ARCHIVE** — no tenants to manage in Alpha |

---

## Critical Bug

**`verifyAgentPassFromKey`** — called at `server.js:2308` in `POST /api/interceptor/verify` handler. **Never defined anywhere.** Will throw `ReferenceError` at runtime. This handler is unreachable in practice (requires `public_key` param which no client sends), but the dead code should be either completed or removed.

---

## What Does NOT Exist (Good)
- No Passport.js (0 strategies)
- No OAuth / OIDC
- No JWT library
- No demo/mock auth
- No AuthContext or AuthProvider (React)
- No Zustand auth store
- No user registration/login/signup flows

The auth surface is smaller than expected for a platform of this size. The complexity is concentrated in `bearerAuthMiddleware.ts` (325 lines, 3 strategies) — and most of that is production infrastructure that is correct to keep.
