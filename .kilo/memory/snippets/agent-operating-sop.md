# Agent Operating SOP

All departments and agents follow the same nine-layer workflow:

1. Intent: one goal, bounded scope, measurable acceptance.
2. Preconditions: task packet, dependencies, prior state, rollback plan.
3. Authority: human approval for authentication, tenant, secrets, data, deploy, and destructive actions.
4. Isolation: one task per worktree; no unscoped protected-path edits.
5. Execution: smallest compatible change; no unrelated refactor.
6. Evidence: run required checks and label environment warnings honestly.
7. Review: implementer is not sole reviewer.
8. Handoff: report files, commands, risks, rollback, and next dependency.
9. Memory: record decision and verification in DTHINK/memory.

Canonical files:

- `config/phase/next/sop-manifest.json`
- `config/phase/next/governance-policy.json`
- `scripts/phase-governor.mjs`
- `scripts/verify-operating-model.mjs`
- `.kilo/command/pr.md`
- `.kilo/command/phase.md`

No agent may claim completion from typecheck alone. The PR lifecycle requires
scope review, required gates, browser/mobile evidence, rollback details, human
approval where applicable, and a memory/DTHINK record.
