# NEXT AGENT — READ THIS FIRST

## Current Baseline
- Engineering OS v2.2, RC0 shipped
- Main branch: GREEN, commit `21d755d`
- 0 open feature PRs, 5 Dependabot PRs
- 8 active GitHub workflow records (5 produce runs)

## Current Branch
`main` — tracking `origin/main`, clean working tree

## Current Release
RC0 — staging/production deploy concurrently from main

## Current CI
- Kudbee Bounded CI: 45% failure rate, 10 cancellations
- CodeQL (custom): 122 runs, all success, median 101s
- CodeQL (default): duplicate, should be disabled
- 3 orphaned workflows

## Current Mission
OPS-CI-002 — Lifecycle-Aware CI Triggers (pending approval)

## Current Blockers
- None blocking implementation

## Current Priorities
1. Reduce CI cost
2. Reduce GitHub Actions noise
3. Complete frontend live integration
4. Replace mock data with authoritative state
5. Improve mobile experience
6. Security hardening

## Rules
- Do NOT redesign architecture
- Do NOT audit (unless specifically asked)
- Do NOT generate documentation
- Do ONE mission
- Open ONE PR
- Stop

## Authoritative Sources
- `ENGINEERING_OS_BASELINE_v2.2.md` — canonical baseline
- `engineering_state.yaml` — single source of truth
- `REPOSITORY_MANIFEST.json` — repository map
- `MODEL_CONTRACT.md` — model responsibilities

## First Thing to Verify
Git state: `git branch --show-current`, `git status --short`, `git log --oneline -3`
