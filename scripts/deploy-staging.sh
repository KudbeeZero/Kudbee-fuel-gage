#!/usr/bin/env bash
set -euo pipefail

# Kudbee Staging Deploy Script
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

# Deploy
echo ""
echo "[1/4] Pushing branch to Heroku..."
git push heroku "$BRANCH:main" --force

echo "[2/4] Waiting for dyno restart..."
sleep 10

echo "[3/4] Checking health..."
HEALTH=$(curl -fsS https://$APP.herokuapp.com/health 2>&1 || echo "FAILED")
if [ "$HEALTH" = "FAILED" ]; then
  echo "ERROR: Health check failed"
  heroku logs --tail --lines 20 --app $APP
  exit 1
fi

echo "[4/4] Health check passed"
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  DEPLOY COMPLETE                            ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  URL: https://$APP.herokuapp.com"
echo "║  Health: $HEALTH"
echo "╚══════════════════════════════════════════════╝"
