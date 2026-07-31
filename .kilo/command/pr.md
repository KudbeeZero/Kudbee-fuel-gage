---
description: PR lifecycle — show status, review changes, create PR, verify + PR
---
Execute the PR lifecycle workflow. Never merge, switch branches, reset, or
delete worktrees automatically without an explicit human instruction.

1. Show current PR status:
   - `gh pr list --state open`
   - `gh pr list --state closed --limit 5`

2. Show current branch changes:
   - `git log --oneline origin/main..HEAD`
   - `git diff origin/main..HEAD --stat`
   - `git status --short`

3. Run PR preflight before create/review:
   - `git diff --check`
   - `node scripts/phase-governor.mjs check <model> <task-id>`
   - `node scripts/verify-operating-model.mjs`
   - `node scripts/verify-next-phase.mjs --full`
   - `node scripts/dthink-pipeline.mjs stats`

4. If `$1` is "create":
   - Require a clean or intentionally staged worktree.
   - Run the preflight and stop on any failure.
   - Create a conventional commit only when explicitly requested.
   - Push the current branch and create the PR with scope, tests, browser evidence, risks, rollback, and human approval status.
   - Report the PR URL and required reviewers.

5. If `$1` is "review":
   - Inspect the full diff against the base branch.
   - Check authorization, tenant isolation, durability, browser/mobile impact, tests, and rollback.
   - Mark `CHANGES_REQUESTED` for any unsupported claim or missing evidence.

6. If `$1` is "merge":
   - Confirm the PR is non-draft, has approved review, passing authoritative
     checks, and explicit human authorization.
   - Do not merge a PR with unresolved billing-blocked checks by force or
     administrative bypass. Record the blocker and keep the PR draft/open.
   - Use `gh pr merge` only for the identified PR.
   - Do not switch branches or delete worktrees as part of this command.
   - Report the merge commit and post-merge verification required.

9. PR sizing precedent:
   - Prefer one focused change per PR, normally 1-10 commits.
   - Treat more than 15 commits or more than 1,000 changed lines as a split
     candidate unless the work is intrinsically atomic.
   - Split by independently verifiable concern: product feature, backend,
     security, CI/operations, documentation, and generated memory artifacts.
   - Do not create an empty follow-up PR. Create the next PR only when there
     is a bounded, independently tested change ready for review.

7. If `$1` is "rollback":
   - Stop deployment promotion.
   - Record the reason in DTHINK and the handoff trail.
   - Require human selection of the rollback target.

8. If no args, just show status (steps 1-2).
