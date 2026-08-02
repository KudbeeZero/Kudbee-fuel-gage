# THINKBOX_PR002_IMPLEMENTATION_GUIDE — Dependency Resolution Engine

**OPS-006 WS10** | **Date:** 2026-08-02 | **Planning ONLY — no implementation**
**Canonical:** THINKBOX_SPEC.md (product definition)

---

## Objective

Build THINKBOX stage 2: given a detected workspace (PR-001 manifest), **resolve
its dependency graph** — offline, install-free analysis of what the project
depends on, which package managers it uses, and its lockfile state. Output is a
normalized `DependencyManifest` consumed by PR-003 (environment provisioning).

## Architecture

```
services/thinkbox/src/
  deps/
    resolver.ts   — orchestrate per-manager dispatch (single responsibility)
    npm.ts        — package.json + package-lock.json (no install)
    bun.ts        — bun.lock / bun.lockb
    pnpm.ts       — pnpm-lock.yaml
    pip.ts        — requirements.txt / pyproject.toml / poetry.lock
    cargo.ts      — Cargo.toml + Cargo.lock
    go.ts         — go.mod + go.sum
    manifest.ts   — normalized DependencyManifest builder
  index.ts        — CLI: `thinkbox deps <workspaceId>`
  test/deps.test.ts — bun:test fixtures
```

## Module Breakdown

| Module | Responsibility | Depends on |
|:---|:---|:---|
| resolver.ts | detect managers from DetectionResult → dispatch | PR-001 packageManagers |
| npm.ts / bun.ts / pnpm.ts | parse lockfiles, count direct/transitive | node builtins |
| pip.ts / cargo.ts / go.ts | parse language manifests | node builtins |
| manifest.ts | build normalized output | resolver |
| index.ts | CLI entry | resolver + registry |

## Data Flow

```
Workspace (PR-001) → thinkbox deps <id>
  → load DetectionResult (packageManagers, packageCount)
  → resolver dispatches to manager parsers
  → each parser reads manifests/lockfiles (offline)
  → manifest.ts normalizes → DependencyManifest
  → persist to workspace record + BUS event (workspace:deps-resolved)
```

## Dependencies

- **Runtime:** node builtins only (fs, path). No third-party install.
- **Data:** PR-001 workspace registry + DetectionResult.
- **Events:** `workspace:deps-resolved` on BUS + DTHINK feed.

## Events

| Event | Trigger |
|:---|:---|
| `workspace:deps-resolved` | resolution complete (with manifest summary) |
| `workspace:deps-failed` | resolution error (actionable diagnostics) |

## Testing Strategy (bun:test, mirrors PR-001)

| Test | Fixture | Assert |
|:---|:---|:---|
| npm resolution | package.json + package-lock.json | direct + transitive counts |
| bun resolution | bun.lock | manager=bun, lockfile present |
| pnpm resolution | pnpm-lock.yaml | manager=pnpm |
| pip/poetry | pyproject.toml + poetry.lock | manager=poetry |
| cargo | Cargo.toml + Cargo.lock | manager=cargo |
| no lockfile | package.json only | resolutionState=partial |
| determinism | same fixture twice | identical output |
| empty | no manifests | manager=none, count 0 |

## PR Stack

```
THINKBOX stack (base main):
  PR-001 Workspace Detection    MERGED (#235)
  PR-002 Dependency Resolution  ← THIS (position 1)
  PR-003 Environment Provisioning
  PR-004 Code Indexing
  PR-005 Architecture Graph
  PR-006 Engineering Memory
  PR-007 Agent Assignment
  PR-008 Execution
```

## Risk Analysis

| Risk | Likelihood | Mitigation |
|:---|:---|:---|
| Lockfile format drift | medium | parse pinned fields only; fail partial, not crash |
| Large monorepo lockfiles | low | cap parse size, skip node_modules |
| Manager ambiguity (dual lockfiles) | low | priority order: bun → pnpm → yarn → npm |
| No network (install-free) | n/a | fully offline, deterministic — by design |

## Implementation Milestones

| Milestone | Effort | Exit criteria |
|:---|:---|:---|
| M1: resolver + npm/bun/pnpm parsers | S | npm+bun+pnpm resolution pass |
| M2: pip/cargo/go parsers | S | multi-manager pass |
| M3: manifest + CLI + registry wiring | S | `thinkbox deps <id>` works |
| M4: tests + docs | S | 8 tests pass, README updated |

**Estimated effort:** 1 focused workstream, Medium effort, Low risk.

## Success Criteria

1. Any PR-001 workspace resolves its dependencies offline.
2. Deterministic output (same input → same manifest).
3. No dependency installation (non-goal preserved until PR-003).
4. Errors produce actionable diagnostics.
5. 8+ unit tests pass; governance gates green.

## Start Condition

- [ ] Engineering OS v1.0 released (OPS-006) ✅ this mission
- [ ] Approval queue executed (A-1/A-2/A-3, B-1) — or accepted governance warnings
- [ ] Create `feature/thinkbox-pr002` from clean main, declare objective, implement M1→M4
