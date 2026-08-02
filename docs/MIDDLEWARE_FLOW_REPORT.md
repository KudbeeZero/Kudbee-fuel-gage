# Middleware Flow Report

**Date:** 2026-08-02 | **Auditor:** KILOH | **Mission:** THINKBOX-015

## The Integration Data Path

Every frontend panel must traverse one complete chain:

```
UI Component → Hook → WorkspaceViewModel → REST API → Express Middleware → BUS → Engine → Response → UI Render
```

## Current State by Chain Link

### Link 1: UI Component → Hook
**Status: ❌ BROKEN for 14/16 components.**

Only `LiveTerminal` uses `useTerminalStream` → `useEventStream`. All other components have either no hook, a dead hook import (`useDashboardSync` imported but unused), or consume hardcoded data.

**Verification:** `FRONTEND_RUNTIME_AUDIT.md` — 0 BUS connections, 14 mock data panels.

### Link 2: Hook → WorkspaceViewModel
**Status: ❌ BROKEN.**

`useDashboardSync` is defined and imports `WorkspaceViewModel`. But no component calls it. The hook exists but nothing feeds it. `thinkbox.tsx` imports it but never calls it.

**Verification:** `grep useDashboardSync apps/web/src/pages/thinkbox.tsx` — import found, no invocation.

### Link 3: WorkspaceViewModel → REST API
**Status: ⚠️ PARTIAL.**

The `useDashboardSync` hook calls `/api/thinkbox/dashboard` and `/api/thinkbox/detect`. These endpoints exist in `services/ingestion/routes/thinkbox.ts`. The intelligence and provision endpoints work. But no component reaches them through the ViewModel.

**Verification:** `grep apiGet apps/web/src/hooks/useDashboardSync.ts` — API calls present. No consumer.

### Link 4: REST API → Express Middleware
**Status: ✅ FUNCTIONAL.**

`services/ingestion/server.js` mounts thinkbox routes at `/api/thinkbox/`. The 11-layer middleware pipeline handles every request. Bearer auth can be optional. Rate limiter, CORS, body parser all operational.

**Verification:** `CI_VERIFICATION_REPORT.md` — 15 CI gates, all pass on main.

### Link 5: Express Middleware → BUS
**Status: ✅ INFRASTRUCTURE EXISTS.**

The serial bus (`scripts/serial-bus.mjs`) records events. The SSE stream (`/api/events`) publishes. `useEventStream.ts` connects. But the THINKBOX frontend never subscribes to thinkbox events.

**Verification:** `grep useEventStream apps/web/src/hooks/useTerminalStream.ts` — connection exists. Only terminal uses it.

### Link 6: BUS → Engine
**Status: ✅ ENGINE EXISTS.**

11 engine modules are operational. CLI commands (detect, plan, learn, validate, replay, review, score, provider, cost, kpi, ready) all produce typed JSON. But their output never reaches the frontend panels through live data flow.

**Verification:** `npx tsx services/thinkbox/src/index.ts ready` → `{"ready":true,"score":100}`. Engine works. UI doesn't consume it.

### Link 7: Engine → Response
**Status: ✅ FUNCTIONAL.**

All 12 CLI commands produce valid JSON output. The REST API wraps CLI commands via `thinkboxCli()`. The response path works. The data is correct.

**Verification:** All 12 commands tested individually. All produce typed JSON.

### Link 8: Response → UI Render
**Status: ❌ BROKEN.**

Components render. But they render mock data, not API responses. The `WorkspaceViewModel` feeds the status bar, but no panel consumes it. Props exist on 26 components but are never populated with live data.

**Verification:** `FRONTEND_RUNTIME_AUDIT.md` — 14/16 panels use hardcoded data.

## Complete Chain Health

| Chain Link | Status | Evidence |
|:---|:---:|:---|
| UI Component → Hook | ❌ | 14 mock data panels, 0 BUS connections |
| Hook → WorkspaceViewModel | ❌ | useDashboardSync imported, never called |
| WorkspaceViewModel → REST API | ⚠️ | Hook calls API, but no component calls hook |
| REST API → Express Middleware | ✅ | 11-layer middleware pipeline, CI GREEN |
| Express Middleware → BUS | ✅ | Serial bus + SSE + useEventStream |
| BUS → Engine | ✅ | 12 CLI commands, all produce typed JSON |
| Engine → Response | ✅ | Valid JSON output, REST API functional |
| Response → UI Render | ❌ | Panels render mock data, not API responses |

## Verdict

**3 of 8 chain links are BROKEN. 3 are functional. 2 are partial.** The backend is solid. The middleware is solid. The frontend is disconnected. The integration gap is precisely between "Engine → Response" (which works) and "Response → UI Render" (which doesn't). The fix is not new engines — it's wiring existing components to existing data flow.
