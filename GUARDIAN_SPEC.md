# GUARDIAN_SPEC — THINK Governance Engine

**Mission:** OPS-003 Phase C | **Date:** 2026-08-02 | **Auditor:** KILOH

---

## Purpose

The Protocol Guardian is the enforcement subsystem of the THINK Governance
Engine. It evaluates machine-readable policies (`.kilo/policies/*.json`),
blocks unsafe operations, and emits evidence for every decision. It never
writes business logic — it enforces governance.

## Execution Gates

The Guardian runs at four gates:

| Gate | When | Verifies |
|:---|:---|:---|
| `pre-coding` | session start / `session-start` | mission active, branch correct, tree clean, objective exists |
| `pre-commit` | before commit | branch matches mission, objective valid, no runtime memory, no unrelated files |
| `pre-push` | before push | drift, rebase, tests, TypeScript, lint, protocol compliance |
| `pre-pr` | before PR open | stack integrity, docs updated, memory updated, DoD complete |

## Commands

```
protocol-guard mission <id> <objective> [pr]   declare/activate mission lock
protocol-guard mission-clear                    end mission, record learning
protocol-guard objective <id> [pr]              declare objective lock
protocol-guard guard                            pre-commit gate (policy-evaluated)
protocol-guard pre-coding                       gate 1
protocol-guard pre-commit                       gate 2
protocol-guard pre-push                         gate 3
protocol-guard pre-pr                           gate 4
protocol-guard status                           full compliance snapshot (policy-driven)
protocol-guard recover                          move feature commits off main
protocol-guard evidence                         tail evidence log
```

## Evidence

Every evaluation appends to `.kilo/memory/guardian/evidence.jsonl`:

```json
{"id":"ev-...","timestamp":"...","policyId":"branch.main-protected",
 "gate":"pre-commit","result":"pass|fail|warn","context":{...},"message":"..."}
```

## Policy Loading

- Loads all `.kilo/policies/*.json` at start.
- Groups by category.
- Applies the relevant categories per gate:
  - pre-coding: mission, branch
  - pre-commit: mission, branch, memory, commit
  - pre-push: mission, branch, merge
  - pre-pr: merge, memory, agent
- A `blocking` severity policy that fails → gate returns exit 1 (reject).
- A `warn` failure → exit 0 with warning.

## Data Sources (evaluation context)

| Context key | Source |
|:---|:---|
| branch | `git branch --show-current` |
| drift | `git rev-list --count origin/main..HEAD` |
| tree | `git status --porcelain` |
| mission | `.kilo/mission-lock.json` |
| objective | `.kilo/objective-lock.json` |
| staged files | `git diff --cached --name-only` |
| CI | `gh pr checks` (pre-push/pre-pr) |

## Provenance

- Established: OPS-003, 2026-08-02
- Renamed from "Protocol Guardian" → part of **THINK Governance Engine**
