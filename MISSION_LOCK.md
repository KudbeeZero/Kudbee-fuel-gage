# MISSION_LOCK — THINK Governance Engine

**Mission:** OPS-003 Phase B | **Date:** 2026-08-02

## What It Is

Mission Lock is the **single source of truth** for active engineering work.
No implementation proceeds without an active mission. The lock lives at
`.kilo/mission-lock.json` and is managed by the Protocol Guardian.

## Schema v1

```json
{
  "missionId": "OPS-003",
  "name": "Enforcement Closure",
  "objective": "Convert every critical THINK Protocol rule into executable enforcement",
  "featureBranch": "feature/think-governance-engine",
  "expectedPr": 0,
  "stackPosition": 0,
  "owner": "KILOH",
  "state": "active | completed",
  "startedAt": "...",
  "completedAt": null,
  "authority": "Engineering Governance",
  "priority": "P0",
  "missionLockVersion": 1
}
```

## Commands

```bash
node scripts/protocol-guard.mjs mission <id> <objective> [pr]   # activate
node scripts/protocol-guard.mjs mission-clear                    # complete
node scripts/protocol-guard.mjs status                           # verify
```

## Enforced Policies (`.kilo/policies/mission.json`)

| Policy | Severity | Effect |
|:---|:---|:---|
| mission.active | blocking | no commits without an active mission |
| mission.matches-branch | blocking | mission branch must equal current branch |
| mission.objective-lock | blocking | objective lock must exist |

## Lifecycle

1. KILOH declares mission: `mission OPS-003 "..."` → lock active.
2. Feature branch created from main.
3. Objective declared on that branch: `objective <id> [pr]`.
4. Guardian gates (pre-coding/pre-commit/pre-push/pre-pr) enforce all three.
5. On completion: `mission-clear` → state=completed, learning recorded.

## Evidence

Every gate evaluation appends to `.kilo/memory/guardian/evidence.jsonl`.

## Provenance

- Established: OPS-003, 2026-08-02
- Verified: pre-commit gate blocked on main, passed on feature branch with
  matching mission+objective.
