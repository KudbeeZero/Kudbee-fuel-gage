#!/usr/bin/env bash
set -euo pipefail

# Kudbee Development Deploy Script (Heroku CLI-based)
# Usage: ./scripts/deploy-dev.sh [branch]
# Branch defaults to current branch

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
APP="kudbee-fuel-gage-dev"

echo "╔══════════════════════════════════════════════╗"
echo "║  KUDBEE DEVELOPMENT DEPLOY                    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Branch: $BRANCH"
echo "║  App:    $APP"
echo "╚══════════════════════════════════════════════╝"

# Verify Heroku CLI
if ! command -v heroku &>/dev/null; then
  echo "ERROR: Heroku CLI not installed"
  echo "Install: curl https://cli-assets.heroku.com/install.sh | sh"
  exit 1
fi

# Verify login
if ! heroku auth:whoami &>/dev/null; then
  echo "ERROR: Not logged into Heroku"
  echo "Run: heroku login"
  exit 1
fi

# Add heroku remote if not present
if ! git remote | grep -q heroku-dev; then
  echo "[0/5] Adding heroku-dev remote..."
  heroku git:remote --app "$APP" --remote heroku-dev
fi

# Run quick CI gates
echo ""
echo "[1/5] Running quick CI gates..."
node scripts/verify-gates.mjs --quick
if [ $? -ne 0 ]; then
  echo "ERROR: CI gates failed. Development deploy blocked."
  exit 1
fi
echo "CI gates: PASSED"

# Log deploy trigger
echo ""
echo "[2/5] Logging deploy trigger..."
node scripts/deploy-log.mjs trigger development "Development deploy from $BRANCH"

# Deploy
echo ""
echo "[3/5] Pushing branch to Heroku development..."
git push heroku-dev "$BRANCH:main"

echo "[4/5] Waiting for dyno restart..."
sleep 15

echo "[5/5] Checking development health..."
HEALTH=$(curl -fsS "https://$APP.herokuapp.com/health" 2>&1 || echo "FAILED")
if [ "$HEALTH" = "FAILED" ]; then
  echo "ERROR: Development health check failed"
  echo ""
  echo "Fetching recent logs..."
  heroku logs --num 30 --app "$APP"
  exit 1
fi
echo "Development health: $HEALTH"

# Log successful deploy
node scripts/deploy-log.mjs log "development-deploy:$BRANCH"

# Feed deploy event to DTHINK
node scripts/dthink-pipeline.mjs feed "deploy:development" "Development deploy of $BRANCH — health: $HEALTH"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  DEVELOPMENT DEPLOY COMPLETE                  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  URL: https://$APP.herokuapp.com"
echo "║  Health: OK"
echo "║  Branch: $BRANCH"
echo "╚══════════════════════════════════════════════╝"
