---
Superseded by: ENGINEERING_STATE.md
Archived: 2026-08-04
Reason: Repository simplification (STAB-004)
---
# GITHUB GOVERNANCE AUDIT — OPS-002 Workstream A

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY | **Auditor:** KILOH

---

## Executive Summary

The repository `KudbeeZero/Kudbee-fuel-gage` is **public** with **no branch
protection**, **no CODEOWNERS**, **no Dependabot config**, and **mixed merge
strategy**. CI runs are green (Kudbee Bounded CI + CodeQL succeed on main and
PR branches), but the governance layer that should *enforce* quality is absent.
This is the single most important gap in the Engineering OS: **quality is
voluntary, not enforced.**

## 1. Repository Configuration

| Setting | Value | Assessment |
|:---|:---|:---|
| Visibility | public | ⚠️ source exposed; acceptable for now, verify intent |
| Default branch | main | ✅ |
| Squash merge | enabled | ✅ preferred for PR stacks |
| Merge commit | enabled | ⚠️ conflicts with linear-history goal |
| Rebase merge | enabled | ⚠️ allows non-squash history |
| Delete branch on merge | **false** | ❌ causes branch sprawl (72 branches observed) |
| Wiki | enabled | optional |
| Projects | disabled | ✅ |

## 2. Branch Protection — main

| Check | Status |
|:---|:---|
| Require PR | ❌ NOT CONFIGURED |
| Required status checks | ❌ NOT CONFIGURED (API returns 403 for this token — verify via owner) |
| Require reviews | ❌ NOT CONFIGURED |
| Linear history | ❌ NOT CONFIGURED |
| Signed commits | ❌ NOT CONFIGURED |
| Code owner review | ❌ no CODEOWNERS file |
| Dismiss stale reviews | ❌ N/A |

**Finding G-01 (CRITICAL):** main has no protection rules. Anyone with write
access can push directly. The THINK Protocol Rule 1 ("main is protected") is
**not enforced at the platform level** — only by workflow discipline.

## 3. CODEOWNERS

**Missing.** No `.github/CODEOWNERS` file exists. There is no required reviewer
for any path.

## 4. Security Analysis

| Feature | Status |
|:---|:---|
| Secret scanning | **null / not configured via API** (verify in dashboard) |
| Secret push protection | null / not configured |
| Dependabot alerts | 22 advisories reported (1 critical, 15 high, 6 moderate) |
| Dependabot security updates | null / not configured |
| Dependabot config file | **NO `.github/dependabot.yml`** |
| CodeQL | ✅ active (2 workflows: custom + built-in, both green) |

## 5. GitHub Actions Permissions

| Aspect | Finding |
|:---|:---|
| verify.yml permissions | `contents: read` — least privilege ✅ |
| codeql.yml permissions | actions:read, contents:read, security-events:write ✅ |
| Concurrency | `kudbee-ci-${{workflow}}-${{ref}}`, cancel-in-progress ✅ |
| Timeout | 20 min on verify ✅ |
| Workflow count | 7 active (2 CodeQL dupes, 2 Copilot, 1 CI, 1 Heroku deploy, 1 session logger) |

## 6. Workflow Inventory (see CI_PIPELINE_AUDIT.md for detail)

- `Kudbee Bounded CI` (`verify.yml`) — ✅ green, primary gate
- `CodeQL` (custom `codeql.yml`) — ✅ green
- `CodeQL` (built-in `dynamic/github-code-scanning`) — ✅ green
- `Deploy to Heroku Staging` — active
- `Session Logger` — active
- `Copilot` — active
- `Copilot cloud agent` — active
- **Duplicates:** two CodeQL workflows, two Copilot workflows — technical debt

## Recommended Actions (Awaiting Human Approval)

| # | Action | Risk | Rollback |
|:---|:---|:---|:---|
| G-1 | Enable branch protection on main: require PR + `Kudbee Bounded CI` check + 1 review | Low | Disable protection |
| G-2 | Set `delete_branch_on_merge: true` | Low | Re-enable branch retention |
| G-3 | Add `.github/CODEOWNERS` (e.g., `* @KudbeeZero/owners`) | Low | Remove file |
| G-4 | Add `.github/dependabot.yml` (npm weekly) | Low | Remove file |
| G-5 | Restrict merge to squash-only (disable merge/rebase commits) | Medium | Re-enable merge commit |
| G-6 | Enable secret scanning + push protection in dashboard | Low | Disable in dashboard |
| G-7 | Consolidate duplicate CodeQL + Copilot workflows | Low | Restore workflow files |
