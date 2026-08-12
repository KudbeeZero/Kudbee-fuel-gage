---
name: ci-watcher
description: CI gate watcher — runs verification suite, decodes failures, applies learned fix patterns, and updates training procedures on every diagnosis.
---

# ci-watcher — Agent Skill

**Category:** verification
**Schedule:** on-deploy / on-push
**UUID:** ver-001
**Updated at:** 2026-08-12

## Purpose

The CI watcher runs the governance gate suite, detects regressions, decodes
failures against a learned pattern catalog, applies proven fixes, and
**updates the skill's training data** (LEARNINGS.json / TRACES.md) after every
new diagnosis so the next failure is cheaper to resolve.

## Activation Policy

Activate this skill whenever any of these fire:

- A CI/verify workflow run fails on a push or PR.
- `npm run verify:*`, `bun test`, `npm run typecheck`, `npm run lint`, or
  `npm run build` fails locally.
- A Heroku review app or pipeline is reported DEGRADED / OFFLINE.
- A new failure mode is encountered (to log a learning).

## Enforced Gate Order

Run in this fixed order. Early failures block later gates.

| # | Gate | Command | Blocking |
|:--|:-----|:--------|:---------|
| 1 | TS 7 compliance | `npm run verify:typescript` | ✅ |
| 2 | Node crypto runtime | `npm run verify:crypto` | ✅ |
| 3 | Secret hygiene | `npm run verify:secrets` | ✅ |
| 4 | Config vars | `npm run verify:config-vars --heroku production` | ✅ |
| 5 | Typecheck | `npm run typecheck` | ✅ |
| 6 | Lint | `npm run lint` | ✅ |
| 7 | Unit tests | `bun test` | ✅ |
| 8 | Governance status | `protocol-guard status` | ✅ |
| 9 | Mission validation | `protocol-guard pre-pr` | ✅ |
| 10 | Build | `npm run build` | ✅ |
| 11 | Bounded smoke | `verify:ci-smoke \|\| true` | optional |

CI env: `CI=true`, `MAX_REQUEST_BODY=256kb`, `CI_MUTATION_BUDGET=20`,
`E2E_ALLOW_DATABASE_WRITES=0`.

## Diagnosis Protocol (TRAIN)

Follow this sequence on every failure. Log a learning when the pattern is novel.

1. **T**riage — capture the failing gate, workflow, job, and branch. Note if the
   failure reproduces locally (`npm run <gate>`) or only on CI.
2. **R**ead the catalog — search `LEARNINGS.json` and `TRACES.md` for a known
   pattern + fix before spending an LLM call. Known patterns = zero LLM cost.
3. **A**pply the proven fix from the matched learning. Never invent a
   workaround that contradicts the pattern's documented prevention rule.
4. **N**ote the outcome — if fixed, mark the learning "reused"; if the fix did
   not resolve it, extend the pattern with the delta or create learning-p-HERE.
5. **R**ecord / update — append the decision to `TRACES.md`, bump
   `patterns.totalActions` / `totalDecisions` in `LEARNINGS.json`, increment the
   trace count in `SKILL.md`. This is the "training procedure update".

## CI Failure Pattern Catalog (Training Data)

Pulled from LEARNINGS.json / TRACES.md. Match symptom → apply fix → verify.

### 1. `node --check` / syntax failures on `.mjs`
- **Symptom**: Heroku CI fails on `node --check scripts/*.mjs`.
- **Cause**: Top-level `await` in `.mjs` files.
- **Fix**: Replace `await import('...')` with a static top-level `import`.
- **Verify**: `for f in scripts/*.mjs; do node --check "$f"; done`.

### 2. Unused `lucide-react` imports
- **Symptom**: `✗ unused-import` failures from `verify-gates.mjs` (was 96).
- **Fix**: Remove dead icon imports; improve `scanUnusedImports()` to check all
  16 usage patterns (JSX, object values, arrays, ternaries…), not just regex.
- **Prevention**: `verify-gates.mjs --quick` blocks deploy on any occurrence.

### 3. `app.json` parse error in env blocks
- **Symptom**: `Failed to parse app.json at environments.test.env line N`.
- **Cause**: Bare string env values (Heroku requires object shape).
- **Fix**: Convert `"KEY": "value"` → `"KEY": { "value": "value" }`.
- **Verify**: `node -e "JSON.parse(require('fs').readFileSync('./app.json'))"`.

### 4. Review app dyno limit (`Cannot run more than 2 Eco size dynos`)
- **Fix**: In `app.json` `reviewApps.formation`, keep one `web` dyno and set all
  worker dynos to `quantity: 0`. Never reduce top-level/environment formation.

### 5. Review app "Connecting…" / "Offline" frontend states
- **Cause**: Missing CORS middleware or missing `DATABASE_URL`/`REDIS_URL`.
- **Fix**: Add a global CORS handler as the FIRST middleware (+ OPTIONS 204);
  set `DATABASE_URL`, `REDIS_URL`, `REDIS_WORKER_URL`, `STREAM_SECRET`, add
  provider key; restart dynos via `DELETE /apps/:app/dynos`.

### 6. CodeQL workflow "Initialize CodeQL" failure
- **Cause**: `codeql-config.yml` disabled all queries (`paths-ignore:'**'`).
- **Fix**: Restore `security-extended` + `security-and-quality` targeting
  `services/apps/scripts`; `continue-on-error: true` on analyze.

### 7. verify.yml "Missing script" on PR branches
- **Cause**: workflow runs npm scripts that exist only on main.
- **Fix**: Guard optional steps with `|| true`. Core gates stay blocking.
- **Rule**: any new script in verify.yml must exist on ALL branches or be
  guarded. Test files must exist on the CURRENT branch before being referenced
  (multi-branch release-train gotcha).

## Engineering Protocol Guardrails

- **Never** fix a CI failure by contorting generated code around a bug — fix the
  scanner/invariant instead.
- `think_tokens` ≠ `vector_memory`: embedding source must be Gemini-first via
  `embedText()`, not `embedTextLocal()`, except as the documented fallback.
- After fixing, always re-run the full gate order — a fix at gate 3 can break
  gate 7.
- Do not commit CI fixes on `main`; use mission → branch → PR → merge.

## Manual Run

```bash
# Reproduce the failing gate locally
npm run typecheck
npm run lint
bun test
npm run build
```

## Outputs

- `LEARNINGS.json` — durable learned patterns (the training set).
- `TRACES.md` — decision log + CI failure pattern catalog.
- This file's "CI Failure Pattern Catalog" is the human-readable training
  procedure summarized from the above two.
