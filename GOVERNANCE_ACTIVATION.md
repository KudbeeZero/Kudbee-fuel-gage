# GOVERNANCE_ACTIVATION — OPS-005 Phase 1 (A-1 + A-2)

**THINK Governance Engine** | **Date:** 2026-08-02 | **Owner:** Human admin (KILOH verified token lacks repo-admin scope)

---

## Why Human Activation Is Required

KILOH's GitHub token is **read-only for repo administration** (GitHub returns
403 on branch-protection and repo-settings writes). This is deliberate
least-privilege. The following must be applied by a **repository administrator**
via the GitHub web UI. KILOH provides exact steps + rollback + verification.

## A-3 — Disable Heroku CI Pipeline Flag

**Status:** CODE-LEVEL disabled (app.json test env removed in OPS-003) but
**pipeline-level CI is still queuing** — test runs #208-211 created through
02:18Z on 2026-08-02. This is dashboard-controlled on cedar pipelines.

### Human action (Heroku Dashboard)

```
Heroku Dashboard → kudbee-fuel-gage-pipeline → Tests → Settings → Disable CI
```

### Verification
```bash
curl -s -n "https://api.heroku.com/pipelines/48ae3106-35ef-434f-ac3f-1f85c0f2f833/test-runs" \
  -H "Authorization: Bearer ${HEROKU_API_KEY}" \
  -H "Accept: application/vnd.heroku+json; version=3"
# Expected: no NEW runs after disable (existing orphan runs drain)
```

## A-4 — Configuration Cleanup

**Status:** STAGED — prod config changes are production-impacting and require
explicit approval (B-3). Duplicates identified:

| Config | Action |
|:---|:---|
| `DATABASE_URL_AGENT_v2` (dupe of DATABASE_URL) | unset if unused |
| `UPSTASH_REDIS_REST_TOKEN_2` (3 tokens / 2 instances) | remove unused |
| `UPSTASH_REDIS_REST_TOKEN_SLOW` | keep (slow brain) |
| `GROK_API` vs `GROQ_API_KEY` naming mismatch | normalize to GROQ_API_KEY |

**Rollback:** re-set the removed var to its prior value (captured in
`.kilo/memory/config-backup.json` before change).

## A-1 — Enable Branch Protection on main

### Web UI (Settings → Branches → Add branch protection rule)

| Field | Value |
|:---|:---|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ |
| Require approvals | 1 |
| Dismiss stale pull request approvals when new commits are pushed | ✅ |
| Require status checks to pass before merging | ✅ |
| Require branches to be up to date before merging | ✅ |
| Status checks to require | `Kudbee Bounded CI`, `CodeQL` |
| Require conversation resolution | ✅ |
| Require linear history | ✅ |
| Require signed commits | (optional — off) |
| Include administrators | ✅ (or rely on `Enforce` toggle) |
| Do not allow bypassing the above settings | ✅ |
| Restrict who can push to matching branches | ✅ → administrators only |
| Allow force pushes | ❌ |
| Allow deletions | ❌ |

### API alternative (admin token)

```bash
gh api -X PUT repos/KudbeeZero/Kudbee-fuel-gage/branches/main/protection \
  -f required_status_checks='{"strict":true,"contexts":["Kudbee Bounded CI","CodeQL"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -f required_linear_history=true \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -f restrictions='{"users":[],"teams":[],"apps":[]}'
```

### Rollback
Delete the branch protection rule (Settings → Branches → delete rule).

### Verification (KILOH will run after activation)
```bash
gh api repos/KudbeeZero/Kudbee-fuel-gage/branches/main/protection \
  --jq '{checks:.required_status_checks.contexts, reviews:.required_pull_request_reviews.required_approving_review_count, linear:.required_linear_history}'
# Expected: checks=["Kudbee Bounded CI","CodeQL"], reviews=1, linear=true
```

## A-2 — Merge Strategy (squash-only)

### Web UI (Settings → General → Pull Requests)

| Setting | Value |
|:---|:---|
| Allow merge commits | ❌ |
| Allow squash merging | ✅ |
| Allow rebase merging | ❌ (linear history enforced via squash) |
| Automatically delete head branches | ✅ |

### API alternative (admin token)

```bash
gh api -X PATCH repos/KudbeeZero/Kudbee-fuel-gage \
  -f allow_merge_commit=false \
  -f allow_squash_merge=true \
  -f allow_rebase_merge=false \
  -f delete_branch_on_merge=true
```

### Rationale
Squash-only + linear history keeps `main` a clean release branch and
strengthens the stacked-PR model (each PR = one squash commit = one stack
layer). Delete-branch-on-merge prevents the branch sprawl observed in
OPS-001 (72 branches).

### Rollback
Re-enable merge commits / disable branch deletion.

### Verification
```bash
gh api repos/KudbeeZero/Kudbee-fuel-gage --jq '{merge:.allow_merge_commit,squash:.allow_squash_merge,rebase:.allow_rebase_merge,delete_branch:.delete_branch_on_merge}'
# Expected: merge=false, squash=true, rebase=false, delete_branch=true
```

## Stacked PR Compatibility

Squash-only does NOT break the stacked workflow: each layer merges as one
commit; the next layer's branch rebases onto the updated main via
`pr-sync.sh sync`. Verified compatible in OPS-003/004.
