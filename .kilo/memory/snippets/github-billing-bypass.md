# GitHub Billing Bypass

## Current condition

As of 2026-07-31, GitHub Actions is blocked by a GitHub billing/account issue.
Workflow failures from GitHub should not be treated as application failures
while this condition remains unresolved.

## Temporary operating decision

- GitHub Actions CI is bypassed temporarily.
- GitHub remains the source-control and pull-request host.
- Self-hosted verification is authoritative:
  - `node scripts/ci-self-hosted.mjs`
  - `npm run phase:ops-audit`
  - `npm run phase:readiness`
  - `node scripts/verify-e2e.mjs`
  - `node scripts/verify-system-integrity.mjs`
  - `node scripts/verify-agents.mjs`
  - `node scripts/verify-drift.mjs`
  - `npm run verify:browser-matrix`
- Draft PRs may proceed with explicit local evidence and human review.
- Production promotion still requires staging and release verification.
- A billing-blocked PR must not be force-merged or administratively bypassed.
- Merge requires a non-draft PR, approved review, passing authoritative
  self-hosted checks, and explicit human authorization.

## PR sizing precedent

- Prefer one focused change per PR, normally 1-10 commits.
- Treat more than 15 commits or more than 1,000 changed lines as a split
  candidate unless the work is intrinsically atomic.
- Split by independently verifiable concern rather than by arbitrary commit
  count.
- Do not create an empty follow-up PR; create the next PR only for a bounded,
  independently tested change.

## Reinstatement trigger

When the GitHub billing issue is resolved, re-evaluate GitHub Actions before
restoring any workflow files. Compare its results against the self-hosted
verification contract and require one successful non-production run before
making it an authoritative or required check.
