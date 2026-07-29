#!/bin/bash
# .git/hooks/pre-push
# ---------------------------------------------------------------------------
# Pre-push gate — runs verify-gates.mjs before allowing push.
# Blocks pushes with unused imports, type failures, or lint issues.
#
# Installed by: scripts/install-git-hooks.mjs
# Override:     git push --no-verify  (emergency only)
# ---------------------------------------------------------------------------

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  PRE-PUSH GATE — verifying integrity…   ║"
echo "╚══════════════════════════════════════════╝"

node scripts/verify-gates.mjs --quick
exit_code=$?

if [ $exit_code -ne 0 ]; then
  echo ""
  echo "  ✗ Pre-push gates FAILED."
  echo "  Fix unused imports or type errors before pushing."
  echo "  Override: git push --no-verify"
  echo ""
  exit 1
fi

echo "  ✓ Pre-push gates PASSED."
echo ""
exit 0
