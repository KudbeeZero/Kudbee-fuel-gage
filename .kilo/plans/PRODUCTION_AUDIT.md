# Kudbee OS — Full Production Site Audit
**Date:** 2026-07-23T16:53Z
**Scope:** Entire monorepo — frontend, backend, infrastructure, CI, types, dependencies, security
**Total Findings:** 263 across 3 audit dimensions

---

## EXECUTIVE SUMMARY

| Dimension | CRITICAL | HIGH | MEDIUM | LOW | TOTAL |
|-----------|----------|------|--------|-----|-------|
| Frontend | 5 | 16 | 12 | 21 | 54 |
| Backend | 2 | 15 | 35 | 68 | 120+ |
| Infrastructure | 1 | 13 | 31 | 44 | 89 |
| **TOTAL** | **8** | **44** | **78** | **133** | **263** |

### Top 3 Must-Fix Immediately
1. **[CRITICAL]** `hermesOnline` health status always returns `true` — health endpoint lies (server.js:2961)
2. **[CRITICAL]** `.env.example` documents 5 of 34+ env vars — cannot boot full stack
3. **[CRITICAL]** Gemini API key passed as URL query parameter — exposed in HTTP logs (worker.js:77)

---

## CRITICAL FINDINGS

### C1: `hermesOnline` Always True (server.js:2961)
`!!(redis && (async () => {...})())` evaluates a Promise which is always truthy. The await result is discarded. Health endpoint reports HERMES as online even when it's completely dead. **Fix:** `const hb = await redis.get('kudbee:agents:hermes'); hermesOnline = !!hb;`

### C2: Gemini API Key in URL (worker.js:77)
`fetch(...?key=${apiKey})` — the key appears in Heroku logs, proxy caches, and browser history. **Fix:** Move to `Authorization: Bearer ${apiKey}` header.

### C3: .env.example Incomplete (config/.env.example)
34+ `process.env.X` variables exist in codebase. Only 5 documented. New developers can't boot. **Fix:** Merge `template.env` and add all 34 vars.

### C4: Empty Export Blob (useAuditExport.ts:41)
`triggerExport()` calls `new Blob()` with no data. Downloads are always empty. Signed ledger export is 100% non-functional. **Fix:** Use API response data.

### C5: Lazy Component No Suspense (App.tsx:58,780)
`<InterceptorView>` rendered WITHOUT `<Suspense>` boundary. React throws at runtime. **Fix:** Wrap in `<Suspense fallback={<SkeletonPanel />}>`.

---

## HIGH FINDINGS — ALL 44

### Frontend (16)
1. 16 unused lucide-react icons — dead bundle weight
2. Duplicate `react` imports — combine
3. `ledgerSpend` useMemo never used
4. `chartData` useMemo never used
5. `selectedTraceForDrawer` state never set — drawer permanently closed
6. 4 budget cap states initialized but never rendered
7. `editingProvider`/`tempCapVal` dead state
8. `operationalState` computed but never used
9. OSControlBar Zustand selector re-creates array every render
10. `slowDb` and `fastDb` both read Redis — slowDb should read Postgres
11. `terminalCommands` pushed but never passed to AgentTerminal
12. `os.uptime` accessed without optional chaining
13. `_mountedRef` exported from useEd25519Verify — mutable leak
14. EdgeWorker created but never terminated — memory leak
15. EventStream singleton — teardown kills ALL listeners
16. BudgetStatus module-level mutable state shared across consumers

### Backend (15)
1. `CRUCIBLE_ENABLED !== 'true'` logic inversion — crucible never runs
2. Hardcoded STREAM_SECRET fallback
3. CSV inject endpoint has NO auth
4. Top-level `await ensureSchema()` blocks module load
5. Schema DDL no transaction
6. DLQ errors hidden — error indistinguishable from empty
7. Redis error handler never logs — all diagnostics lost
8. Subscriber client has no `end` handler — SSE fan-out silently stops
9. TLS verification disabled for Upstash — MITM risk
10. CircuitBreaker failure count not atomic — permanent leak
11. half_open_permits key no TTL — permanent leak
12. BudgetGate monthly reset not atomic — TOCTOU
13. BudgetGate spend check TOCTOU — over-budget race
14. Pruner uses blocking `KEYS` instead of `SCAN`
15. Pruner O(N) LRANGE per key, silent errors

### Infrastructure (13)
1. `turbo.json`: `build` does not depend on `typecheck` — type errors ship
2. `turbo.json`: `typecheck` has `dependsOn: []`
3. `apps/web`: no `start` script for production
4. `.github/workflows/verify.yml`: no `lint` step
5. `.github/workflows/verify.yml`: no unit test layer
6. `.github/workflows/verify.yml`: only 2 env vars in CI
7. `.github/workflows/verify.yml`: no DATABASE_URL in CI
8. React version mismatch: web ^19 vs mobile 18.3.1
9. `@google/genai` in web deps — 200KB+ dead bundle weight
10. VLLM/OpenAI providers no AbortController timeout
11. SecurityViolationSchema.payload: z.unknown()
12. 5 E2E checks return true without asserting
13. Lazy bundle check passes if dist/ doesn't exist

---

## RECOMMENDED FIX ORDER

### Sprint 1: Security + Data Integrity (Now)
1. Move Gemini API key to header — worker.js:77
2. Fix hermesOnline Promise — server.js:2961
3. Remove hardcoded STREAM_SECRET fallback — server.js:3346
4. Enable TLS verification for Upstash — redis.js:57,90,125

### Sprint 2: CI Pipeline (Next)
5. Add `typecheck` to `build` dependsOn — turbo.json
6. Add `lint` step — verify.yml
7. Add DATABASE_URL to CI env — verify.yml
8. Fix graceful-degrade passthroughs — verify-e2e.mjs

### Sprint 3: Frontend Feature Gaps (Week 1)
9. Fix useAuditExport empty blob
10. Create GET /api/metrics/budget-status endpoint
11. Create POST /api/system/chaos endpoint
12. Add Suspense around InterceptorView

### Sprint 4: Backend Reliability (Week 2)
13. Atomicize circuitBreaker with Lua
14. Atomicize budgetGate with Lua
15. Replace pruner KEYS with SCAN
16. Log ALL silent catch blocks

### Sprint 5: Tech Debt (Week 3)
17. Complete .env.example with 34+ vars
18. Remove @google/genai from web deps
19. Remove 16 unused lucide-icons
20. Fix CRUCIBLE_ENABLED logic
21. Extract RouteFallback to shared component

---

## ARCHITECTURE GAPS

| Gap | Impact |
|-----|--------|
| Plugin registry loaded with 4 plugins but never queried | Zero plugins rendered |
| `/api/metrics/budget-status` missing — 404 on every budget poll | Budget UI broken |
| `/api/system/chaos` missing — 404 on chaos toggle | Chaos Monkey dead |
| Nested BrowserRouter in StudioRouter | Fragile routing |
| Export feature creates empty blob | Signed ledger export non-functional |
| 38 backend endpoints with no frontend consumer | Orphaned API surface |
| 2 frontend API calls with no backend endpoint | Dead UI features |
| React 19 vs 18 mismatch between web/mobile | Component sharing broken |
| GeminiProvider fetch() no AbortController timeout | Hung requests |
| 30+ silent catch blocks | Debugging impossible |
