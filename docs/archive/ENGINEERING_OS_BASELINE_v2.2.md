---
Superseded by: ENGINEERING_STATE.md
Archived: 2026-08-04
Reason: Repository simplification (STAB-004)
---
# ENGINEERING_OS_BASELINE_v2.2

## Current Commit
`21d755d` — docs: add project documentation and workflow guides

## Current Branch
`main` — tracking `origin/main`, up to date, 0 commits ahead, 0 behind

## Current Product Status
- RC0 shipped
- THINKBOX active
- Live Terminal operational
- Control Tower operational
- Knowledge Index operational
- Engineering Graph operational
- WorkspaceViewModel exists
- Mobile-first UI in progress (Founder Mode merged)

## Current CI Status
- Main CI: GREEN
- Kudbee Bounded CI: 45% failure rate (26/66), 10 cancellations
- CodeQL (custom): 122 runs, all success, median 101s
- CodeQL (default): duplicate, should be disabled
- 8 active workflow records, 5 produce runs

## Current Release Status
- Release: RC0
- Alpha: not declared
- Production: auto-deploys from main via Heroku GitHub integration
- Staging: deploys from `staging/*` pushes
- No promotion model; staging and production deploy concurrently

## Current Open PRs
- 0 human-authored open PRs
- 5 Dependabot PRs (#274–#278) — dependency bumps, independent

## Current Architecture Decisions
- One canonical terminal
- One WorkspaceViewModel
- One Engineering Memory model
- One release pipeline
- One CI authority
- One CodeQL authority
- Mobile-first UI
- Truth over simulated success

## Current Known Risks
- Duplicate frontend mock data
- Release promotion: staging and production deploy same SHA concurrently
- Terminal integration incomplete
- Browser secrets stored in localStorage
- Hardcoded passkey in LoginView
- 45% CI failure rate
- Direct pushes to main bypass PR review

## Current Priorities
1. Reduce CI cost
2. Reduce GitHub Actions noise
3. Complete frontend live integration
4. Replace mock data with authoritative state
5. Improve mobile experience
6. Security hardening

## Next Approved Mission
OPS-CI-002 — Lifecycle-Aware CI Triggers (pending approval)
