#!/usr/bin/env bash
set -euo pipefail

# ec2-info.sh - Get EC2 instance information from AWS
# Usage: bash scripts/ec2-info.sh [INSTANCE_INDEX]
#   INSTANCE_INDEX: 1 or 2 (default: 1)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

INDEX="${1:-1}"
INSTANCE_IDS=$(grep EC2_INSTANCE_ID "$REPO_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')

if [ -z "$INSTANCE_IDS" ]; then
  echo "ERROR: EC2_INSTANCE_ID not found in .env"
  exit 1
fi

# Convert comma-separated to array
IFS=',' read -ra IDS <<< "$INSTANCE_IDS"
INSTANCE_ID="${IDS[$((INDEX - 1))]}"

if [ -z "$INSTANCE_ID" ]; then
  echo "ERROR: Instance index $INDEX not found. Available: ${#IDS[@]} instances"
  exit 1
fi

echo "Querying AWS for instance: $INSTANCE_ID"
echo ""

aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].[InstanceId,State.Name,PublicIpAddress,PublicDnsName,Tags[?Key==`Name`].Value|[0],LaunchTime]' \
  --output table
