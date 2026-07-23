# KUDBEE FUEL GAUGE — Full Site Production Audit & Implementation Plan

**Generated:** 2026-07-23  
**Project:** Kudbee OS v1.0.0 — Live AI Control Tower  
**Phase:** Phase 5 (Production Hardening) — IN PROGRESS → Phase 6 (Multi-Agent Containerization) — PLANNED  
**Deployment Target:** Heroku (5 dynos, ~1.5GB memory budget)

---

## EXECUTIVE SUMMARY

Kudbee is a spatial-fluidic operating system for multi-agent governance, real-time telemetry, and cryptographic audit trails. It is a full-stack monorepo organized into three layers:

| Layer | Stack |
|:------|:-----|
| **Web** (`apps/web`) | React 19, Vite 6, Tailwind CSS 4, Zustand 5, React Router 7, Recharts 3, Motion, D3 7, Lucide React |
| **API** (`services/ingestion`) | Express 5, Neon Serverless Postgres + pgvector, ioredis (Upstash Redis), Groq LPU, Google Gemini |
| **Workers** (`services/`) | Node.js, Redis-backed job queue, HERMES autonomous auditor, CRUCIBLE adversarial agent, Sentinel edge monitor |

**Repository:** `KudbeeZero/Kudbee-fuel-gage` (GitHub) — npm workspaces monorepo with Turborepo orchestration  
**Tests:** None (all verification via 24 custom scripts)  
**Formal API Spec:** None (Zod runtime validation only)  
**CI:** GitHub Actions (verify.yml, session-log.yml), standardized on Node 22

---

## PHASE 1: CRITICAL BUGS — PRODUCTION-BLOCKING ISSUES

These 9 issues will cause crashes, data loss, or security breaches in production. Must be resolved before deployment.

### 1.1 — BROKEN IMPORT: `getSlowRedisClient` in HERMES Agent

**File:** `services/agents/hermes.js:24`  
**Severity:** CRITICAL — Process crash on import  
**Problem:** `import { getSlowRedisClient } from '../lib/redis.js'` — this function does NOT exist in `services/lib/redis.js`. The HERMES agent will crash at module initialization, taking down the `hermes-worker` Heroku dyno. The Procfile runs `worker.js` which imports hermes.js; the worker will fail silently at startup.

**Affected Components:**
- `services/agents/hermes.js` — directly (line 24)
- `worker.js` — transitively (imports hermes)
- Procfile dyno: `hermes-worker` (will crash-loop)

**Fix:**
```javascript
// Option A: Add getSlowRedisClient to services/lib/redis.js
export function getSlowRedisClient() {
  return getRedisClient({ db: 1 });
}

// Option B: Replace import in hermes.js with getRedisClient
import { getRedisClient } from '../lib/redis.js';
// Replace all getSlowRedisClient() calls with getRedisClient()
```

**Files to change:**
1. `services/lib/redis.js` — add `getSlowRedisClient` factory
2. `services/agents/hermes.js` — remove broken import, use correct function

---

### 1.2 — SENTINEL ADMIN BYPASS HEADER NEVER SENT

**File:** `services/sentinel/src/poller.ts:148-152`  
**Severity:** HIGH — Feature silently non-functional  
**Problem:** In `admin` egress mode, the `X-Admin-Bypass: true` header is set in a local `headers` variable but the `fetch()` call hardcodes a new `headers` object, discarding the admin bypass header. This means the admin bypass feature intended for the sentinel's admin mode is completely non-functional.

**Fix:**
```typescript
// BUG: Line 148-152
const headers: Record<string, string> = { ... };
if (opts?.mode === 'admin') {
  headers['X-Admin-Bypass'] = 'true';
}
// BUG: fetch call uses a NEW object, not the `headers` object above
const res = await fetch(url, {
  method: 'POST',
  headers: {  // <-- THIS IS WRONG
    'Content-Type': 'application/json',
    'X-Agent-Pass': 'sentinel-edge-v1',
  },
  body: JSON.stringify(payload),
});

// FIX: Use the `headers` object that has admin bypass
const res = await fetch(url, {
  method: 'POST',
  headers,  // <-- correct
  body: JSON.stringify(payload),
});
```

**Files to change:**
1. `services/sentinel/src/poller.ts` — fix headers spread in fetch call

---

### 1.3 — GOVERNANCE LEDGER: `persistToNeon` Returns Undefined ID

**File:** `services/governance/ledger.js:165-173, 232`  
**Severity:** HIGH — Data integrity issue  
**Problem:** `persistToNeon` returns `{ ok: true }` but the caller at line 232 accesses `res.id` which is `undefined`. The ledger ID propagation is broken — subsequent operations that depend on tracking ledger entry IDs will receive `undefined`.

**Fix:**
```javascript
// Line 165-173
async function persistToNeon(input, output, resultStatus, provider, event_type, reason) {
  const res = await runInsert(
    `INSERT INTO reasoning_ledger (...) VALUES (...) RETURNING id`,
    [...]
  );
  // BUG: was { ok: true }
  // FIX: propagate the id
  return { ok: true, id: res?.rows?.[0]?.id ?? res?.id };
}
```

**Files to change:**
1. `services/governance/ledger.js` — propagate id from INSERT RETURNING

---

### 1.4 — CRUCIBLE AGENT: `traceId` Referenced Before Assigned in Catch Block

**File:** `services/agents/crucible.js:88, 130`  
**Severity:** MEDIUM — Defensive crash  
**Problem:** `traceId` is assigned inside the try block (line 88), but referenced in the catch block (line 130). If the error occurs before `generateTraceId()` is called (e.g., during task selection), `traceId` is `undefined` and the catch handler dereferences `undefined`.

**Fix:**
```javascript
// Move traceId declaration before try block
const traceId = generateTraceId();
try {
  // ... existing code, reuse traceId
} catch (err) {
  recordReasoning(null, { error: err.message }, 'FAILURE', 'crucible', 'ERROR', err.message);
}
```

**Files to change:**
1. `services/agents/crucible.js` — hoist traceId generation before try/catch

---

### 1.5 — GOVERNANCE APPROVAL RACE CONDITION (FIX-008, VERIFIED FIXED)

**File:** `services/governance/router.js:236-263`  
**Severity:** CRITICAL (PREVIOUSLY) — Confirmed fixed  
**Status:** RESOLVED per FIX-008 (STATE_OF_THE_OS.md). Added idempotency check: read `governance:proven:{id}` before writing.  
**Action:** No change needed. Verify idempotency is present in current code.

---

### 1.6 — DB SCHEMA DEFAULT MISMATCH (FIX-009, VERIFY FIX)

**File:** `services/ingestion/server.js:436`  
**Severity:** MEDIUM (PREVIOUSLY)  
**Status:** Should be RESOLVED per FIX-009. Think tokens default changed from 'PROVEN' to 'PENDING_APPROVAL' in SQL schema.  
**Action:** **Verify** that the SQL DEFAULT matches thinkTokenGenerator.ts defaults in the current code.

---

### 1.7 — HARDCODED API KEYS IN SOURCE (FIX-010, VERIFY FIX)

**File:** `apps/web/src/hooks/useKeyManager.ts:20-22`  
**Severity:** CRITICAL (PREVIOUSLY)  
**Status:** Should be RESOLVED per FIX-010. All three hardcoded key fallbacks (OpenAI, Anthropic, Gemini) replaced with empty string.  
**Action:** **Verify** by reading current file to confirm no keys remain.

---

### 1.8 — MISSING `useEffect` CLEANUPS (FIX-005, VERIFY)

**Files:** 5 sites (OllamaChat, ConsoleDock, AgentTerminal, useVectorSync, usePlaygroundBackend)  
**Status:** Should be RESOLVED per FIX-005.  
**Action:** **Verify** cleanup functions are present in all 5 affected effects.

---

### 1.9 — SILENT DATA LOSS: Empty Catch Blocks (FIX-011, VERIFY)

**Files:** 10 sites (telemetryBatcher, server.js, worker.ts, agentLogger.ts)  
**Status:** Should be RESOLVED per FIX-011.  
**Action:** **Verify** `console.warn` with descriptive prefixes added to all previously-silent catch blocks.

---

## PHASE 2: BACKEND HARDENING — DATA INTEGRITY & RESILIENCE

### 2.1 — ORPHANED FUNCTION: `getSlowRedisClient` (Complete Fix)

**Issue:** After fixing the HERMES crash (1.1), ensure `getSlowRedisClient` is properly implemented with correct Redis instance isolation. The "Slow Brain" Redis instance should use `REDIS_SLOW_URL` env var if available, falling back to the primary Redis URL.

**Files to change:**
1. `services/lib/redis.js` — implement `getSlowRedisClient` with env var detection

---

### 2.2 — Sentinel `startPoller` Missing Graceful Shutdown

**File:** `services/sentinel/src/index.ts`  
**Problem:** No SIGTERM/SIGINT handlers. The sentinel dyno will not gracefully stop — Heroku will force-kill after 30s. The poller state (backoff counter, circuit breaker) is lost.

**Fix:**
```typescript
import { registerShutdown } from '../../lib/shutdown.js';
// In init:
registerShutdown(null, 'sentinel');
process.on('SIGTERM', () => {
  console.log('[SENTINEL] Shutting down...');
  process.exit(0);
});
```

---

### 2.3 — Monitor Agent: `selfHeal()` is a No-Op

**File:** `services/monitor/agent.js:111-113`  
**Problem:** Critical alerts are raised (failure rate >50%) but `selfHeal()` only logs "Attempting self-healing..." without any actual remediation.

**Fix:** Implement actual self-healing. Options:
1. Restart connection pools (`getDbPool().end()`, `getRedisClient().quit()` then reconnect)
2. Signal the load balancer to route traffic away
3. Trigger an incident via webhook/discord/slack

---

### 2.4 — ALL In-Memory State Lost on Restart

**Files:** `server.js` (multiple locations)  
**Problem:** These states are purely in-process and lost on every dyno restart or deploy:
- Tenant settings (line 2409)
- Feedback state (line 4291)
- Auto-tune state (line 4337)
- Alert configuration (line 2380)
- Policy state (line 3557)
- Vector sync state (line 3564)
- Audit vault state (line 4465)
- Router provider state / `PROVIDER_CONFIG` (line 3787)

**Fix (per state):** Persist to Redis (preferred — matches existing architecture) or to Postgres.

| State | Persistence Target | Priority |
|:------|:------------------|:---------|
| Tenant settings | Postgres `settings` table OR Redis `kudbee:settings:tenant:*` | HIGH |
| Alert configuration | Redis `kudbee:alerts:config` | HIGH |
| Router provider state | Redis `kudbee:router:providers` | MEDIUM |
| Auto-tune state | Redis `kudbee:governance:tune:*` | MEDIUM |
| Feedback state | Redis `kudbee:governance:feedback:*` | LOW |
| Vector sync state | Redis `kudbee:vector:sync` | LOW |
| Policy state | Redis `kudbee:governance:policies` | LOW |
| Audit vault state | Redis `kudbee:audit:vault:*` | LOW |

---

### 2.5 — Circuit Breaker: HALF_OPEN State Local-Drift Risk

**File:** `services/lib/circuitBreaker.ts`  
**Problem:** `_halfOpenPermits` is maintained locally but circuit breaker state is read from Redis. On process restart or multi-instance, the local counter and Redis state can drift, causing inconsistent `allowRequest()` responses.

**Fix:** Use Redis atomic operations (`DECR` on a `kudbee:circuit:<name>:permits` key) instead of local counter, read permits from Redis on every `allowRequest()` call.

---

### 2.6 — Job Queue: No Atomic Dequeue

**File:** `services/lib/jobQueue.ts`  
**Problem:** `dequeueJob` does RPOP without BRPOPLPUSH to a processing list. If the worker crashes between dequeue and completion, the job is permanently lost.

**Fix:** Implement a processing list pattern:
```javascript
// BRPOPLPUSH from queue to processing list
// On completion: LREM from processing list
// On crash/restart: replay processing list back to queue
```

---

### 2.7 — Monitor Agent: Fresh Key Pair on Every Boot

**File:** `services/monitor/agent.js:10`  
**Problem:** `generateKeyPair()` is called on every startup. Signatures from the previous process lifecycle cannot be verified after restart. Agent identity is non-deterministic.

**Fix:** Generate key pair once, persist to Redis (`kudbee:agents:monitor:keypair`), load on startup. If no persistent key exists, generate and store.

---

### 2.8 — Rate Limiter: Fixed Window Burst Vulnerability

**File:** `services/lib/rateLimiter.ts`  
**Problem:** Fixed window algorithm allows up to 2x rate limit at window boundaries (300 requests in last second of window N + 300 in first second of window N+1 = 600 in ~2 seconds).

**Fix:** Implement sliding window log algorithm using Redis sorted sets (`ZADD` with timestamp scores, `ZREMRANGEBYSCORE` to evict old entries). This provides accurate within-window counting with no boundary burst issue.

---

### 2.9 — Backend Agent Utilities Audit

**Status:** FIX-021 (STATE_OF_THE_OS.md) documents the rate limiting architecture upgrade. Verify:
1. Lua-eval atomic INCR+EXPIRE is implemented (replaces pipeline TOCTOU)
2. Per-endpoint 60/min cap is active
3. `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers are consistently returned
4. Excluded endpoints (`/health`, `/api/system/health-deep`, `/api/system/diagnostics`) are correctly whitelisted

---

## PHASE 3: FRONTEND HARDENING — UI INTEGRITY & SECURITY

### 3.1 — CRITICAL: Authentication is Cosmetic (LoginView Hardcoded Passkey)

**File:** `apps/web/src/components/LoginView.tsx:21`  
**Severity:** CRITICAL — Not real security  
**Problem:** The entire authentication mechanism is a plain-text string comparison (`'kudbee-admin-2026'`) in frontend JavaScript. Anyone who opens DevTools or reads the minified source can bypass authentication. There is no server-side validation, no hashing, no rate limiting, no session management beyond localStorage.

**Fix options:**
1. **Minimum viable:** Add server-side passcode validation endpoint (`POST /api/auth/verify`) with rate limiting and SHA-256 comparison
2. **Recommended:** Implement proper authentication (JWT tokens, refresh token rotation, HTTP-only cookies)
3. **Quick win:** Move passcode hash to environment variable, validate server-side

**Immediate actions:**
- Remove hardcoded passkey from source
- Create `POST /api/auth/login` endpoint with bcrypt/argon hash comparison
- Store authenticated state in HTTP-only cookie + sign with HMAC
- Add login attempt rate limiting (5 attempts per 15 minutes per IP)

---

### 3.2 — CRITICAL: API Keys Stored in localStorage Plaintext

**File:** `apps/web/src/hooks/useKeyManager.ts`, `apps/web/src/components/LoginView.tsx:24-26`  
**Severity:** CRITICAL — XSS vulnerability would leak provider credentials  
**Problem:** OpenAI, Anthropic, and Gemini API keys are stored in `localStorage` in plain text without encryption. Any XSS vulnerability in any dependency would grant complete access.

**Fix:**
1. Encrypt keys before localStorage storage (use Web Crypto API `SubtleCrypto.encrypt`)
2. Store encryption key in memory only (session lifetime)
3. Never expose raw keys in React state or DOM
4. Add Content Security Policy headers to prevent inline script execution

**Immediate actions:**
- Add CSP header: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- Implement `crypto.subtle` based encryption wrapper for sensitive localStorage values

---

### 3.3 — Fabricated/Simulated Data Shown as "Real-Time"

**Files:** `apps/web/src/App.tsx:388-470` (circuitBreakerData), `apps/web/src/App.tsx:468-474` (models)  
**Severity:** HIGH — Misleading users with fake data  
**Problem:** 
- `circuitBreakerData` (the telemetry circuit breaker chart) fabricates baseline data using `(Math.sin(idx + now.getMinutes() * 0.3))` and arbitrary failure detection (`logId % 9 === 0`). The chart is labeled as "Real-time API Gateway Rate Success vs Failure (60m)" but contains completely artificial data.
- The `models` array is hardcoded and never updated. It shows as "Live Routes" but is a static list.

**Fix:**
1. Remove all fabricated baselines from `circuitBreakerData`. Show only actual data.
2. Add an honest empty state: "Not enough data to chart" when insufficient real data
3. Replace hardcoded `models` with live fetch from `/api/router/status`
4. Add a `dataSource` label making it clear when data is simulated vs. real

---

### 3.4 — `fetchTelemetryData` Needs `_mountedRef` Protection

**File:** `apps/web/src/App.tsx` (telemetry polling effect)  
**Problem:** The telemetry polling `useEffect` does not include a mounted guard. If the component unmounts mid-fetch (e.g., during auth transition), `setHistoryError` or `setDbLogs` will attempt state updates on unmounted components, producing React warning `"Can't perform a React state update on an unmounted component"`.

**Fix:** Add `_mountedRef` pattern to the telemetry polling effect:
```typescript
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;
  return () => { mountedRef.current = false; };
}, []);

// In fetchTelemetryData:
if (!mountedRef.current) return;
setDbLogs(logs);
setDbSummary(summary);
```

---

### 3.5 — Unused Dead Code in App.tsx

**File:** `apps/web/src/App.tsx:181-187`  
**Problem:** `claudeProCap`, `cursorProCap`, `chatGptCap`, `apiGatewayCap`, `editingProvider`, `tempCapVal` are declared but never rendered or passed to children.

**Fix:** Remove dead state variables to reduce bundle size and cognitive load.

---

### 3.6 — Firewall Page: Unreachable Condition in Health Panel Render

**File:** `apps/web/src/pages/firewall.tsx:350-370`  
**Problem:** The condition chain `!deepHealth ? (deepHealthLoading ? skeleton : "Probing…") : deepHealthError ? "Probing…" : actualContent` has unreachable branches. When `!deepHealth && !deepHealthLoading`, the error state text shown is misleading.

**Fix:** Restructure to explicit, tested states:
```tsx
if (deepHealthLoading) return <Skeleton />;
if (deepHealthError) return <ErrorBanner message={deepHealthError} />;
if (!deepHealth) return <EmptyState message="Health probe pending..." />;
return <ActualContent />;
```

---

### 3.7 — StarRating: Integer Rating Visual Bug

**File:** `apps/web/src/pages/telemetry.tsx:55-66`  
**Problem:** For integer ratings (e.g., `5`), the condition `star === Math.ceil(rating)` on the last star makes it partially filled (`fill-emerald-400/30`) instead of fully filled.

**Fix:**
```tsx
const isFull = star <= Math.floor(rating);
const isPartial = !isFull && star === Math.ceil(rating) && rating % 1 !== 0;
const fillClass = isFull ? 'fill-emerald-400' : isPartial ? 'fill-emerald-400/30' : 'fill-slate-800';
```

---

### 3.8 — History Page: `expandedLog` Type Mismatch

**File:** `apps/web/src/pages/history.tsx:412`  
**Problem:** `expandedLog` is `string | number | null` but log IDs can differ in type. Strict equality `expandedLog === log.id` fails if one is a string and the other is a number.

**Fix:** Normalize all IDs to strings for comparison:
```tsx
const expandedLogStr = String(expandedLog);
// ...
{expandedLogStr === String(log.id) && <DetailPanel />}
```

---

### 3.9 — OllamaChat: Missing `handleSend` Error Handling

**File:** `apps/web/src/pages/OllamaChat.tsx:318`  
**Problem:** `handleSend` is async but the call in `onSubmit` is not awaited. Errors during send are silently swallowed.

**Fix:**
```typescript
const onSubmit = async () => {
  // ...
  try {
    await handleSend(messages);
  } catch (err) {
    // Show error toast in chat
    setHistory(prev => [...prev, {
      role: 'system',
      content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
    }]);
  }
};
```

---

### 3.10 — `apiGet` Does Not Parse Error Response Body

**File:** `apps/web/src/lib/apiClient.ts:109-113`  
**Problem:** Unlike `apiPost` and `apiPatch`, `apiGet` does not attempt to extract error details from the response body. Inconsistent error reporting across HTTP methods.

**Fix:** Add error body parsing to `apiGet` to match `apiPost`/`apiPatch`:
```typescript
if (!res.ok) {
  let detail = '';
  try { detail = JSON.stringify(await res.json()); } catch { /* */ }
  throw new Error(`GET ${path} failed (${res.status}): ${detail}`);
}
```

---

### 3.11 — Telemetry Batcher: Batch Data Loss on Validation Errors

**File:** `apps/web/src/lib/telemetryBatcher.ts:46-54`  
**Problem:** During `flush()`, events are spliced from the queue BEFORE the API call succeeds. If the server returns a 4xx validation error, those events are permanently lost.

**Fix:** Splice events from the queue only AFTER successful response:
```typescript
const batch = _queue.slice(0, MAX_BATCH_SIZE);
// ... send batch ...
if (res.ok) {
  _queue.splice(0, batch.length);
} else {
  // Re-queue or store to dead-letter
  console.warn('[BATCHER] Flush failed, retaining events in queue', batch.length);
}
```

---

### 3.12 — No Global API Request Deduplication

**Files:** `apps/web/src/lib/apiClient.ts`, `apps/web/src/App.tsx`, multiple pages  
**Problem:** Multiple components independently poll the same endpoints (e.g., `/api/telemetry/logs?limit=50`). In-flight duplicate requests waste resources.

**Fix:** Add a simple in-flight deduplication cache to `apiClient.ts`:
```typescript
const inflightRequests = new Map<string, Promise<any>>();
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const key = `${path}:${JSON.stringify(init)}`;
  if (inflightRequests.has(key)) return inflightRequests.get(key);
  const promise = _apiGet(path, init);
  inflightRequests.set(key, promise);
  promise.finally(() => inflightRequests.delete(key));
  return promise;
}
```

---

## PHASE 4: OUTING PLAN — FEATURE COMPLETENESS GAPS

The `OUTING_PLAN.md` defines a 20-phase enterprise hardening roadmap. Below is the current implementation status for each phase item.

### PHASE 4.1 — Think Plugin Suite (4 plugins)

| Item | Description | Status |
|:-----|:-----------|:-------|
| 1A.1 | Add PanelErrorBoundary wrappers to all 4 | **NEEDS VERIFICATION** |
| 1A.2 | Add mountedRef guards on all async setState calls | **NEEDS VERIFICATION** |
| 1A.3 | Add empty/loading/error states | **PARTIALLY DONE** — Empty states added (FIX-017), loading/error gaps remain |
| 1A.4 | Fix ThinkStoragePlugin token_hash "undefined" bug | **NEEDS VERIFICATION** |
| 1A.5 | Fix ThinkTrajectoriesPlugin JSON.stringify crash | **NEEDS VERIFICATION** |
| 1A.6 | Audit all useEffect cleanup | **NEEDS VERIFICATION** |
| 1A.7 | Add proper TypeScript types (remove `any`) | **NOT STARTED** |

### PHASE 4.2 — Governance Plugin Suite (3 plugins + 3 sub-components)

| Item | Description | Status |
|:-----|:-----------|:-------|
| 1B.1 | PROVEN badge color (amber → violet) | **DONE** (FIX-015) |
| 1B.2 | Claim/lock mechanism for concurrent HITL approval | **DONE** (FIX-008 — idempotency check) |
| 1B.3 | HermesAuditorPlugin: add audit trail viewer with pagination | **NOT STARTED** |
| 1B.4 | EdgeSentinelPlugin: ingress/egress throughput visualization | **NOT STARTED** |
| 1B.5 | AutoTuneButton: add progress stages | **NOT STARTED** |
| 1B.6 | PolicyEnginePanel: add policy simulation mode | **NOT STARTED** |
| 1B.7 | GovernanceQueueTray: batch approve/reject | **NOT STARTED** |

### PHASE 4.3 — Gateway & Network Layer

| Item | Description | Status |
|:-----|:-----------|:-------|
| 2A.1-2A.4 | Provider status grid, key rotation, routing visualizer, circuit breaker indicators | **NOT STARTED** |
| 2B.1-2B.6 | New NetworkSwitch tab page (port status, latency matrix, connection pool gauge, rate limit countdown) | **NOT STARTED** |

### PHASE 4.4 — Playground & Sandbox

| Item | Description | Status |
|:-----|:-----------|:-------|
| 3A.1-3A.7 | Session persistence, cost projection, model capability matrix, RAG heatmap, real tokenizer, A/B comparison, usage statistics | **NOT STARTED** |
| 3B.1-3B.3 | Agent vitals, intercept rule editor, confidence score visualization | **NOT STARTED** |

### PHASE 4.5 — Monitoring & Telemetry (Partial)

| Item | Description | Status |
|:-----|:-----------|:-------|
| 4A.1 | LatencyHistogram: p50/p95/p99 percentile markers | **NOT STARTED** |
| 4A.2 | TerminalHUDTicker: live SSE data instead of static text | **NOT STARTED** |
| 4A.3 | DiagnosticTicker: anomaly detection highlights | **NOT STARTED** |
| 4A.4 | TelemetryPage: time-range selector | **NOT STARTED** |
| 4B.1-4B.5 | Alert priority levels, acknowledgment workflow, toast auto-dismiss, stacking, ToastContainer | **NOT STARTED** |

### PHASE 4.6 — History & Logs

| Item | Description | Status |
|:-----|:-----------|:-------|
| 5A.1 | HistoryPage: advanced filters | **DONE** (useTelemetrySearch with query/verdict/filter params) |
| 5A.2 | HistoryPage: export CSV/JSON | **DONE** (useAuditExport) |
| 5A.3 | AuditVaultCard: cryptographic verification | **NOT STARTED** |
| 5A.4 | DLQInspector: retry and inspection UI | **DONE** |
| 5A.5-5A.6 | ThinkPage: trajectory replay and comparison | **NOT STARTED** |

### PHASE 4.7-4.10 — Terminal, Layout, Accessibility, Pipelines, Services, CI

| Phase | Total Items | Done | Partial | Not Started |
|:------|:-----------|:-----|:--------|:------------|
| 6 — Terminal & Command (Ollama) | 5 + 3 | 0 | 3 | 5 |
| 7 — Desktop & Layout | 5 + 5 | 0 | 2 | 8 |
| 8 — Data Pipeline (Plugins + Web Workers) | 4 + 4 | 0 | 0 | 8 |
| 9 — Services (Memory, Governance) | 5 + 5 | 0 | 1 | 9 |
| 10 — Final Verification (CI + Docs) | 4 + 7 | 2 | 2 | 7 |

### OUTING PLAN Summary

| Phase | Total Items | Done | Partial | Not Started |
|:------|:-----------|:-----|:--------|:------------|
| 1 — Plugin Ecosystem | 14 | 2 | 4 | 8 |
| 2 — Gateway & Network | 10 | 0 | 0 | 10 |
| 3 — Playground & Intelligence | 10 | 0 | 1 | 9 |
| 4 — Monitoring & Telemetry | 9 | 0 | 1 | 8 |
| 5 — History & Logs | 6 | 3 | 0 | 3 |
| 6 — Terminal & Command | 8 | 0 | 3 | 5 |
| 7 — Desktop, A11y, Responsive | 10 | 0 | 2 | 8 |
| 8 — Data Pipeline | 8 | 0 | 0 | 8 |
| 9 — Services | 10 | 0 | 1 | 9 |
| 10 — CI & Docs | 11 | 3 | 3 | 5 |
| **TOTAL** | **96** | **8** | **15** | **73** |

**Outing Plan completion:** ~8% done, ~24% partial, ~68% not started.

---

## PHASE 5: ARCHITECTURE CONCERNS — STRUCTURAL LOAN

### 5.1 — Monolithic Server.js (4,647 Lines)

**File:** `services/ingestion/server.js`  
**Concern:** Single file contains middleware, all inline route handlers, database schema definition, helper functions, SSE setup, auth, and static serving. Testing any single endpoint requires booting the entire server. Debugging is difficult due to vast scope.

**Recommendation:** Next major refactor cycle: split into module-per-route files within `routes/` (following the pattern established by `routes/audit.ts`, `routes/governance.ts`, etc.). All inline routes should be moved into dedicated route modules.

**Current inline routes that need extraction (approximate count: 60+ routes):**
- Telemetry ingest (POST ingest, POST batch, edge-ingest, CSV import, purge, etc.)
- Memory CRUD (remember, recall, dictionary lookup)
- Think tokens (synthesize, archive, trajectories, anomalies, energy-mesh)
- Governance (feed, proposed, pending, approve, reject, resolve, mint-think-token, union/contracts, dispatch, feedback, tune)
- Interceptor (threat-heatmap, triage CRUD, verify)
- Agent fleet (context, evaluate, dispatch, crucible)
- Router (status, select, reset)
- System (lifecycle, diagnose-breadcrumb, test-connections, compare-providers)
- Provider routing (OpenAI-compatible /v1/chat/completions)
- SSE streams (events, OS-stream, telemetry-stream)
- Auth (stream-ticket)

---

### 5.2 — No Formal API Specification

**Concern:** No OpenAPI/Swagger/GraphQL/Protobuf files exist. The API contract is defined implicitly by Zod runtime validation + Express handler bodies. Client developers must reverse-engineer request/response shapes from the frontend code.

**Recommendation:** Generate OpenAPI 3.1 spec:
1. Extract all Zod schemas from `packages/types/index.ts`
2. Generate OpenAPI schema from Zod → `zod-to-openapi` or `@asteasolutions/zod-to-openapi`
3. Document all ~90 endpoints with request/response shapes
4. Serve Swagger UI at `/api/docs` in development mode

---

### 5.3 — No Formal Test Framework

**Concern:** No jest, vitest, mocha, or any test framework is configured. All verification is done via 24 custom Node.js scripts with no assertion library. There is zero unit test coverage, zero integration test coverage, zero E2E test coverage.

**Recommendation:** Introduce vitest (shares Vite config with web app):
1. Add `vitest` devDep across workspaces
2. Write unit tests for all `services/lib/*` modules (DB, Redis, circuitBreaker, rateLimiter, jobQueue, shutdown)
3. Write integration tests for Express routes using `supertest`
4. Write component tests for top 20 React components using `@testing-library/react`
5. Write E2E smoke tests using Playwright (login → navigate each of 14 tabs → verify content)

---

### 5.4 — Dependency State Drift

**Concern:**
- Two versions of `@google/genai`: `^2.4.0` (web) vs `^2.12.0` (ingestion)
- Mobile uses TypeScript `^5.3.3` while everything else uses `^5.7.0`
- Mobile uses React 18 while web uses React 19
- ESLint and Prettier configs exist but their packages are NOT declared as devDependencies in any package.json
- Dual lockfiles: `package-lock.json` (npm) and `bun.lock` (bun) — package manager ambiguity

**Recommendation:**
1. Hoist `@google/genai` to root workspace, use `*` references
2. Delete `bun.lock`, standardize on npm (`packageManager: "npm@10.9.8"`)
3. Add `prettier` and `@eslint/js` as root devDependencies
4. Bump mobile workspace to TypeScript `^5.7.0` and React 19 (or justify keeping 18)

---

### 5.5 — PostgreSQL Schema Versioning

**Concern:** `ensureSchema()` in server.js uses `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`. There is no migration tool (no Prisma, no Knex, no Sequelize). Column additions are scatter-shot across `ensureSchema()` and `.sql` files in `migrations/` with no tracking of which migrations have been applied.

**Recommendation:** Two options:
1. **Lightweight:** Numbered SQL migrations with a `_migrations` tracking table (simple, matches existing pattern)
2. **Full-featured:** Introduce Prisma ORM with `prisma migrate` (type safety, auto-generated client)

---

### 5.6 — Error Handling Consistency

**Concern:** Inconsistent error handling patterns across the codebase:
- Some catch blocks silence errors with `catch(() => {})` (FIX-011 partially addressed this)
- Some return `{ ok: false, error }` objects
- Some throw errors
- Some reject with http-errors
- Server.js global error handler catches remaining errors but provides minimal context

**Recommendation:** Standardize on a consistent error response shape:
```typescript
interface ApiError {
  error: true;
  code: string;        // MACHINE_READABLE error code
  message: string;     // Human-readable description
  details?: unknown;   // Optional structured details (validation errors, etc.)
}
```

---

## PHASE 6: PRODUCTION DEPLOYMENT CHECKLIST

### 6.1 — Pre-Deployment

- [ ] Fix all 9 critical issues from Phase 1
- [ ] Verify RESOLVED status of FIX-008, FIX-009, FIX-010, FIX-005, FIX-011
- [ ] Run `npm run typecheck` across ALL workspaces (zero errors)
- [ ] Run `cd apps/web && npm run build` (zero warnings)
- [ ] Run `node scripts/verify-e2e.mjs` (all checks pass)
- [ ] Test Procfile locally: all 5 dynos start without crashes
- [ ] Verify Redis connectivity: `REDIS_URL`, `REDIS_SLOW_URL`, `REDIS_RATE_LIMIT_URL` all reachable
- [ ] Verify Neon Postgres connectivity: `DATABASE_URL` reachable, pgvector extension loaded
- [ ] Verify Groq and Gemini API keys are set as env vars (not in source)
- [ ] Set `NODE_ENV=production`
- [ ] Set appropriate `CORS_ALLOW_ORIGINS` (not `*` in production)
- [ ] Set appropriate `SAMPLE_RATE` for production load

### 6.2 — Environment Variables

| Variable | Required | Purpose |
|:---------|:---------|:-------|
| `DATABASE_URL` | YES | Neon Serverless Postgres |
| `REDIS_URL` | YES | Fast Brain — UI telemetry, SSE pub/sub |
| `REDIS_SLOW_URL` | YES | Slow Brain — HERMES, Crucible, JobQueue |
| `REDIS_RATE_LIMIT_URL` | YES | Rate limiter (separate Redis instance) |
| `GEMINI_API_KEY` | YES | Google Gemini triage/embedding |
| `GROQ_API_KEY` | YES | Groq LPU think token synthesis |
| `GITHUB_TOKEN` | YES | GitHub file connector |
| `PORT` | NO | Server port (default: 3000) |
| `NODE_ENV` | NO | Environment (production/development) |
| `CORS_ALLOW_ORIGINS` | YES | CORS origins (DO NOT use `*` in production) |
| `SAMPLE_RATE` | NO | Telemetry sampling rate (1=all, 5=20%) |
| `STREAM_SECRET` | YES | HMAC key for SSE stream ticket auth |
| `VITE_API_URL` | NO | Backend URL override for frontend build |
| `KUDBEE_API_URL` | NO | Sentinel backend URL |
| `CRUCIBLE_ENABLED` | NO | Enable/disable CRUCIBLE agent |

### 6.3 — Deployment

- [ ] Deploy to Heroku staging first
- [ ] Smoke test all 14 tabs load content
- [ ] Verify SSE streams connect (OS stream, telemetry stream, events stream)
- [ ] Verify governance approval flow end-to-end
- [ ] Verify HERMES auditor heartbeat + logs
- [ ] Verify sentinel edge egress is polling
- [ ] Verify rate limiting headers are returned on API responses
- [ ] Verify Prometheus metrics at `/metrics` endpoint
- [ ] Run `verify-endpoints.sh` against production URL
- [ ] Deploy to production

### 6.4 — Monitoring Setup

- [ ] Configure Heroku log drain (Papertrail, LogDNA, or similar)
- [ ] Set up Heroku alerts for H25/H27 errors
- [ ] Set up database connection pool monitoring (should stay under 15 of 20 max)
- [ ] Set up Redis memory monitoring (Upstash dashboard)
- [ ] Set up Groq/Gemini API usage monitoring
- [ ] Set up Sentry error tracking (frontend + backend)
- [ ] Configure uptime monitor for `/health` endpoint on each dyno

---

## PHASE 7: COMPONENT INVENTORY — COMPLETE FILE MAP

### 7.1 — Backend Files

| Path | Lines | Purpose |
|:-----|:------|:-------|
| `services/ingestion/server.js` | 4,647 | Main Express server — all routes, middleware, SSE, auth |
| `services/lib/db.js` | 462 | Postgres connection pool + in-memory fallback |
| `services/lib/redis.js` | 140 | Redis client factories (fast, slow, rate-limit) |
| `services/lib/rateLimiter.ts` | 68 | Fixed-window Redis rate limiter (Lua atomic) |
| `services/lib/circuitBreaker.ts` | 151 | Circuit breaker (CLOSED/OPEN/HALF_OPEN) |
| `services/lib/jobQueue.ts` | 165 | Redis-list-backed job queue with DLQ |
| `services/lib/shutdown.js` | 33 | Graceful shutdown (SIGTERM/SIGINT, 30s force) |
| `services/lib/agentLogger.ts` | — | Structured JSON logging + SSE broadcast |
| `services/lib/tokenBucket.ts` | — | Redis-backed token bucket rate limiter |
| `services/lib/cache.ts` | — | Application cache |
| `services/lib/energyMesh.ts` | — | Energy mesh heatmap |
| `services/lib/ftwbMiddleware.ts` | — | FTWB middleware (agent auth) |
| `services/lib/groqClient.ts` | — | Groq API client |
| `services/lib/semanticCache.ts` | — | Semantic (embedding-based) cache |
| `services/lib/agcContract.ts` | — | AGC contract management |
| `services/lib/breadcrumbs.ts` | — | Breadcrumb diagnostic trail |
| `services/lib/sinkAccumulator.ts` | — | Sink accumulator |
| `services/lib/probationRegistry.ts` | — | Probation docket registry |
| `services/lib/agentAudit.ts` | — | Agent audit trail |
| `services/lib/middlewareChain.ts` | — | Middleware chain utility |
| `services/lib/unifiedEvents.ts` | — | Unified event bus |
| `services/lib/settingsStore.ts` | — | Settings persistence |
| `services/lib/budgetGate.ts` | — | Budget gating |
| `services/lib/pruner.ts` | — | Periodic pruner (used by worker.js) |
| `services/governance/router.js` | 288 | Tag registry + governance action routing |
| `services/governance/ledger.js` | 276 | Reasoning ledger with in-memory + Redis + Neon persistence |
| `services/agents/crucible.js` | 158 | CRUCIBLE adversarial agent (think token generator) |
| `services/agents/hermes.js` | 413 | HERMES autonomous logic auditor |
| `services/monitor/agent.js` | 196 | Telemetry monitor agent (anomaly + failure rate) |
| `services/sentinel/src/index.ts` | 33 | Sentinel HTTP server entry |
| `services/sentinel/src/poller.ts` | 236 | Sentinel polling + circuit breaker |
| `services/sentinel/src/governance.ts` | 69 | Sentinel risk scoring (pure functions) |
| `services/memory/vectorStore.ts` | — | pgvector vector store |
| `services/memory/thinkTokenGenerator.ts` | — | Think token generator |
| `services/memory/embedText.ts` | — | Embedding utility (Gemini) |
| `services/memory/pcaReducer.ts` | — | PCA dimensionality reducer |
| `services/memory/topologyIngest.ts` | — | System topology ingest |
| `worker.js` | 268 | HERMES background worker (poll loop + Gemini LLM) |
| `main.py` | — | Python/FastAPI standalone telemetry API (SQLite) |

### 7.2 — Frontend Files

| Path | Lines | Purpose |
|:-----|:------|:-------|
| `apps/web/src/App.tsx` | 1,059 | Root shell: auth, tabs, telemetry, settings, sidebar |
| `apps/web/src/main.tsx` | ~20 | React entry: ErrorBoundary + OsStreamProvider + App |
| `apps/web/src/pages/telemetry.tsx` | — | Telemetry dashboard (stats, models, circuit breaker chart) |
| `apps/web/src/pages/governance.tsx` | — | Governance station (plugin-driven) |
| `apps/web/src/pages/firewall.tsx` | — | Firewall + triage queue + health probes |
| `apps/web/src/pages/history.tsx` | — | Session history + telemetry logs + search |
| `apps/web/src/pages/think.tsx` | — | Think station (4 plugins) |
| `apps/web/src/pages/hermes.tsx` | — | HERMES auditor station |
| `apps/web/src/pages/sentinel.tsx` | — | Edge sentinel station |
| `apps/web/src/pages/OllamaChat.tsx` | — | Ollama terminal chat (streaming + tool support) |
| `apps/web/src/components/LoginView.tsx` | — | Secure access gateway (login) |
| `apps/web/src/components/SettingsView.tsx` | — | Settings panel (display, thresholds, cache purge) |
| `apps/web/src/lib/apiClient.ts` | ~175 | HTTP client (timeout, retry, rate-limit-aware) |
| `apps/web/src/lib/telemetryBatcher.ts` | — | Client-side telemetry batch queue |
| `apps/web/src/lib/streamProcessor.ts` | — | Ollama NDJSON stream parser |
| `apps/web/src/hooks/` | 34+ files | All custom hooks (see Phase 7.3) |
| `apps/web/src/store/` | 3 files | Zustand stores (uiStore, terminalStore, tenantStore) |
| `apps/web/src/components/` | 41+ files | All shared + feature components |
| `apps/web/src/plugins/` | 4 files | Core plugin implementations |
| `apps/web/src/layouts/` | 2 files | StudioLayout, StudioRouter |
| `apps/web/src/tools/` | 2 files | Tool registry + workspace tools (for Ollama chat) |
| `apps/web/src/workers/` | 1 file | Web Worker (dataCruncher.worker.ts) |

### 7.3 — Custom Hooks (Complete List)

| Hook | Purpose |
|:-----|:-------|
| `useOsStream` | SSE `/api/os-stream` — OS health snapshot |
| `useEventStream` | SSE `/api/events` — multi-type event bus |
| `useLiveTaskStream` | SSE task lifecycle events |
| `useGovernanceStream` | HITL approval polling |
| `useGovernanceHealth` | Governance health polling (5s) |
| `useTelemetryStream` | SSE-then-polling-fallback telemetry |
| `useTelemetrySearch` | Debounced (300ms) telemetry search |
| `useTelemetryLogger` | Manual telemetry injection |
| `useThinkTrajectories` | Think token trajectory polling |
| `useThinkGovernanceStream` | Think token governance |
| `useThinkStream` | Think token streaming |
| `useThoughtTelemetry` | Thought telemetry tracking |
| `useOllamaStream` | Ollama `/api/chat` streaming |
| `useAgentInterceptor` | Pending approval management |
| `useToolInterceptor` | Ollama tool call interception |
| `useAuditExport` | Audit log export (JSON/CSV) |
| `useKeyManager` | Provider API key management (localStorage) |
| `usePlaygroundBackend` | Playground multi-model backend |
| `usePersistentState` | localStorage-persisted useState |
| `useInterval` | Declarative setInterval |
| `usePollingQueue` | Generic polling queue |
| `useTopologyEvents` | Gateway topology SSE |
| `useRoutingRules` | Gateway routing rules |
| `useProviderStatus` | Provider health polling |
| `useDegradationStatus` | Degradation monitor |
| `useSystemDiagnostics` | System diagnostics |
| `useBatcherState` | Telemetry batcher subscription |
| `useEdgeWorker` | Edge worker lifecycle |
| `useVectorSync` | Vector store sync status |
| `useEd25519Verify` | Ed25519 cryptographic verification |
| `useHermesAuditLogs` | HERMES SSE audit log stream |
| `useEdgeSignals` | Edge sentinel signal stream |
| `useOsSnapshot` | Context consumer for OS stream |
| `useDeepLink` | Context consumer for deep link |

---

## PHASE 8: TECHNICAL DEBT — PRIORITIZED BACKLOG

### TIER 1 (Must Fix — Production Blockers)
1. **Fix broken `getSlowRedisClient` import** — HERMES worker crashes on startup
2. **Fix sentinel admin bypass header** — feature non-functional
3. **Fix ledger `persistToNeon` id propagation** — data integrity
4. **Fix crucible `traceId` undefined in catch** — crash on task selection failure
5. **Implement actual authentication** — hardcoded passkey is not security
6. **Encrypt API keys in localStorage** — XSS vulnerability
7. **Remove fake simulation data from circuit breaker chart** — misleading to users
8. **Add mounted guard to telemetry polling** — React warnings

### TIER 2 (Should Fix — Data Safety)
9. **Persist in-memory state to Redis** — prevents loss on restart
10. **Fix telemetry batcher data loss on validation errors**
11. **Fix circuit breaker HALF_OPEN local drift**
12. **Add atomic dequeue to job queue** (BRPOPLPUSH pattern)
13. **Generate persistent monitor agent key pair**
14. **Fix firewall page unreachable condition**
15. **Fix StarRating integer visual bug**
16. **Fix history page `expandedLog` type mismatch**
17. **Add error handling to OllamaChat `handleSend`**
18. **Add error body parsing to `apiGet`**
19. **Add global API deduplication cache**

### TIER 3 (Good to Fix — Architecture)
20. **Split server.js into modular route files** (60+ inline routes → `routes/*.ts`)
21. **Generate OpenAPI 3.1 specification**
22. **Introduce vitest testing framework**
23. **Standardize error handling across all API endpoints**
24. **Resolve dependency version drift** (dual lockfiles, dual genai versions)
25. **Implement proper DB migrations** (Prisma or tracking table)
26. **Add Content Security Policy headers**
27. **Upgrade rate limiter to sliding window algorithm**
28. **Add graceful shutdown to sentinel service**

---

## APPENDICES

### Appendix A: Known Working Verification Commands

```bash
# Type check all workspaces
npm run typecheck

# Build web frontend
cd apps/web && npm run build

# Run end-to-end verification
node scripts/verify-e2e.mjs

# Single-command full build + verify
npm ci && npm run typecheck && node scripts/verify-e2e.mjs && cd apps/web && npm run build
```

### Appendix B: Procfile Dyno Configuration

| Dyno | Command | Memory | Purpose |
|:-----|:--------|:-------|:-------|
| `web` | `npx tsx --max-old-space-size=512 services/ingestion/server.js` | 512MB | Main Express API server |
| `monitor-worker` | `node --max-old-space-size=256 services/monitor/agent.js` | 256MB | Telemetry monitoring agent |
| `hermes-worker` | `node --max-old-space-size=256 worker.js` | 256MB | HERMES autonomous auditor |
| `sentinel` | `npx tsx --max-old-space-size=256 services/sentinel/src/index.ts` | 256MB | Edge egress monitor |
| `release` | `node --max-old-space-size=256 scripts/boot-verify.mjs` | 256MB | Boot verification on deploy |

**Total memory budget:** ~1.5GB. Heroku dyno must have ≥2GB RAM.

### Appendix C: Database Connection Config

| Setting | Postgres | Redis |
|:--------|:---------|:------|
| Max connections | 20 | — |
| Connect timeout | 5,000ms | 5,000ms |
| Command timeout | — | 3,000ms |
| Idle timeout | 10,000ms | — |
| TCP keepalive | 10s delay | 15,000ms |
| Query timeout (normal) | 10,000ms | — |
| Query timeout (vector) | 25,000ms | — |
| Insert timeout (vector) | 30,000ms | — |

### Appendix D: Rate Limit Configuration

| Config | Window | Max | Scope |
|:-------|:------|:----|:------|
| DEFAULT_RATE_LIMIT | 60s | 300 | Global per-IP ceiling |
| PER_ENDPOINT_RATE_LIMIT | 60s | 60 | Per individual API route |
| UI_POLL_RATE_LIMIT | 60s | 600 | UI polling endpoints |
| express-rate-limit (`/api/*`) | 60s | 100 | General API |
| express-rate-limit (ingest) | 60s | 25 | Telemetry ingest |

### Appendix E: Redis Key Namespace Map

| Key Pattern | Purpose |
|:-----------|:-------|
| `kudbee:ratelimit:*` | Rate limiting counters |
| `kudbee:circuit:*` | Circuit breaker state |
| `kudbee:jobs:*` | Job queue entries |
| `kudbee:telemetry_feed` | Telemetry feed for monitor agent |
| `kudbee:governance_actions` | Governance action log |
| `kudbee:verified_traces` | Verified trace tracking |
| `kudbee:community_value_score` | Community value metric |
| `kudbee:agents:hermes` | HERMES heartbeat |
| `kudbee:hermes:log` | HERMES audit log stream |
| `kudbee:think:stream` | Think token stream |
| `kudbee:events` | General event bus |
| `kudbee:alerts` | Alert queue |
| `kudbee:throttle_factor` | Dynamic throttle settings |
| `kudbee:system:context` | System context cache |
| `kudbee:probation:pending` | Probation docket |
| `kudbee-governance-tasks` | Governance task queue |
| `kudbee-governance-tasks-failed` | Failed task DLQ |
| `kudbee:groq:archives` | Groq archive listing |
| `kudbee:agent:state` | Agent fleet state |
| `kudbee:session_history` | Session history cache |
| `governance:proposed:*` | Proposed governance actions |
| `governance:proven:*` | Proven governance actions |
| `governance:index` | Governance action index |

---

## END OF AUDIT

**Total endpoints:** ~90 REST endpoints across 6 route prefixes  
**Total React components:** ~55 (15 tab pages + 40 feature/shared components)  
**Total custom hooks:** 34+  
**Total backend service files:** 32+  
**Critical bugs found:** 9  
**Architecture concerns:** 8  
**Outing Plan items:** 96 (8 done, 15 partial, 73 not started)  
**Tech debt items prioritized:** 28 (3 tiers)
