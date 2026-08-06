#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# scripts/aws-setup.sh — AWS CLI + credential setup for the Kudbee laptop.
#
# Run ONCE on your machine (macOS or Linux). Idempotent where possible.
#
#   ./scripts/aws-setup.sh install    # install AWS CLI v2 (brew/apt)
#   ./scripts/aws-setup.sh configure  # interactive: aws configure
#   ./scripts/aws-setup.sh verify     # check identity + region
#   ./scripts/aws-setup.sh all        # install + verify (configure is manual)
#
# The Kudbee stack (Heroku/Neon/Upstash) does NOT require AWS today. This
# future-proofs the environment for S3 / Lambda / SES / Bedrock when needed.
# ---------------------------------------------------------------------------
set -euo pipefail

install() {
  if command -v aws >/dev/null 2>&1; then
    echo "✓ AWS CLI already installed: $(aws --version 2>&1)"
    return
  fi
  echo "Installing AWS CLI v2..."
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      brew install awscli
    else
      echo "Install Homebrew first: https://brew.sh  (or use the bundled installer)"
      echo "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
      exit 1
    fi
  elif [[ "$(uname -s)" == "Linux" ]]; then
    echo "Downloading the official installer..."
    curl -sSf "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
    unzip -qo /tmp/awscliv2.zip -d /tmp/aws-install
    sudo /tmp/aws-install/aws/install
    rm -rf /tmp/awscliv2.zip /tmp/aws-install
  else
    echo "Unsupported OS. See: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
  fi
  echo "✓ AWS CLI installed: $(aws --version 2>&1)"
}

configure() {
  echo "Configuring AWS credentials..."
  echo "  1. Sign up: https://aws.amazon.com (free tier available)"
  echo "  2. IAM → Users → Create user 'kudbee-dev' → attach minimal policy"
  echo "  3. Create an ACCESS KEY (not a login password)"
  echo "  4. Run aws configure with those values:"
  echo ""
  aws configure
  echo "✓ Credentials written to ~/.aws/credentials + ~/.aws/config"
}

verify() {
  echo "Verifying AWS identity..."
  if [[ ! -f "$HOME/.aws/credentials" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
    echo "✗ No credentials found. Run: ./scripts/aws-setup.sh configure"
    exit 1
  fi
  aws sts get-caller-identity
  echo "✓ AWS is ready. Region: $(aws configure get region 2>/dev/null || echo 'not set')"
}

case "${1:-}" in
  install)   install ;;
  configure) configure ;;
  verify)    verify ;;
  all)       install; echo; verify; echo; echo "Next: ./scripts/aws-setup.sh configure" ;;
  *) echo "Usage: $0 {install|configure|verify|all}" ;;
esac
