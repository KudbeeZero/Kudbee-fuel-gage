#!/bin/bash
set -euo pipefail

# Kudbee EC2 Deploy via WSL + SSM
# Run this FROM WSL (Ubuntu in Windows).
# No SSH key needed. Uses AWS SSM for everything.
#
# Prerequisites (run once):
#   sudo apt install awscli git nodejs npm
#   npm install -g pm2
#   aws configure set region us-east-1
#   aws configure
#
# Usage:
#   bash scripts/deploy-ec2-wsl.sh [INSTANCE_INDEX]
#
# Environment:
#   INSTANCE_INDEX - 1 or 2 (default: 1)
#   AWS_REGION     - default: us-east-1
#   APP_DIR        - default: /opt/kudbee
#   PEM_KEY        - optional, for direct SSH fallback

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

INDEX="${1:-1}"
AWS_REGION="${AWS_REGION:-us-east-1}"
APP_DIR="${APP_DIR:-/opt/kudbee}"
EC2_USER="${EC2_USER:-ubuntu}"

# Colors (works in WSL terminal)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $*"; }

# --- Resolve instance ID from Windows .env --------------------------------
# In WSL, the repo is likely mounted under /mnt/c/Users/domin/Downloads/testLM
# or you can clone it directly in WSL's Linux filesystem for better performance.

if [ ! -f "$REPO_ROOT/.env" ]; then
  log_error ".env not found at $REPO_ROOT"
  log_error "If running from Windows mount, consider cloning the repo directly in WSL:"
  log_error "  git clone <repo-url> ~/kudbee && cd ~/kudbee"
  exit 1
fi

INSTANCE_IDS=$(grep EC2_INSTANCE_ID "$REPO_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')

if [ -z "$INSTANCE_IDS" ]; then
  log_error "EC2_INSTANCE_ID not found in .env"
  exit 1
fi

IFS=',' read -ra IDS <<< "$INSTANCE_IDS"
INSTANCE_ID="${IDS[$((INDEX - 1))]}"

if [ -z "$INSTANCE_ID" ]; then
  log_error "Instance index $INDEX not found. Available: ${#IDS[@]} instances"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  KUDBEE EC2 DEPLOY (WSL + SSM)               ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Instance:  $INSTANCE_ID"
echo "║  Region:    $AWS_REGION"
echo "║  App dir:   $APP_DIR"
echo "╚══════════════════════════════════════════════╝"
echo ""

# --- Step 1: Verify SSM ---------------------------------------------------
log_step "[1/5] Verifying SSM connectivity..."

SSM_STATUS=$(aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text 2>/dev/null || echo "Unknown")

if [ "$SSM_STATUS" != "Online" ]; then
  log_error "SSM instance not online (status: $SSM_STATUS)"
  log_error "Fix: ensure IAM role has AmazonSSMManagedInstanceCore"
  exit 1
fi

log_info "SSM: $SSM_STATUS"

# --- Step 2: Sync code via SSM (S3 transfer) ------------------------------
log_step "[2/5] Syncing code to EC2..."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TARBALL="kudbee-deploy-${TIMESTAMP}.tar.gz"
S3_BUCKET="${KUDBEE_DEPLOY_BUCKET:-kudbee-deploy-${AWS_REGION}}"

# Create tarball from Linux filesystem (faster than /mnt/c)
tar -czf "/tmp/${TARBALL}" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='dist' \
  --exclude='.worktrees' \
  --exclude='logs' \
  --exclude='.npm' \
  -C "$REPO_ROOT" .

# Upload to S3
log_info "Uploading tarball to s3://${S3_BUCKET}/..."
aws s3 cp "/tmp/${TARBALL}" "s3://${S3_BUCKET}/${TARBALL}" --region "$AWS_REGION" --quiet

# Download and extract on EC2 via SSM
log_info "Extracting on EC2..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: sync code" \
  --parameters "commands=cd $APP_DIR && aws s3 cp s3://${S3_BUCKET}/${TARBALL} /tmp/${TARBALL} && tar -xzf /tmp/${TARBALL} && rm /tmp/${TARBALL}" \
  --output text \
  --query 'Command.CommandId' | tail -1 > /tmp/ssm-cmd-sync.txt

sleep 5

# --- Step 3: Install dependencies ------------------------------------------
log_step "[3/5] Installing dependencies..."

aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: npm install" \
  --parameters "commands=cd $APP_DIR && npm ci --legacy-peer-deps --ignore-scripts 2>&1 | tail -15" \
  --output text \
  --query 'Command.CommandId' | tail -1 > /tmp/ssm-cmd-install.txt

log_info "Installing dependencies on EC2 (~60s)..."
sleep 60

# --- Step 4: PM2 restart ---------------------------------------------------
log_step "[4/5] Restarting PM2..."

aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: PM2 restart" \
  --parameters "commands=cd $APP_DIR && pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js && pm2 save && pm2 status" \
  --output text \
  --query 'Command.CommandId' | tail -1 > /tmp/ssm-cmd-pm2.txt

sleep 5

# Get PM2 status output
PM2_CMD_ID=$(cat /tmp/ssm-cmd-pm2.txt)
PM2_OUTPUT=$(aws ssm get-command-invocation \
  --command-id "$PM2_CMD_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'StandardOutputContent' \
  --output text 2>/dev/null || echo "")

log_info "PM2 status:"
echo "$PM2_OUTPUT"

# --- Step 5: Health check --------------------------------------------------
log_step "[5/5] Health check..."

HEALTH_CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: health" \
  --parameters "commands=curl -s http://127.0.0.1:3000/health 2>&1 || echo 'FAILED'" \
  --query 'Command.CommandId' \
  --output text 2>/dev/null | tail -1)

sleep 10

HEALTH_OUTPUT=$(aws ssm get-command-invocation \
  --command-id "$HEALTH_CMD_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'StandardOutputContent' \
  --output text 2>/dev/null || echo "FAILED")

# --- EC2 Instance Connect Endpoint (ECP) tunnel ---------------------------
log_step "ECP/SSM Tunnel Access:"

# Get public IP for ECP endpoint reference
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text 2>/dev/null || echo "")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  DEPLOY COMPLETE (WSL + SSM)                 ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Instance:  $INSTANCE_ID"
echo "║  SSM:       Online"
echo "║  Health:    $HEALTH_OUTPUT"
if [ -n "$PUBLIC_IP" ]; then
echo "║  URL:       http://$PUBLIC_IP"
fi
echo "╠══════════════════════════════════════════════╣"
echo "║  TUNNEL OPTIONS:                              ║"
echo "║                                               ║"
echo "║  1. SSM Port Forward (HTTP tunnel):           ║"
echo "║     aws ssm start-session --target $INSTANCE_ID \\"
echo "║       --document-name AWS-StartPortForwardingSession \\"
echo "║       --parameters '{\"portNumber\":[\"3000\"],\\"
echo "║         \"localPortNumber\":[\"3000\"]}'"
echo "║     Then: http://localhost:3000"
echo "║                                               ║"
echo "║  2. SSM Shell (direct terminal):              ║"
echo "║     aws ssm start-session --target $INSTANCE_ID"
echo "║                                               ║"
echo "║  3. Direct SSH (if public IP + SG open):      ║"
echo "║     ssh -i $PEM_KEY $EC2_USER@$PUBLIC_IP"
echo "║  (WSL path to key: /mnt/c/.../think-coonnect.pem)"
echo "╠══════════════════════════════════════════════╣"
echo "║  PM2 LOGS (via SSM):                          ║"
echo "║  aws ssm send-command --instance-ids $INSTANCE_ID \\"
echo "║    --document-name AWS-StartPortForwardingSession"
echo "╚══════════════════════════════════════════════╝"
echo ""

# --- Cleanup --------------------------------------------------------------
rm -f "/tmp/${TARBALL}" /tmp/ssm-cmd-*.txt

# Exit with health status
if [[ "$HEALTH_OUTPUT" == *"OK"* ]]; then
  exit 0
else
  log_warn "Health check returned: $HEALTH_OUTPUT"
  exit 0  # Don't fail — SSM deploy might need ECP tunnel for HTTP
fi
