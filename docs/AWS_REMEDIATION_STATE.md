# AWS_REMEDIATION_STATE.md

**Last Updated:** 2026-08-16  
**Status:** COMPLETE

---

## AWS ACCOUNT
- Account: 196856329692
- Region: us-east-1

---

## PRODUCTION INSTANCES
- i-0a8157bc8ea33b36b
- i-0685561c90845986d

---

## CURRENT INSTANCE PROFILE
- EC2-SSM-MINIMAL

---

## CURRENT ROLE
- EC2-SSM-MINIMAL
- Trust: ec2.amazonaws.com
- ONLY attached managed policy:
  arn:aws:iam::aws:policy/service-role/AmazonSSMManagedInstanceCore

---

## OLD ROLE
- EC2-SSM-ROLE
- Preserved for rollback
- 0 attached managed policies
- **DO NOT delete automatically**

---

## SSM / DHMC
- SSM Agent remains Online on both instances
- SSM/DHMC uses:
  AWS-QuickSetup-SSM-DefaultEC2MgmtRole-us-east-1
- Quick Setup/DHMC role was NOT modified
- **DO NOT modify that role unless a future task explicitly requires it**

---

## REMEDIATION STATUS
- IAM least-privilege migration COMPLETE
- Both instances migrated successfully
- Application health verified
- 15 excessive policies removed from EC2-SSM-ROLE
- No AWS application SDK dependency was identified
- Deployment AWS commands use operator credentials, not the EC2 workload role

---

## IMPORTANT HISTORICAL LESSON

The previous investigation wasted significant time because repository documentation did not match live AWS state.

**Therefore future agents MUST follow this workflow:**

1. **READ THIS DOCUMENT FIRST.**
2. Treat it as the current project handoff.
3. **Do NOT repeat completed AWS discovery.**
4. Only perform fresh AWS verification when the current task actually requires it.
5. Before any AWS WRITE operation:
   - verify account
   - verify target resource
   - capture current state
   - make the smallest change possible
   - verify immediately
6. Never assume repository documentation represents current AWS state.
7. Live AWS state takes precedence over stale documentation.
8. Never modify Quick Setup/DHMC resources without explicit task scope.
9. Never delete EC2-SSM-ROLE automatically; it is the rollback anchor until explicitly retired.

---

## DO NOT REPEAT

### Completed Work (Do Not Redo)
- AWS authentication diagnosis
- AWS account verification
- IAM role-chain investigation
- EC2 instance-profile investigation
- SSM/DHMC investigation
- CloudTrail role-usage investigation
- repository AWS SDK investigation
- 15-policy analysis
- IAM remediation
- post-remediation SSM verification
- application health verification

### Verified State (Do Not Reinvestigate)
- Account: 196856329692
- Region: us-east-1
- Both instances: SSM Online
- SSM Role: AWS-QuickSetup-SSM-DefaultEC2MgmtRole-us-east-1
- Instance Profile: EC2-SSM-MINIMAL
- Minimal Role: EC2-SSM-MINIMAL with only AmazonSSMManagedInstanceCore
- Old Role: EC2-SSM-ROLE preserved with 0 policies

---

## NEXT SESSION BOOT SEQUENCE

When KIRO starts a new session:

1. **read_files docs/AWS_REMEDIATION_STATE.md**
2. Read the existing project handoff/state files
3. Summarize only the current state in 5-10 lines
4. Identify the user's actual requested task
5. Continue from the next unresolved task
6. **Do NOT reopen completed IAM work**

---

## RULE

> **"DO NOT SPEND TOKENS REDISCOVERING VERIFIED STATE. USE THE PERSISTENT HANDOFF."**

---

## AWS QUICK REFERENCE

| Resource | ARN | Status |
|:---|:---|:---|
| EC2-SSM-MINIMAL | arn:aws:iam::196856329692:role/EC2-SSM-MINIMAL | ACTIVE |
| EC2-SSM-MINIMAL Profile | arn:aws:iam::196856329692:instance-profile/EC2-SSM-MINIMAL | ACTIVE |
| EC2-SSM-ROLE | arn:aws:iam::196856329692:role/EC2-SSM-ROLE | PRESERVED |
| Quick Setup SSM Role | arn:aws:iam::196856329692:role/AWS-QuickSetup-SSM-DefaultEC2MgmtRole-us-east-1 | UNCHANGED |

---

## APPLICATION HEALTH

- Both EC2 instances: RUNNING
- SSM Agent: ONLINE
- SSM IamRole: AWS-QuickSetup-SSM-DefaultEC2MgmtRole-us-east-1
- Application health check: PASSED

---

*This document is the authoritative source for current AWS state. All other AWS documentation in the repository is considered stale until verified against this file.*