#!/usr/bin/env bash
set -euo pipefail

# Kudbee Staging Deploy Script (Heroku CLI-based, bypasses GitHub Actions billing)
# Usage: ./scripts/deploy-staging.sh [branch]
# Branch defaults to current branch

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
APP="kudbee-fuel-gage-staging"

echo "╔══════════════════════════════════════════════╗"
echo "║  KUDBEE STAGING DEPLOY                      ║"
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
if ! git remote | grep -q heroku; then
  echo "[0/5] Adding heroku remote..."
  heroku git:remote --app $APP
fi

# Deploy
echo ""
echo "[1/5] Pushing branch to Heroku..."
git push heroku "$BRANCH:main"

echo "[2/5] Waiting for dyno restart..."
sleep 15

echo "[3/5] Checking health..."
HEALTH=$(curl -fsS https://$APP.herokuapp.com/health 2>&1 || echo "FAILED")
if [ "$HEALTH" = "FAILED" ]; then
  echo "ERROR: Health check failed"
  echo ""
  echo "[4/5] Fetching recent logs..."
  heroku logs --num 30 --app "$APP"
  exit 1
fi

echo "[4/5] Health check passed: $HEALTH"

echo "[5/5] Verifying Redis connection..."
REDIS_CHECK=$(curl -fsS "https://$APP.herokuapp.com/api/system/health-deep" 2>&1 || echo "FAILED")
if [ "$REDIS_CHECK" = "FAILED" ]; then
  echo "WARNING: Redis health check failed"
else
  echo "Redis status: $REDIS_CHECK"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  DEPLOY COMPLETE                            ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  URL: https://$APP.herokuapp.com"
echo "║  Health: OK"
echo "║  Branch: $BRANCH"
echo "╚══════════════════════════════════════════════╝"

# Feed deploy event to DTHINK pipeline
node scripts/dthink-pipeline.mjs feed "deploy:staging" "Staging deploy of $BRANCH — health: OK" 2>/dev/null || true
