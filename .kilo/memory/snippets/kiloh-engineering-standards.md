# KILOH Engineering Standards — TypeScript First

## What It Is

The canonical engineering-quality contract for the platform. KILOH enforces it
across all agents, repositories, and workflows. Source of truth:
`KILOH_ENGINEERING_STANDARDS.md` (repo root).

## Core Mandates

1. **TypeScript is canonical** — strict checking, zero errors, no tech debt.
2. **No implicit any; `unknown` for untrusted input** — validate at runtime before trusting types.
3. **Discriminated unions over loose objects** — fully typed public APIs.
4. **Single responsibility, small composable modules** — separate domain from infrastructure.
5. **No dead code, no unauthorized `any`, public interfaces documented** — PR gate.
6. **Fewer, higher-quality dependencies** — evaluate necessity, duplication, risk.
7. **Maintainability over cleverness** — understandable by another engineer/agent 6 months later.
8. **Leave code cleaner than found** — eliminate duplication, improve typing opportunistically.

## Enforcement Points

- **PR requirements**: build, typecheck, lint, tests, no `any`, no dead code,
  docs updated — a failing PR is never merged.
- **Definition of Done**: build + TS zero errors + lint + tests + docs +
  engineering memory + PR ready + quality bar.
- **THINK integration**: each cycle must Think (types/interfaces), Harmonize
  (compiler health), Implement (typed, focused), Navigate (fix type
  regressions immediately), Knowledge (record decisions).

## Provenance

- Established: 2026-08-02 (session ses-1785566092483)
- Trigger: engineering directive from platform owner; adopted as durable artifact
- First applied: services/thinkbox importer cleanup (dead code, ESM require removal)
