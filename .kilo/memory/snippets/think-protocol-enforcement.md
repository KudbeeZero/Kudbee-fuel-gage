# THINK Protocol Enforcement — Executable Policy

## What It Is

The THINK Protocol is not documentation — it is executable policy enforced by
the Protocol Guardian (`scripts/protocol-guard.mjs`) and the pre-commit hook
(`.githooks/pre-commit`).

## Rules

1. **Main is protected** — no feature work on main; only squash merges, merge
   queue, approved hotfixes.
2. **Branch guard** — coding never begins on main; auto-create feature branch.
3. **Pre-commit verification** — refuse commits on main or without objective.
4. **Objective lock** — every feature branch declares objectiveId, PR, parent,
   stack position (`.kilo/objective-lock.json`).
5. **Session initialization** — drift + status + branch first; ask objective.
6. **Session termination** — clean tree, sync, update memory, report, next task.
7. **Automatic recovery** — feature commits on main are moved to a feature
   branch and main reset (Rule 7, `recover` command).

## Protocol Guardian

`node scripts/protocol-guard.mjs` subcommands:
- `guard` — pre-commit guard (exit 1 on main / missing objective)
- `session-start` / `session-end` — Rule 5/6 checks
- `objective <id> [pr]` — declare/verify objective lock
- `recover` — auto-move feature commits off main
- `status` — full compliance snapshot

Exit codes: 0 = safe, 1 = blocked, 2 = needs recovery.

## Integration

- `.githooks/pre-commit` — refuses commits on main (Rule 1/3) and without
  objective lock (Rule 4). Enabled via `git config core.hooksPath .githooks`.
- `pr-sync.sh` — deterministic drift/sync/merge companion.

## Provenance

- Established: 2026-08-02 (session ses-1785566092483)
- Trigger: feature commits detected on main; Chief Architect directive to make
  protocol executable, not aspirational
- First enforcement: THINKBOX work moved from main → feature/thinkbox-pr001
