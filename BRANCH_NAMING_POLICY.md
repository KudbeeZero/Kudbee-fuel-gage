# Branch Naming Policy — THINK Governance Engine

**Mission:** OPS-003 Phase A | **Date:** 2026-08-02

## Allowed Prefixes

| Prefix | Purpose |
|:---|:---|
| `feature/` | new capability (one objective per branch) |
| `fix/` | bug fix |
| `chore/` | maintenance, tooling, memory |
| `docs/` | documentation only |
| `refactor/` | behavior-preserving restructuring |

## Forbidden

- Direct feature work on `main` (Rule 1 — main is protected).
- Branches without a prefix (e.g., `stuff-i-did`).
- Objective-lock branches that don't match the current branch.

## Enforcement

Enforced by the THINK Governance Engine policy `branch.naming`
(`.kilo/policies/branch.json`): warn severity. Commits on `main` are
blocked by `branch.main-protected` (blocking severity).

## Naming Template

```
<prefix>/<objective-short-name>
```

Example: `feature/think-governance-engine`, `chore/agent-metadata`,
`fix/hermes-worker-module`.
