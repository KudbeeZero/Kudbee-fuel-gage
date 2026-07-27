---
description: PR lifecycle — show status, review changes, create PR, verify + PR
---
Execute the PR lifecycle workflow:

1. Show current PR status:
   - `gh pr list --state open`
   - `gh pr list --state closed --limit 5`

2. Show current branch changes:
   - `git log --oneline origin/main..HEAD`
   - `git diff origin/main..HEAD --stat`
   - `git status --short`

3. If `$1` is "create":
   - Run `/verify` first
   - If uncommitted changes exist, commit with conventional commit format
   - Push and create PR: `gh pr create --base main --title "$2" --body "$3"`
   - Report the PR URL

4. If `$1` is "merge":
   - Switch to main: `git checkout main && git pull origin main`
   - Report merged PRs from `gh pr list --state merged --limit 5`

5. If no args, just show status (steps 1-2).
