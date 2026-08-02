# THINKBOX PR-002 — Dependency Resolution Engine (Implementation Plan)

**OPS-005 Transition Review** | **Date:** 2026-08-02 | **Planning ONLY — no implementation**
**Status:** RECOMMENDED to begin after approval queue executes (or with noted governance warnings)

---

## Objective

Build the second THINKBOX stage: given a detected workspace (PR-001 manifest),
**resolve its dependency graph** — install-free analysis of what the project
depends on, its package managers, and lockfile state. Output is a machine-
readable dependency manifest consumed by PR-003 (environment provisioning).

## Architecture

```
services/thinkbox/src/
  deps/
    resolver.ts      — orchestrates per-manager resolution (single responsibility)
    npm.ts           — npm/pnpm/yarn via package.json + lockfile parsing (no install)
    bun.ts           — bun.lock/bun.lockb parsing
    pip.ts           — requirements.txt / pyproject.toml / poetry.lock
    cargo.ts         — Cargo.toml + Cargo.lock
    go.ts            — go.mod + go.sum
    registry.ts      — durable dependency manifest records (extends workspace registry)
  index.ts           — CLI: `thinkbox deps <workspaceId>`
```

## Required Modules

| Module | Purpose | Depends on |
|:---|:---|:---|
| `resolver.ts` | detect managers → dispatch to parsers | PR-001 DetectionResult.packageManagers |
| `npm.ts` | parse package.json + lockfiles, count direct/transitive | node builtins only |
| `bun.ts` | parse bun.lock | node builtins |
| `pip.ts` | parse requirements/pyproject/poetry | node builtins |
| `cargo.ts`/`go.ts` | parse Cargo/go manifests | node builtins |
| `registry.ts` | persist dependency records | workspace registry |
| CLI | `thinkbox deps <id>` | all above |

## Key Design Decisions

1. **No dependency installation** — parse manifests/lockfiles only (aligns with
   PR-001 non-goals; PR-003 handles provisioning).
2. **Deterministic** — same workspace → same dependency manifest (unit-tested).
3. **Manager-agnostic output** — normalized `DependencyManifest` interface:
   `{ manager, lockfile, direct[], transitiveCount, totalCount, sourcePath }`.
4. **Extensible** — new language = new parser module + resolver dispatch entry.

## DependencyManifest (normalized contract)

```ts
interface DependencyManifest {
  workspaceId: string;
  manager: 'npm'|'bun'|'pnpm'|'yarn'|'pip'|'poetry'|'cargo'|'go';
  lockfilePresent: boolean;
  lockfilePath: string | null;
  directDependencies: Array<{ name: string; version: string | null }>;
  transitiveCount: number;
  totalCount: number;
  resolutionState: 'complete'|'partial'|'none';
  confidence: number;
}
```

## Tests (bun:test, mirroring PR-001 detection.test.ts)

| Test | Fixture | Assert |
|:---|:---|:---|
| npm resolution | package.json + package-lock.json | direct + transitive counts |
| bun resolution | bun.lock | manager=bun, lockfile present |
| pip resolution | pyproject.toml + poetry.lock | manager=poetry |
| cargo resolution | Cargo.toml + Cargo.lock | manager=cargo |
| no lockfile | package.json only | resolutionState=partial |
| determinism | same fixture twice | identical output |
| empty project | no manifests | manager=none, count 0 |

## Risks

| Risk | Mitigation |
|:---|:---|
| Lockfile format drift | parse version-pinned fields only; fail `partial` not crash |
| Large monorepo lockfiles | cap parse size, skip node_modules |
| Manager detection ambiguity (dual lockfiles) | prefer lockfile order: bun → pnpm → yarn → npm |
| No install = no network | fully offline, deterministic |

## PR Stack Position

```
THINKBOX stack (base main):
  PR-001 Workspace Detection      MERGED (#235)
  PR-002 Dependency Resolution    ← THIS (stack position 1)
  PR-003 Environment Provisioning
  PR-004 Code Indexing
  ...
```

## Milestones

| Milestone | Effort | Exit criteria |
|:---|:---|:---|
| M1: resolver + npm/bun parsers | S | npm+bun resolution pass |
| M2: pip/cargo/go parsers | S | multi-manager pass |
| M3: registry + CLI | S | `thinkbox deps <id>` works |
| M4: tests + docs | S | 7 tests pass, README updated |

**Estimated total: 1 focused workstream (Medium effort, Low risk).**

## Recommended Start Condition

- [ ] Approval queue A-1/A-2 executed (branch protection + squash-only) — or accept governance-warnings
- [ ] A-3 Heroku CI disabled (escalated — orphan apps at 29 and growing)
- [ ] A-4 config dedupe approved
- [ ] Then: create `feature/thinkbox-pr002` from clean main, declare objective, implement M1→M4
