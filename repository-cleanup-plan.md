# STAB-003 — Repository Simplification Plan

> **Mission type:** Subtraction. Reduce engineering complexity without reducing capability.
> **Freeze:** New capabilities frozen until v2.4 ships. Every PR must improve reliability, reduce complexity, reduce operational cost, or improve evidence quality — nothing else.

## Baseline (engineering-complexity.json)

| Metric | Baseline | Target | Δ |
|:---|:---|:---|:---|
| Source files | 549 | 494 | −10% |
| Scripts | 114 | 97 | −15% |
| CLI commands | 48 | 44 | −8% |
| Markdown docs | 170 (67 top) | 119 | −30% |
| Bootstrap (AGENTS.md) | 10 KB | 7.5 KB | −25% |
| Graph nodes | 82 | 82 | flat |

## Task 1 — Script consolidation (script-audit.json)

- **87 mergeable** scripts: not wired into package.json. Merge into named groups, keep the referenced entry point, archive the rest.
- Rule: one script = one responsibility. If two scripts do the same thing (e.g., two audit entry points), merge.

## Task 2 — Documentation consolidation (documentation-audit.json)

- **20 archivable** docs: final reviews, v1/v2.1 baselines, session reports, OPS reviews.
- **6 canonical** docs — the only sources of truth:
  1. `README.md`
  2. `AGENTS.md`
  3. `MODEL_CONTRACT.md`
  4. `REPOSITORY_MANIFEST.json`
  5. `engineering_state.yaml`
  6. `engineering-complexity.json`
- Move the 20 archives to `docs/archive/` (never delete — archiving preserves history).

## Task 3 — Terminal consolidation (terminal-audit.json)

- **10 unregistered** commands: in the UI but not the dispatcher (or vice versa). Each is KEEP, VERIFY, or DEAD_OR_UNREGISTERED.
- One canonical terminal: `apps/web/terminal.html` + `services/terminal/commandDispatcher.mjs`. Archive `LiveTerminal.tsx` and `AgentTerminal.tsx` references.

## Task 4 — Knowledge consolidation (knowledge-audit.json)

- **1 duplicate ID, 1 duplicate ref** — merge, never delete.
- Rebuild `.kilo/knowledge-graph.json` after any merge; re-run `graph:audit`.

## Task 5 — Workflow consolidation (workflow-audit.json)

- 5 workflows: verify, codeql, box-test, autonomous-maintenance, docs. All KEEP; `docs.yml` is a candidate to MERGE into verify.

## Task 6 — Mission consolidation

- Planner → Supervisor → Executor → Verifier → Reviewer → Closeout is the single pipeline.
- `.kilo/mission-history.json` is the only mission state. No duplicated state in engineering_state.yaml (it mirrors, not duplicates).

## Acceptance (measured)

| Question | Target | Measured |
|:---|:---|:---|
| Files can disappear | 10% | 55 (baseline 549) |
| Scripts can merge | 15% | 17 (87 candidates) |
| Markdown can archive | 30% | 51 (20 confirmed archive) |
| Bootstrap can shrink | 25% | 2.5 KB (10 KB baseline) |
| CI runtime reduction | 20% | pending measurement |
| Token cost reduction | estimate | pending measurement |
| Capability decreased | **No** | guard: `graph:audit` + `knowledge:audit` must stay PASS |

## Guardrails

- Never delete knowledge — only merge or archive.
- `graph:audit` and `knowledge:audit` must PASS after every consolidation step.
- `npm run supervisor:audit` must remain PASS.
- Complexity Index (composite 77) must not increase.
