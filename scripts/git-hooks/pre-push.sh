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

branch_name="$(git rev-parse --abbrev-ref HEAD)"
stack_branch="0"
if [ -f config/pr/stack.json ]; then
  stack_branch="$(BRANCH_NAME="$branch_name" node -e "
    const fs = require('node:fs');
    const branch = process.env.BRANCH_NAME;
    try {
      const config = JSON.parse(fs.readFileSync('config/pr/stack.json', 'utf8'));
      const found = (config.layers || []).some((layer) => layer.branch === branch);
      process.stdout.write(found ? '1' : '0');
    } catch {
      process.stdout.write('0');
    }
  ")"
fi

if [ "$stack_branch" = "1" ]; then
  echo "  → Stacked branch detected ($branch_name). Running stack verification..."
  npm run verify:stack
  stack_exit_code=$?
  if [ $stack_exit_code -ne 0 ]; then
    echo ""
    echo "  ✗ Stack verification FAILED."
    echo "  Fix stack manifest/base ancestry issues before pushing."
    echo ""
    exit 1
  fi
fi

echo "  ✓ Pre-push gates PASSED."
echo ""
exit 0
