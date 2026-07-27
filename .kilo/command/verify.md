---
description: Full CI verification gate with breadcrumb tracing — run all gates, drop breadcrumbs on failures, produce traceable audit
---
Run the full verification suite with embedded breadcrumbs:

## Gate 1: Typecheck
Run: `npm run typecheck`
If passed: log breadcrumb `[verify] typecheck PASS 12/12`
If failed: log breadcrumb `[verify] typecheck FAIL` with error details, STOP

## Gate 2: Tests
Run: `cd services/lib && bun test test/`
If passed: log breadcrumb `[verify] tests PASS (46/46)`
If failed: log breadcrumb `[verify] tests FAIL` with failing test names, ASK "Fix or continue?"

## Gate 3: Build
Run: `npm run build --workspace=@kudbee/web`
If passed: log breadcrumb `[verify] build PASS 290kB chunk`
If failed: log breadcrumb `[verify] build FAIL` with error summary, STOP

## Gate 4: E2E
Run: `node scripts/verify-e2e.mjs`
If passed: log breadcrumb `[verify] e2e PASS 38/38`
If failed: log breadcrumb `[verify] e2e FAIL` with failed check details, STOP

## Gate 5: Lint (optional)
Run: `npm run lint`
If passed: log breadcrumb `[verify] lint PASS`
If failed: log breadcrumb `[verify] lint WARN` (non-blocking)

## Summary
After all gates pass, log breadcrumb `[verify] ALL_GATES_PASS` with a trace ID.
Report the trace ID so the user can replay verification history via `getBreadcrumbs(traceId)`.

## Breadcrumb Format
Each gate result is a breadcrumb with:
- traceId: `verify-{date}-{run}` (consistent across all gates in one run)
- source: `verify-gate-{name}`
- errorDelta: result summary
- serviceState: `pass` or `fail`

On failure, the breadcrumb includes the first 3 lines of the error stack for root-cause diagnosis.
