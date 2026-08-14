#!/usr/bin/env bash
set -euo pipefail

# Kudbee EC2 Bootstrap Script
# Sets up a fresh EC2 instance to run the full Kudbee stack via PM2.
# Run this ONCE on a new EC2 instance:
#   chmod +x scripts/ec2-setup.sh
#   sudo bash scripts/ec2-setup.sh
#
# Requires: Ubuntu 22.04/24.04 LTS, sudo access

echo "╔══════════════════════════════════════════════╗"
echo "║  KUDBEE EC2 BOOTSTRAP                          ║"
echo "╚══════════════════════════════════════════════╝"

# --- 1. System packages ---------------------------------------------------
echo ""
echo "[1/8] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
  curl \
  git \
  nginx \
  build-essential \
  python3 \
  python3-pip \
  awscli \
  jq \
  logrotate \
  ufw \
  > /dev/null

# --- 2. Node.js 22 --------------------------------------------------------
echo ""
echo "[2/8] Installing Node.js 22..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null
  apt-get install -y -qq nodejs > /dev/null
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# --- 3. PM2 ---------------------------------------------------------------
echo ""
echo "[3/8] Installing PM2..."
npm install -g pm2@latest --silent 2>&1 | tail -1
pm2 --version

# --- 4. App directory -----------------------------------------------------
echo ""
echo "[4/8] Setting up app directory..."
APP_DIR="/opt/kudbee"
mkdir -p "$APP_DIR"
mkdir -p /var/log/kudbee
mkdir -p /etc/kudbee

# Clone or pull
if [ -d "$APP_DIR/.git" ]; then
  echo "Pulling latest code..."
  cd "$APP_DIR"
  git pull --ff-only
else
  echo "Cloning repository..."
  # User should set this to their actual repo
  REPO_URL="${KUDBEE_GIT_REPO:-https://github.com/KudbeeZero/Kudbee-fuel-gage.git}"
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# --- 5. Dependencies ------------------------------------------------------
echo ""
echo "[5/8] Installing dependencies..."
cd "$APP_DIR"
npm ci --legacy-peer-deps --ignore-scripts --silent 2>&1 | tail -3

# --- 6. Environment -------------------------------------------------------
echo ""
echo "[6/8] Configuring environment..."
ENV_FILE="/etc/kudbee/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "WARNING: $ENV_FILE not found. Copy your .env there before starting."
  echo "  sudo cp .env $ENV_FILE"
  echo "  sudo chmod 600 $ENV_FILE"
else
  # Symlink for PM2
  ln -sf "$ENV_FILE" "$APP_DIR/.env"
fi

# --- 7. nginx -------------------------------------------------------------
echo ""
echo "[7/8] Configuring nginx..."
cat > /etc/nginx/sites-available/kudbee << 'NGINX_CONF'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (no auth required)
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/kudbee /etc/nginx/sites-enabled/kudbee
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- 8. PM2 startup -------------------------------------------------------
echo ""
echo "[8/8] Configuring PM2 auto-start..."
pm2 start ecosystem.config.js
pm2 save
PM2_STARTUP=$(pm2 startup systemd 2>&1 | tail -1)
echo "$PM2_STARTUP"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  EC2 BOOTSTRAP COMPLETE                         ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  App dir:  $APP_DIR"
echo "║  PM2:      pm2 status"
echo "║  Logs:     /var/log/kudbee/"
echo "║  nginx:    http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<EC2_IP>')"
echo "╠══════════════════════════════════════════════╣"
echo "║  NEXT STEPS:                                   ║"
echo "║  1. sudo cp .env /etc/kudbee/.env              ║"
echo "║  2. sudo chmod 600 /etc/kudbee/.env            ║"
echo "║  3. bash scripts/deploy-ec2.sh                 ║"
echo "╚══════════════════════════════════════════════╝"
