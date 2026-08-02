# DEPENDABOT_PR240_ANALYSIS — @vitejs/plugin-react 5.2.0 → 6.0.4

**THINK Governance Engine** | **Date:** 2026-08-02 | **Policy:** dependency.major-requires-assessment (BLOCKED)
**Classification:** `protocol-guard dependabot-classify 240` → **MAJOR** → assessment required

---

## Summary

| Item | Value |
|:---|:---|
| PR | #240 |
| Package | `@vitejs/plugin-react` |
| Bump | 5.2.0 → 6.0.4 (major) |
| Current project | `^5.0.4` |
| **Verdict** | **DO NOT MERGE** — incompatible with current Vite |

## Breaking Change (from 6.0.0 release notes)

> "Vite 8+ can handle React Refresh Transform by Oxc and doesn't need Babel...
> **babel is no longer a dependency** of this plugin and the related features
> are removed."

**Impact:** plugin-react 6.x requires **Vite 8+** and removes Babel-based
transform. The project uses **Vite ^6.2.3** — a full major behind.

## Compatibility Assessment

| Check | Result |
|:---|:---|
| Breaking API? | **YES** — Babel features removed; `react({babel:{...}})` option gone |
| TypeScript changes? | type-only changes (reactCompilerPreset options) — low risk |
| React compatibility? | ✅ works with React 19.2.8 (confirmed in 6.0.4 changelog) |
| **Vite compatibility?** | **❌ REQUIRES VITE 8+ — project has Vite 6.2.3** |
| Build (verify.yml) | PASS (1m14s) — but CI runs `npm ci` which may resolve to plugin 5.2.0 range; the 6.x dependency may not actually be exercised in the build |

## Why CI Passed Despite Incompatibility

`verify.yml` runs `npm ci` against `package.json` with `^5.0.4`. Dependabot's
branch updates the manifest, but the build success may reflect the pinned
lockfile resolving within the 5.x range rather than exercising 6.x. This is
exactly why the **major-requires-assessment policy exists**: CI green ≠ safe.

## Recommended Actions

1. **Do not merge #240.** Close it.
2. **Defer** until Vite is upgraded to 8.x (a separate major-upgrade project).
3. When ready: upgrade Vite first, then plugin-react — in **separate PRs**,
   each with its own compatibility assessment.
4. Optional: add an ignore rule so Dependabot doesn't recreate #240:
   ```
   @dependabot ignore this major version
   ```

## Rollback

N/A — not merged. No production impact.

## Evidence

- Release notes: plugin-react@6.0.0 "Remove Babel Related Features", "Vite 8+"
- Project: `apps/web/package.json` → `vite: ^6.2.3`, `@vitejs/plugin-react: ^5.0.4`
- Policy: `.kilo/policies/dependency.json` → `dependency.major-requires-assessment`
