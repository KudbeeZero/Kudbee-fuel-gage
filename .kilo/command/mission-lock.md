---
description: Mission Lock lifecycle — start/status/advance/complete a governance mission via the THINK Protocol resolver
subtask: true
---
Manage the active governance mission-lock (THINK Protocol). Use for any Phase-0
closure, feature work, or roadmap advancement. All commands require an active
mission; none proceed without a lock.

## Actions

- **Status** — show the active mission and objective:
  ```bash
  npm run mission:status
  ```
  Expect a parsed mission-lock (schema v1: missionId, objective, state,
  featureBranch, expectedPr). If `state` is `null` / missing, an approving
  objective is required before any branch work.

- **Start mission** (open a new mission with an objective):
  ```bash
  npm run mission:start -- <objectiveExpression>
  ```
  This writes `.kilo/mission-lock.json` (active) and a matching
  `feature/<slug>` branch. Do not run on `main`.

- **Advance state** (e.g. PROPOSED → APPROVED → IMPLEMENTING):
  ```bash
  npm run mission:advance
  ```

- **Complete** — close the mission once verified + merged:
  ```bash
  npm run mission:complete
  ```

## Protocol Guard (must pass before branch work)

```bash
node scripts/protocol-guard.mjs status
node scripts/protocol-guard.mjs pre-pr
```

`status` = blocking (fails CI if protocol compliance is broken).
`pre-pr` = blocking (requires an active mission/objective lock).
`guard` = warn-only runtime churn check.

## Enforcement reminders

- Never edit `main` directly — every change rides a mission → branch → PR.
- The pre-commit hook requires `.kilo/objective-lock.json` on feature branches
  (Rule 4). If it is absent, create the objective first via
  `node scripts/protocol-guard.mjs objective <id> [prNumber]`.
- Commit messages must reference the mission/objective and the PR number when
  one exists.

## Tools

- `scripts/mission-executor.mjs` — state machine (start/advance/complete/status).
- `scripts/mission-planner.mjs` — next-mission planner.
- `scripts/protocol-guard.mjs` — governance gate suite.
- `.kilo/mission-lock.json` — the single source of truth for active work.
