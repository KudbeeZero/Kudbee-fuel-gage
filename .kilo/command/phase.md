# Next Phase Governance

Use this command for every DeepSeek V4 or Qwen 3.6 Pro task.

## Before Editing

```bash
node scripts/session-bootstrap.mjs
node scripts/phase-governor.mjs check <model> <task-id>
node scripts/model-task-packet.mjs <model> <task-id>
npm run verify:secrets
npm run verify:typescript
git status --short
```

Confirm the task scope, non-goals, required checks, approval level, and
rollback plan. If a protected path is not declared, stop instead of expanding
scope.

## TypeScript Migration Contract

- `npx tsc --version` must resolve the TypeScript 7 native compiler through `@typescript/native`.
- `require('typescript').version` must resolve TypeScript 6 only for compiler-API consumers such as typescript-eslint.
- Every compiler workspace must declare `@typescript/native: "npm:typescript@^7.0.2"` and `typescript: "npm:@typescript/typescript6@^6.0.2"`.
- TypeScript 5.x or lower is forbidden in direct constraints and resolved compiler entries.
- Remove the TypeScript 6 API alias only after typescript-eslint publishes TypeScript 7 API support.

## During Editing

- Make one bounded change.
- Do not combine security, UI, migration, and refactor work in one task.
- Do not edit production secrets.
- Do not skip a failing check.
- Do not report a local fallback as durable success.
- Do not claim browser screenshots without saved image evidence.

## After Editing

Run every task-specific check and validate a structured report:

```bash
git diff --check
npm run verify:secrets
npm run verify:typescript
npm run typecheck
bun test
node scripts/verify-system-integrity.mjs
node scripts/verify-e2e.mjs
node scripts/verify-browser-matrix.mjs
node scripts/phase-governor.mjs report artifacts/phase-report.json
```

## Governance Layers

The enforced layers are defined in `config/phase/next/governance-policy.json`:

1. Intent
2. Preconditions
3. Authority
4. Isolation
5. Execution
6. Evidence
7. Review
8. Handoff
9. Memory

No task is complete until all nine layers are represented in its report.
