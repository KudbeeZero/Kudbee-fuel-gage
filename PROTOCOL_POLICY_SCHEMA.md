# PROTOCOL POLICY SCHEMA — OPS-003 Phase J

**THINK Governance Engine — Policy as Code**
**Date:** 2026-08-02 | **Mission:** OPS-003 | **Auditor:** KILOH

---

## Purpose

The THINK Protocol no longer exists solely as Markdown. Every enforceable rule
is represented as machine-readable policy that the Protocol Guardian evaluates
directly — no hard-coded behavior. The Guardian reads policies, evaluates
conditions, and produces evidence (what checked, what passed, what failed, why).

## Policy Model

A policy is a JSON document with a stable schema. The Guardian loads all
policies from `.kilo/policies/` at startup and evaluates them by category.

## Schema v1

```json
{
  "schemaVersion": 1,
  "policyId": "branch.main-protected",
  "category": "branch",
  "name": "Main is Protected",
  "severity": "blocking",
  "description": "No feature work is committed directly to main.",
  "scope": ["git", "pre-commit", "pre-push", "ci"],
  "conditions": [
    {
      "id": "not-on-main",
      "when": { "branch": "main" },
      "then": "block",
      "message": "Feature work on main is forbidden (Rule 1)."
    }
  ],
  "recovery": {
    "command": "protocol-guard recover",
    "instructions": "Move feature commits to a feature branch and reset main."
  },
  "evidence": "protocol-guard status shows branch, drift, and compliance.",
  "enforcedSince": "2026-08-02"
}
```

## Policy Categories

| Category | Applies to | Example policies |
|:---|:---|:---|
| `branch` | git operations | main protected, branch naming, one-objective-per-branch |
| `mission` | session lifecycle | mission required, mission matches branch, objective lock valid |
| `memory` | commits | runtime memory excluded, durable knowledge committed |
| `merge` | PR lifecycle | one PR per branch, stack integrity, squash only |
| `agent` | fleet | every agent has metadata, no anonymous agents |
| `deployment` | environments | prod requires approval, staging auto, review automatic |
| `commit` | git | message policy, no unrelated files |

## Condition Grammar

A condition has:
- `when` — a predicate over the evaluation context (branch, files, mission, drift, CI).
- `then` — action: `block` | `warn` | `allow`.
- `message` — human-readable explanation for the evidence log.

Predicates supported in v1:
- `{ "branch": "main" }` — current branch equals value
- `{ "branchMatch": "feature/*" }` — branch matches pattern
- `{ "missionActive": true }` — mission lock exists and is active
- `{ "objectiveExists": true }` — objective lock valid
- `{ "runtimeMemoryInChangeset": true }` — staged files include gitignored runtime paths
- `{ "driftAbove": 0 }` — commits ahead of main exceed N
- `{ "ciGreen": true }` — required CI checks pass

## Guardian Evaluation Contract

The Guardian (`protocol-guard.mjs`) evaluates policies via:

```
status   → load all policies, evaluate each, emit evidence table
guard    → evaluate blocking policies (branch, mission, memory)
pre-push → evaluate drift/rebase/tests policies
pre-pr   → evaluate stack/docs/memory/DoD policies
```

Output is always a structured evidence record appended to
`.kilo/memory/guardian/evidence.jsonl`:

```json
{
  "id": "ev-...",
  "timestamp": "...",
  "policyId": "branch.main-protected",
  "action": "block",
  "result": "fail",
  "context": { "branch": "main", "files": ["apps/web/x.ts"] },
  "message": "Feature work on main is forbidden."
}
```

## Policy Files

`.kilo/policies/` (new directory, committed):

| File | Policies |
|:---|:---|
| `branch.json` | main-protected, branch-naming, one-branch-per-objective |
| `mission.json` | mission-active, mission-matches-branch, objective-lock-valid |
| `memory.json` | runtime-memory-excluded, durable-knowledge-committed |
| `merge.json` | one-pr-per-branch, stack-integrity, squash-only |
| `agent.json` | metadata-complete, no-anonymous-agents |
| `deployment.json` | prod-approval, staging-auto, review-automatic |
| `commit.json` | message-policy, no-unrelated-files |

## Definition of Done (Phase J)

1. Schema documented (this file). ✅
2. `.kilo/policies/*.json` committed with all 7 categories.
3. Guardian loads + evaluates policies (not hard-coded strings).
4. Evidence written to `.kilo/memory/guardian/evidence.jsonl`.
5. `protocol-guard status` shows per-policy results.

## Provenance

- Established: OPS-003, 2026-08-02
- Replaces: THINK_PROTOCOL.md Enforcement section (which remains as the human-readable spec)
