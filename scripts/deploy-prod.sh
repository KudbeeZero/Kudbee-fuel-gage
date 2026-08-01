#!/usr/bin/env bash
set -euo pipefail

# Kudbee Production Deploy Script (Heroku CLI-based, bypasses GitHub Actions billing)
# Usage: ./scripts/deploy-prod.sh [branch]
# Branch defaults to main

BRANCH="${1:-main}"
APP="kudbee-fuel-gage"
STAGING_APP="kudbee-fuel-gage-staging"

echo "╔══════════════════════════════════════════════╗"
echo "║  KUDBEE PRODUCTION DEPLOY                      ║"
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

# Verify staging is healthy before promoting
echo ""
echo "[0/6] Checking staging health..."
STAGING_HEALTH=$(curl -fsS "https://$STAGING_APP.herokuapp.com/health" 2>&1 || echo "FAILED")
if [ "$STAGING_HEALTH" = "FAILED" ]; then
  echo "ERROR: Staging health check failed. Deploy to production blocked."
  echo "Fix staging first: ./scripts/deploy-staging.sh"
  exit 1
fi
echo "Staging health: $STAGING_HEALTH"

# Verify CI gates pass
echo ""
echo "[1/6] Running CI gates..."
node scripts/verify-gates.mjs --quick
if [ $? -ne 0 ]; then
  echo "ERROR: CI gates failed. Production deploy blocked."
  exit 1
fi
echo "CI gates: PASSED"

# Log deploy trigger
echo ""
echo "[2/6] Logging deploy trigger..."
node scripts/deploy-log.mjs trigger production "Manual production deploy from $BRANCH"

# Add heroku remote if not present
if ! git remote | grep -q heroku; then
  echo "[3/5] Adding heroku remote..."
  heroku git:remote --app "$APP"
fi

# Deploy
echo ""
echo "[3/6] Pushing branch to Heroku production..."
git push heroku "$BRANCH:main"

echo "[4/6] Waiting for dyno restart..."
sleep 15

echo "[5/6] Checking production health..."
HEALTH=$(curl -fsS "https://$APP.herokuapp.com/health" 2>&1 || echo "FAILED")
if [ "$HEALTH" = "FAILED" ]; then
  echo "ERROR: Production health check failed"
  echo ""
  echo "[6/6] Fetching recent logs..."
  heroku logs --num 30 --app "$APP"
  exit 1
fi
echo "Production health: $HEALTH"

echo "[6/6] Verifying Redis connection..."
REDIS_CHECK=$(curl -fsS "https://$APP.herokuapp.com/api/system/health-deep" 2>&1 || echo "FAILED")
if [ "$REDIS_CHECK" = "FAILED" ]; then
  echo "WARNING: Redis health check failed"
else
  echo "Redis status: $REDIS_CHECK"
fi

# Log successful deploy
node scripts/deploy-log.mjs log "production-deploy:$BRANCH"

# Feed deploy event to DTHINK
node scripts/dthink-pipeline.mjs feed "deploy:production" "Production deploy of $BRANCH — health: $HEALTH"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  PRODUCTION DEPLOY COMPLETE                    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  URL: https://$APP.herokuapp.com"
echo "║  Health: OK"
echo "║  Branch: $BRANCH"
echo "║  Staging verified: $STAGING_HEALTH"
echo "╚══════════════════════════════════════════════╝"