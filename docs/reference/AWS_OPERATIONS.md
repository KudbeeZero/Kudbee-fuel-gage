# AWS Operations Runbook (Training Reference)

Source of truth for all AWS setup/operations performed on the Kudbee account
(Account: 196856329692, Region: us-east-1). Consumed by DTHINK/THINK training.

---

## 1. AWS CLI v2 Install (Windows)

Installer (run in a terminal):
    irm https://awscli.amazonaws.com/v2/install.ps1 | iex

Path after install (NOT auto-added to current shell):
    C:\Users\domin\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe

Persistent PATH fix (run once in Cmd, then restart terminal):
    setx PATH %PATH%;C:\Users\domin\AppData\Local\Programs\Amazon\AWSCLIV2

Gotcha: aws is not on PATH in a fresh terminal. Use the full path or restart the shell.

---

## 2. Agent Toolkit for AWS Setup

Steps (per aws/agent-toolkit-for-aws setup.md):
  1. Detect OS (Windows here).
  2. Install AWS CLI v2 (above).
  3. Configure region: aws configure set region us-east-1
  4. Login (browser SSO): aws login --region us-east-1
     - Credentials valid 12h, renewable 90 days without re-auth in browser.
  5. Verify: aws sts get-caller-identity
  6. Install toolkit: aws configure agent-toolkit --yes --region us-east-1
     - Installs AWS skills for detected agent (Cursor at ~/.cursor/skills)
     - Updates MCP config (~/.cursor/mcp.json)
  7. Verify: aws agent-toolkit list-available-skills --region us-east-1
  8. Save rules to ~/.cursor/rules/aws-agent-rules.mdc

Skills installed (18): amazon-bedrock, aws-auth, aws-billing-and-cost-management,
aws-blocks, aws-cdk, aws-cloudformation, aws-compute, aws-containers, aws-deployment,
aws-messaging-and-streaming, aws-observability, aws-sdk-*, aws-security, aws-serverless,
launch-with-aws, signing-in-to-aws.

---

## 3. IAM Role for SSM (Systems Manager) - Fixing the credential error

Symptom:
    SSM Agent unable to acquire credentials: ... AccessDeniedException:
    Systems Manager's instance management role is not configured for account: 196856329692

Root cause: EC2 instance had no IAM instance profile with SSM permissions.

Fix (preferred: AWS Console):
  1. IAM -> Roles -> Create role
  2. Trusted entity: AWS service -> EC2
  3. Attach policy: AmazonSSMManagedInstanceCore
  4. Name: EC2-SSM-ROLE
     -> creates role ARN arn:aws:iam::196856329692:role/EC2-SSM-ROLE
     -> creates instance profile ARN arn:aws:iam::196856329692:instance-profile/EC2-SSM-ROLE

CLI alternative (inline JSON must be valid; shells mangle quotes):
    aws iam create-role --role-name EC2-SSM-Role --assume-role-policy-document file://trust-policy.json
    aws iam attach-role-policy --role-name EC2-SSM-Role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
    aws iam create-instance-profile --instance-profile-name EC2-SSM-Profile
    aws iam add-role-to-instance-profile --instance-profile-name EC2-SSM-Profile --role-name EC2-SSM-Role
    aws ec2 associate-iam-instance-profile --instance-id i-xxx --iam-instance-profile Name=EC2-SSM-Profile

Associate profile with an instance (replace if one already exists):
    aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=i-xxx
    aws ec2 replace-iam-instance-profile-association --association-id iip-assoc-xxx --iam-instance-profile Name=EC2-SSM-ROLE
    (if stuck in 'associating': disassociate first, wait, then associate)

After association: reboot the instance so the SSM agent reloads credentials.
Verify: aws ssm describe-instance-information --filters Key=InstanceIds,Values=i-xxx,i-yyy
    -> PingStatus = Online

---

## 4. EC2 Instance Connect (keyless SSH)

Prereq: the instance must have the SSM role (section 3) AND EC2 Instance Connect installed.
Generate a local key, push it via Instance Connect:
    ssh-keygen -t rsa -b 4096 -f %USERPROFILE%/.ssh/id_rsa -N ''
    aws ec2-instance-connect send-ssh-public-key --instance-id i-xxx --instance-os-user ec2-user --ssh-public-key file://%USERPROFILE%/.ssh/id_rsa.pub --region us-east-1

Then connect via Session Manager (no key needed once SSM works):
    aws ssm start-session --target i-xxx

Gotcha: push-key uses port 60255 localhost callback; may need --remote if browser unavailable on device.

---

## 5. Systems Manager Unified Console

Enable via console: https://us-east-1.console.aws.amazon.com/systems-manager/home?region=us-east-1
Setup performs (in us-east-1):
  - Default Host Management Configuration (DHMC): checks/remediates SSM perms daily
  - Inventory metadata collection every 12h
  - SSM Agent auto-update every 14 days
  - Provisions supporting services for unified console

Result after setup: 2 managed nodes, 100% managed, Amazon Linux, agent 3.3.4851.0.

Just-in-time node access: zero-standing-privilege model; operators request time-bound
access, optional RDP session recording, fine-grained approval policies.

---

## 6. Cost Guardrails (Cloud Practitioner)

Active billable resources (2026-08-12):
  - 2x EC2 t3.micro (free-tier partial, runs out ~Aug 28 at 24/7)
  - 2x 8GB gp3 EBS (free-tier 30GB OK)

Taken down (2026-08-12):
  - Aurora PostgreSQL Serverless cluster think-db-1 (not free-tier eligible)
  - Restore snapshot: think-db-1-final-20260812

Actions: stop unused instance, schedule stop/start, set AWS Budgets alerts at 5/10/20 USD.
