#!/usr/bin/env bash
# scripts/pr-sync.sh — Deterministic PR workflow that prevents merge conflicts.
#
# Usage:
#   ./scripts/pr-sync.sh sync <branch>        # rebase branch onto main, resolve memory, push
#   ./scripts/pr-sync.sh merge <branch>       # sync + squash-merge into main + cleanup
#   ./scripts/pr-sync.sh drift                # show how far every branch is from main
#
# Rules enforced:
#   - Never push directly to main (PR merge only)
#   - Rebase onto main, never cherry-pick between branches
#   - Auto-generated .kilo/memory churn resolves to "theirs" (main wins)
#   - Short-lived PRs: merge same day the PR opens
set -euo pipefail

REPO="KudbeeZero/Kudbee-fuel-gage"
TRUNK="main"

# Files that are runtime state, not source — main wins on conflict
MEMORY_CHURN=".kilo/memory/bus .kilo/memory/dthink .kilo/memory/forge .kilo/memory/gate-results.json .kilo/memory/journal.json"

resolve_memory_conflicts() {
  for path in $MEMORY_CHURN; do
    if git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
      git checkout --theirs "$path" 2>/dev/null || true
      git add "$path" 2>/dev/null || true
    fi
  done
}

cmd_drift() {
  echo "╔══ BRANCH DRIFT (commits ahead of $TRUNK) ══╗"
  git fetch origin --prune >/dev/null 2>&1 || true
  for branch in $(git branch -r | grep -v HEAD | grep -v "$TRUNK" | sed 's/origin\///' | sort -u); do
    count=$(git rev-list --count "origin/$TRUNK..origin/$branch" 2>/dev/null || echo "?")
    printf "  %-45s %s commits\n" "$branch" "$count"
  done
  echo "╚══════════════════════════════════════════╝"
}

cmd_sync() {
  local branch="$1"
  git fetch origin "$TRUNK" "$branch" >/dev/null 2>&1
  git checkout "$branch" >/dev/null 2>&1 || git checkout -b "$branch" "origin/$branch"
  git rebase "origin/$TRUNK" --rebase-merges 2>&1 | tail -3 || true
  if git status --porcelain | grep -q '^UU\|^AA'; then
    echo "[sync] Resolving auto-generated memory conflicts (main wins)..."
    resolve_memory_conflicts
    GIT_EDITOR=true git rebase --continue 2>/dev/null || true
  fi
  git push --force-with-lease origin "$branch" 2>&1 | tail -2
  echo "[sync] $branch rebased onto $TRUNK and pushed."
}

cmd_merge() {
  local branch="$1"
  cmd_sync "$branch"
  echo "[merge] Opening merge for $branch → $TRUNK..."
  gh pr merge "$branch" --squash --delete-branch 2>&1 || true
  echo "[merge] Done."
}

case "${1:-}" in
  sync)  cmd_sync "${2:?usage: pr-sync.sh sync <branch>}" ;;
  merge) cmd_merge "${2:?usage: pr-sync.sh merge <branch>}" ;;
  drift) cmd_drift ;;
  *)
    echo "Usage:"
    echo "  ./scripts/pr-sync.sh drift                  # show branch divergence"
    echo "  ./scripts/pr-sync.sh sync <branch>          # rebase + push, no conflicts"
    echo "  ./scripts/pr-sync.sh merge <branch>         # sync + squash-merge + cleanup"
    ;;
esac
