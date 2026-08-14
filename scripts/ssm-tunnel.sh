#!/usr/bin/env bash
set -euo pipefail

# ssm-tunnel.sh - Create HTTP tunnels to EC2 via AWS SSM
# This is the "Amazon tunnel service" — no open ports, no public IPs needed.
#
# Usage:
#   bash scripts/ssm-tunnel.sh [INSTANCE_INDEX] [LOCAL_PORT] [REMOTE_PORT] [AWS_REGION]
#
# Examples:
#   bash scripts/ssm-tunnel.sh 1 3000 3000    # Tunnel port 3000
#   bash scripts/ssm-tunnel.sh 1 8080 3000    # Tunnel port 3000 to local 8080
#
# The tunnel stays open until you Ctrl+C. Then hit http://localhost:<LOCAL_PORT>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

INDEX="${1:-1}"
LOCAL_PORT="${2:-3000}"
REMOTE_PORT="${3:-3000}"
AWS_REGION="${4:-us-east-1}"

# Resolve instance ID from .env
INSTANCE_IDS=$(grep EC2_INSTANCE_ID "$REPO_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')

if [ -z "$INSTANCE_IDS" ]; then
  echo "ERROR: EC2_INSTANCE_ID not found in .env"
  exit 1
fi

IFS=',' read -ra IDS <<< "$INSTANCE_IDS"
INSTANCE_ID="${IDS[$((INDEX - 1))]}"

if [ -z "$INSTANCE_ID" ]; then
  echo "ERROR: Instance index $INDEX not found. Available: ${#IDS[@]} instances"
  exit 1
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  AWS SSM HTTP TUNNEL                          ║"
echo "╠══════════════════════════╦════════════════════╣"
echo "║  Instance:               ║ $INSTANCE_ID"
echo "║  Local port:             ║ $LOCAL_PORT"
echo "║  Remote port:            ║ $REMOTE_PORT"
echo "║  Region:                 ║ $AWS_REGION"
echo "╠══════════════════════════╩════════════════════╣"
echo "║  Tunneling through AWS SSM (no open ports)   ║"
echo "║  Hit http://localhost:$LOCAL_PORT             ║"
echo "║  Ctrl+C to stop                               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Verify SSM is online
SSM_STATUS=$(aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text 2>/dev/null || echo "Unknown")

if [ "$SSM_STATUS" != "Online" ]; then
  echo "ERROR: SSM instance not online (status: $SSM_STATUS)"
  echo "Ensure:"
  echo "  1. IAM role with AmazonSSMManagedInstanceCore is attached"
  echo "  2. SSM agent is running on the instance"
  echo "  3. Instance is in us-east-1 (or update AWS_REGION)"
  exit 1
fi

# Start port forwarding session
aws ssm start-session \
  --target "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --document-name "AWS-StartPortForwardingSession" \
  --parameters "{\"portNumber\":[\"$REMOTE_PORT\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}"
