#!/usr/bin/env bash
set -euo pipefail

# Kudbee EC2 SSM Deploy Script
# Deploys via AWS Systems Manager Session Manager (no SSH key, no open ports).
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - SSM role attached to EC2 instances (AmazonSSMManagedInstanceCore)
#   - SSM agent running on instances
#   - Verified: aws ssm describe-instance-information --filters Key=InstanceIds,Values=i-xxx
#
# Usage:
#   bash scripts/deploy-ec2-ssm.sh [INSTANCE_INDEX] [AWS_REGION]
#
# Environment:
#   INSTANCE_INDEX - 1 or 2 (default: 1)
#   AWS_REGION     - AWS region (default: us-east-1)
#   APP_DIR        - App directory on EC2 (default: /opt/kudbee)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

INDEX="${1:-1}"
AWS_REGION="${AWS_REGION:-us-east-1}"
APP_DIR="${APP_DIR:-/opt/kudbee}"
EC2_USER="${EC2_USER:-ubuntu}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- Resolve instance ID from .env -----------------------------------------
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

log_info "Target: EC2 instance $INSTANCE_ID (index $INDEX) in $AWS_REGION"

# --- Verify SSM connectivity -----------------------------------------------
log_info "[1/5] Verifying SSM connectivity..."
SSM_STATUS=$(aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text 2>/dev/null || echo "Unknown")

if [ "$SSM_STATUS" != "Online" ]; then
  log_error "SSM instance not online (status: $SSM_STATUS)"
  log_error "Ensure SSM agent is running and IAM role has AmazonSSMManagedInstanceCore"
  exit 1
fi

log_info "SSM status: $SSM_STATUS"

# --- Sync code via SSM ----------------------------------------------------
log_info "[2/5] Syncing code to EC2 via SSM..."

# Create a tarball, upload to S3, then download on EC2 via SSM
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TARBALL="kudbee-deploy-${TIMESTAMP}.tar.gz"
S3_BUCKET="${KUDBEE_DEPLOY_BUCKET:-kudbee-deploy-${AWS_REGION}}"

# Create tarball excluding node_modules, .git, .env
tar -czf "/tmp/${TARBALL}" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='dist' \
  --exclude='.worktrees' \
  --exclude='logs' \
  -C "$REPO_ROOT" .

# Upload to S3
log_info "Uploading to S3..."
aws s3 cp "/tmp/${TARBALL}" "s3://${S3_BUCKET}/${TARBALL}" --region "$AWS_REGION" --quiet

# Execute SSM command to download and extract
log_info "Downloading on EC2..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: sync code" \
  --parameters "commands=cd $APP_DIR && aws s3 cp s3://${S3_BUCKET}/${TARBALL} /tmp/${TARBALL} && tar -xzf /tmp/${TARBALL} && rm /tmp/${TARBALL}" \
  --output text \
  --query 'Command.CommandId' | tail -1

# Wait for command to complete
log_info "Waiting for sync to complete..."
sleep 5

# --- Install dependencies via SSM ------------------------------------------
log_info "[3/5] Installing dependencies..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: npm install" \
  --parameters "commands=cd $APP_DIR && npm ci --legacy-peer-deps --ignore-scripts 2>&1 | tail -10" \
  --output text \
  --query 'Command.CommandId' | tail -1

log_info "Waiting for install (this takes ~60s)..."
sleep 60

# --- PM2 restart via SSM --------------------------------------------------
log_info "[4/5] Restarting PM2..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: PM2 restart" \
  --parameters "commands=cd $APP_DIR && pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js && pm2 save" \
  --output text \
  --query 'Command.CommandId' | tail -1

sleep 5

# --- Health check via SSM --------------------------------------------------
log_info "[5/5] Running health check..."
HEALTH=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "Kudbee deploy: health check" \
  --parameters "commands=curl -s http://127.0.0.1:3000/health 2>&1 || echo 'FAILED'" \
  --query 'Command.CommandId' \
  --output text 2>/dev/null | tail -1)

# Wait a bit for health check to complete
sleep 10

# Get command output
OUTPUT=$(aws ssm get-command-invocation \
  --command-id "$HEALTH" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'StandardOutputContent' \
  --output text 2>/dev/null || echo "FAILED")

# --- EC2 Instance Connect Endpoint (ECP) HTTP tunnel -----------------------
log_info ""
log_info "EC2 Instance Connect Endpoint (ECP):"
ECP_ENDPOINT=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text 2>/dev/null || echo "")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  EC2 SSM DEPLOY COMPLETE                     ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Instance:  $INSTANCE_ID"
echo "║  SSM:       Online (tunneled access)"
echo "║  Health:    $OUTPUT"
echo "║  URL:       http://$ECP_ENDPOINT"
echo "╠══════════════════════════════════════════════╣"
echo "║  TUNNEL ACCESS (no open ports):              ║"
echo "║  # SSH tunnel                                ║"
echo "║  aws ssm start-session --target $INSTANCE_ID"
echo "╠══════════════════════════════════════════════╣"
echo "║  # HTTP tunnel (ECP-like port forward)       ║"
echo "║  aws ssm start-session --target $INSTANCE_ID \\"
echo "║    --document-name AWS-StartPortForwardingSession \\"
echo "║    --parameters '{\"portNumber\":[\"3000\"],\"localPortNumber\":[\"3000\"]}'"
echo "║  # Then: http://localhost:3000"
echo "╠══════════════════════════════════════════════╣"
echo "║  # Full console (ECP endpoint)               ║"
echo "║  https://console.aws.amazon.com/systems-manager"
echo "╚══════════════════════════════════════════════╝"

# Cleanup
rm -f "/tmp/${TARBALL}"

exit 0
