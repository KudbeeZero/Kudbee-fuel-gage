# Kudbee EC2 Migration Guide
## Replacing Heroku with AWS EC2

### Why migrate?

| Heroku Free | EC2 t2.micro |
|---|---|
| Dynos sleep after 30 min | Never sleeps |
| 550-1000 dyno hrs/mo | 750 hrs/mo free (12 mo) |
| Cold starts: 30s+ | Cold starts: none |
| Heroku-only add-ons | Full AWS integration |
| $7+/dyno at scale | $0 (free tier) → $8/mo |

### Architecture

```
EC2 Instance (t2.micro - free tier)
├── PM2 (process manager - replaces Heroku dynos)
│   ├── web:      npx tsx services/ingestion/server.js   :3000
│   ├── hermes:   npx tsx worker.js
│   ├── monitor:  node services/monitor/agent.js
│   └── sentinel: npx tsx services/sentinel/src/index.ts
├── nginx (reverse proxy) :80
└── systemd (auto-start PM2 on boot)

RDS PostgreSQL (existing cluster) → replaces Neon
Upstash Redis → keep for now (or migrate to ElastiCache)
S3 → cold think data storage
```

### Prerequisites

- 2 EC2 instances running (Ubuntu 22.04/24.04 LTS)
- Security group allows: SSH (22), HTTP (80), HTTPS (443)
- SSH key: `think-coonnect.pem`
- AWS CLI configured locally

### Step 1: Bootstrap EC2 (run once per instance)

```bash
# From repo root
sudo bash scripts/ec2-setup.sh
```

This installs: Node.js 22, PM2, nginx, git, awscli, logrotate, ufw.

### Step 2: Configure environment

```bash
# Copy your .env to the EC2 instance
EC2_HOST=$(bash scripts/ec2-info.sh 1 | grep -oP '[\d]+\.[\d]+\.[\d]+\.[\d]+')
scp -i think-coonnect.pem .env ubuntu@$EC2_HOST:/etc/kudbee/.env
ssh -i think-coonnect.pem ubuntu@$EC2_HOST "sudo chmod 600 /etc/kudbee/.env"
```

### Step 3: Deploy

```bash
# Deploy to first EC2 instance
sudo bash scripts/deploy-ec2.sh

# Or specify explicitly
sudo bash scripts/deploy-ec2.sh <EC2_PUBLIC_IP> /path/to/think-coonnect.pem
```

### Step 4: Verify

```bash
# SSH into EC2
ssh -i think-coonnect.pem ubuntu@$EC2_HOST

# Check PM2 status
pm2 status
pm2 logs

# Check nginx
sudo systemctl status nginx

# Check health
curl http://localhost/health
```

### Database: Neon → RDS Migration (optional but recommended)

Your AWS RDS cluster already exists. To migrate:

```bash
# 1. Get RDS endpoint
aws secretsmanager get-secret-value \
  --secret-id rds!cluster-bda376c1-1733-4cef-874d-583d4b74f717 \
  --query 'SecretString' --output text | jq -r '.host'

# 2. Update /etc/kudbee/.env on EC2
#    Replace DATABASE_URL with: postgresql://<DB_USER>:<DB_PASSWORD>@<rds-endpoint>:5432/kudbee

# 3. Run migrations
ssh -i think-coonnect.pem ubuntu@$EC2_HOST "cd /opt/kudbee && npx tsx services/ingestion/server.js &>/dev/null & sleep 3 && curl -s http://127.0.0.1:3000/health && pkill -f 'tsx services/ingestion/server.js'"
```

### Operational Commands

```bash
# Deploy
sudo bash scripts/deploy-ec2.sh

# View logs
ssh -i think-coonnect.pem ubuntu@$EC2_HOST "pm2 logs --lines 100"

# Restart all
ssh -i think-coonnect.pem ubuntu@$EC2_HOST "pm2 restart all"

# Stop all
ssh -i think-coonnect.pem ubuntu@$EC2_HOST "pm2 stop all"

# Check status
ssh -i think-coonnect.pem ubuntu@$EC2_HOST "pm2 status"

# SSH
ssh -i think-coonnect.pem ubuntu@$EC2_HOST

# Get EC2 info
bash scripts/ec2-info.sh 1   # First instance
bash scripts/ec2-info.sh 2   # Second instance
```

### Cost Comparison

| Service | Heroku | EC2 (Free Tier) |
|---|---|---|
| Hosting | $7+/dyno/mo | $0 (750 hrs/mo) |
| Database | $0-25/mo (Neon) | $0 (RDS free tier 12mo) |
| Redis | $0 (Upstash free) | $0 (Upstash) or $0 (ElastiCache 12mo) |
| Object Storage | N/A | $0 (S3 free tier) |
| **Total** | **$7-32/mo** | **$0/mo** |

### Free Tier Eligibility

| AWS Service | Free Tier | Duration |
|---|---|---|
| EC2 t2.micro | 750 hrs/mo | 12 months |
| RDS t2.micro | 750 hrs/mo | 12 months |
| S3 | 5GB storage | Forever |
| ElastiCache t2.micro | 750 hrs/mo | 12 months |
| Data Transfer | 100GB out | 12 months |

### SSL/HTTPS (optional)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate (point domain to EC2 IP first)
sudo certbot --nginx -d your-domain.com

# Auto-renewal is handled by systemd timer
```

### Monitoring

```bash
# PM2 monitoring (built-in)
pm2 monit

# System resources
htop
df -h
free -h

# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Troubleshooting

| Issue | Fix |
|---|---|
| PM2 not starting on boot | `pm2 startup systemd` then follow instructions |
| Port 3000 already in use | `pm2 stop all` then `pm2 start ecosystem.config.js` |
| nginx 502 Bad Gateway | Check `pm2 status`, ensure web process is running |
| Database connection refused | Check DATABASE_URL in `/etc/kudbee/.env` |
| SSH connection refused | Check EC2 security group allows port 22 |
