# ENGINEERING DASHBOARD SPEC — OPS-002 Workstream I

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** SPECIFICATION ONLY (no implementation)
**Auditor:** KILOH

---

## Purpose

A single morning dashboard KILOH presents to the Chief Architect each session
start. It is the human-visible face of the Engineering OS — one screen with
everything needed to decide what to do next. Backed by live data from
`kiloh-report.mjs`, `pr-sync.sh drift`, GitHub/Heroku APIs, and agent fleet.

## Layout (single screen, priority-ordered)

```
╔══════════════════════════════════════════════════════════════════╗
║  ENGINEERING DASHBOARD — <date>  |  READINESS: 63/100 (FAIR)     ║
╠══════════════════════════════════════════════════════════════════╣
║  HEADER ROW                                                     ║
║  [Mission] [Objective] [Branch] [Drift] [PRs] [Merge-ready]     ║
╠══════════════════════════════════════════════════════════════════╣
║  LEFT: HEALTH TILES               RIGHT: OPERATIONS             ║
║  ┌──────────┬──────────┐         ┌──────────────────────────┐   ║
║  │ Repo     │ Infra    │         │ Open PRs + stack diagram │   ║
║  │ Protocol │ Agents   │         │ Blocked work + reasons   │   ║
║  │ CI       │ Security │         │ Top risks (5)            │   ║
║  │ Deploy   │ Cost     │         │ Recent learnings         │   ║
║  └──────────┴──────────┘         └──────────────────────────┘   ║
╠══════════════════════════════════════════════════════════════════╣
║  BOTTOM: RECOMMENDATIONS                                        ║
║  Current objective: <name>  |  Recommended next: <objective>    ║
║  Stop: <...>  |  Start: <...>  |  Highest leverage: <...>       ║
╚══════════════════════════════════════════════════════════════════╝
```

## Tiles

| Tile | Source | Signal |
|:---|:---|:---|
| Engineering Health Score | `kiloh-report.mjs` | 0–100 + band |
| Repository Health | git (branch, drift, tree, conflicts) | green/yellow/red |
| Infrastructure Health | Heroku API (dynos, addons) + Neon/Upstash | green/red |
| Protocol Health | `protocol-guard status` | PASS/FAIL + gaps |
| Agent Health | `agents.mjs status` | active/idle/failed counts |
| Deployment Health | Heroku releases + last deploy | version + age |
| CI Health | `gh run list` + PR checks | green/failed |
| Cost Health | cost model (dynos + external) | observed + est. |
| Security Health | Dependabot + secret scanning | advisory count |

## Operational Panels

- **Mission status:** active mission (e.g., OPS-002), stage, completion %
- **Current objective:** from `.kilo/objective-lock.json`
- **Recommended next objective:** single recommendation + reason (from report)
- **Blocked work:** items with blockers + owner
- **Top risks:** top 5 (severity/impact/probability/mitigation)
- **Recent learnings:** last N `.kilo/memory/learnings/` + snippets
- **Stack diagram:** open PRs with parent/base/position

## Implementation Notes

- **Not implemented** per mission scope.
- Natural implementation: extend `scripts/kiloh-report.mjs` with a `--dashboard`
  mode producing this layout in the terminal; later a web panel on the
  WORKSPACE tab.
- Data contract: reuse `KILOH_REPORT.md` sections; add tiles = additive.

## Acceptance Criteria (when implemented)

1. Renders in <2s from live data (no manual entry).
2. Readiness score matches `kiloh-report --score`.
3. Every tile has a source command documented.
4. Refreshes on demand (`--refresh`).
5. No secrets rendered — names only.
