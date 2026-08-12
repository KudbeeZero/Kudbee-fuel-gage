---
description: Full CI verification gate with breadcrumb tracing — run all gates, drop breadcrumbs on failures, produce traceable audit
---
Run the full verification suite with embedded breadcrumbs:

> **Gate-parity note:** Gates 1-3 below (agent-contracts, integrations,
> learning-protocol) are OPTIONAL. If a script is missing on the current branch
> (e.g. a multi-branch release train), guard it with `|| true` — do not let a
> missing optional script block the run. See the ci-watcher skill's pattern
> catalog (learn-heroku-ci-008).

## Gate 1: Company Agent Contracts
Run: `npm run verify:agent-contracts`
This is a required operating-model gate for all discovered `.kilo/agents/*.agent` files.

## Gate 2: Integrations
Run: `npm run verify:integrations`
It checks commands, packages, and environment names only. Missing Box or Neon
admin/API capabilities are explicit skips; no provider write API is called.

## Gate 3: Learning Protocol
Run: `npm run verify:learning-protocol`
This validates the recall, precondition, bounded job, evidence, quality signal,
THINK, DTHINK, memory, and bounded follow-up contract.

## Gate 4: TypeScript Version
Run: `npm run verify:typescript`
If passed: log breadcrumb `[verify] typescript-version PASS native 7.0.2 / API 6.x`
If failed: log breadcrumb `[verify] typescript-version FAIL` with the violating declaration or lock entry, STOP

## Gate 5: Typecheck
Run: `npm run typecheck`
If passed: log breadcrumb `[verify] typecheck PASS 12/12`
If failed: log breadcrumb `[verify] typecheck FAIL` with error details, STOP

## Gate 6: Tests
Run: `cd services/lib && bun test test/`
If passed: log breadcrumb `[verify] tests PASS (46/46)`
If failed: log breadcrumb `[verify] tests FAIL` with failing test names, ASK "Fix or continue?"

## Gate 7: Build
Run: `npm run build --workspace=@kudbee/web`
If passed: log breadcrumb `[verify] build PASS 290kB chunk`
If failed: log breadcrumb `[verify] build FAIL` with error summary, STOP

## Gate 8: E2E
Run: `node scripts/verify-e2e.mjs --smoke` by default. Full database-writing
E2E is permitted only as `E2E_ALLOW_DATABASE_WRITES=1 node scripts/verify-e2e.mjs`.
If passed: log breadcrumb `[verify] e2e PASS bounded smoke or explicit full run`
If failed: log breadcrumb `[verify] e2e FAIL` with failed check details, STOP

## Gate 9: Knowledge Extraction
Run: `node scripts/extract-codebase-knowledge.mjs`
Run: `node scripts/snippet-manager.mjs verify`
If passed: log breadcrumb `[verify] knowledge PASS (X tokens, Y snippets)`
If failed: log breadcrumb `[verify] knowledge WARN` (non-blocking)
Purpose: Ensures Think Token Forge has fresh codebase context for future agent sessions.

## Summary
After all gates pass, log breadcrumb `[verify] ALL_GATES_PASS` with a trace ID.
Update `.kilo/memory/journal.json` with breadcrumb trace ID and CI status.
Report the trace ID — replayable via `getBreadcrumbs(traceId)` in HERMES audit panel.

## Breadcrumb Format
Each gate result is a breadcrumb with:
- traceId: `verify-{date}-{run}` (consistent across all gates in one run)
- source: `verify-gate-{name}`
- errorDelta: result summary
- serviceState: `pass` or `fail`

On failure, the breadcrumb includes the first 3 lines of the error stack for root-cause diagnosis.
