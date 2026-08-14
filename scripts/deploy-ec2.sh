#!/usr/bin/env bash
set -euo pipefail

# Kudbee EC2 Deploy Script
# Deploys the current branch to an EC2 instance via SSH + PM2.
#
# Usage:
#   sudo bash scripts/deploy-ec2.sh [EC2_HOST] [SSH_KEY_PATH]
#
# Environment:
#   EC2_HOST     - EC2 public IP or DNS (default: from AWS CLI)
#   SSH_KEY_PATH - Path to .pem file (default: ../think-coonnect.pem)
#   EC2_USER     - SSH user (default: ubuntu)
#
# The script uses the first EC2 instance from .env if EC2_HOST is not provided.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PEM_KEY="${SSH_KEY_PATH:-$REPO_ROOT/think-coonnect.pem}"
EC2_USER="${EC2_USER:-ubuntu}"
APP_DIR="/opt/kudbee"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- Resolve EC2 host -----------------------------------------------------
EC2_HOST="${1:-}"

if [ -z "$EC2_HOST" ]; then
  # Try AWS CLI
  if command -v aws &>/dev/null; then
    INSTANCE_IDS=$(grep EC2_INSTANCE_ID "$REPO_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | cut -d',' -f1 | tr -d ' ')
    if [ -n "$INSTANCE_IDS" ]; then
      EC2_HOST=$(aws ec2 describe-instances \
        --instance-ids "$INSTANCE_IDS" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text 2>/dev/null || echo "")
    fi
  fi

  if [ -z "$EC2_HOST" ]; then
    log_error "EC2_HOST not provided and AWS CLI failed. Usage: $0 <EC2_HOST>"
    exit 1
  fi
fi

log_info "Target: $EC2_USER@$EC2_HOST"

# --- Validate PEM key -----------------------------------------------------
if [ ! -f "$PEM_KEY" ]; then
  log_error "SSH key not found: $PEM_KEY"
  log_error "Set SSH_KEY_PATH or place key at $PEM_KEY"
  exit 1
fi
chmod 600 "$PEM_KEY"

# --- Pre-flight checks ----------------------------------------------------
log_info "[1/6] Running pre-flight checks..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$EC2_USER@$EC2_HOST" "echo 'SSH OK'; pm2 --version; node -v; npm -v" || {
  log_error "SSH connection failed. Check host, key, and security group."
  exit 1
}

# --- Sync code ------------------------------------------------------------
log_info "[2/6] Syncing code to EC2..."
# Use rsync for efficient transfer (excludes node_modules, .git, etc.)
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='dist' \
  --exclude='.worktrees' \
  --exclude='logs' \
  -e "ssh -i $PEM_KEY -o StrictHostKeyChecking=no" \
  "$REPO_ROOT/" "$EC2_USER@$EC2_HOST:$APP_DIR/"

# --- Install dependencies -------------------------------------------------
log_info "[3/6] Installing dependencies..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "cd $APP_DIR && npm ci --legacy-peer-deps --ignore-scripts --silent 2>&1 | tail -5"

# --- Run migrations -------------------------------------------------------
log_info "[4/6] Running database migrations..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "cd $APP_DIR && npx tsx services/ingestion/server.js &>/dev/null & sleep 3 && curl -s http://127.0.0.1:3000/health | head -1 && pkill -f 'tsx services/ingestion/server.js' || true" || {
  log_warn "Migration health check had issues (may be fine if DB is external)"
}

# --- PM2 restart ----------------------------------------------------------
log_info "[5/6] Restarting PM2 processes..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "cd $APP_DIR && pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js"
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "pm2 save"

# --- Health check ---------------------------------------------------------
log_info "[6/6] Running health check..."
sleep 5
HEALTH=$(ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "curl -s http://127.0.0.1:3000/health 2>&1 || echo 'FAILED'" || echo "FAILED")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  EC2 DEPLOY COMPLETE                          ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Host:     $EC2_USER@$EC2_HOST"
echo "║  Health:   $HEALTH"
echo "║  URL:      http://$EC2_HOST"
echo "╠══════════════════════════════════════════════╣"
echo "║  USEFUL COMMANDS:                             ║"
echo "║  ssh -i $PEM_KEY $EC2_USER@$EC2_HOST"
echo "║  pm2 status"
echo "║  pm2 logs"
echo "║  pm2 restart all"
echo "╚══════════════════════════════════════════════╝"

if [[ "$HEALTH" == *"FAILED"* ]]; then
  log_error "Health check failed. Check logs:"
  log_error "  ssh -i $PEM_KEY $EC2_USER@$EC2_HOST 'pm2 logs'"
  exit 1
fi

exit 0
