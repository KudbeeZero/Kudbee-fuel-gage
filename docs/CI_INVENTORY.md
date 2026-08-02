# CI_INVENTORY.md

## Active Workflow Records (8 total)

| # | Workflow Name | Source | Status |
|---:|---|---|---|
| 1 | Kudbee Bounded CI | Local YAML | Active |
| 2 | CodeQL | Local YAML | Active |
| 3 | Deploy to Heroku Staging | Remote YAML | Active |
| 4 | Session Logger | Remote YAML | Active |
| 5 | Copilot | Dynamic | Active |
| 6 | Copilot cloud agent | Dynamic | Active |
| 7 | Dependabot Updates | Dynamic | Active |
| 8 | CodeQL | Dynamic (default) | Active |

## Local Files
- `.github/workflows/verify.yml` (69 lines)
- `.github/workflows/codeql.yml` (38 lines)

## Run Summary (last 200 runs, ~79 hours)

| Workflow | Runs | Success | Failure | Cancelled | Median |
|---:|---:|---:|---:|---:|---:|
| Kudbee Bounded CI | 66 | 30 | 26 | 10 | 75s |
| CodeQL (custom) | 122 | 122 | 0 | 0 | 101s |
| Copilot | 3 | 3 | 0 | 0 | 327s |
| Copilot cloud agent | 7 | 7 | 0 | 0 | 115s |
| Dependabot Updates | 2 | 2 | 0 | 0 | 188s |

## Observations
- Only 5 workflows produce runs; 3 are orphaned.
- Kudbee Bounded CI: 45% failure rate, 10 cancellations.
- CodeQL: 122 runs, all success, duplicates GitHub default setup.
- Deploy to Heroku Staging: 17 runs, all failure.
