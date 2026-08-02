# CURRENT_ARCHITECTURE — SESSION-001 Phase 10

**Date:** 2026-08-02

---

## The Two-Layer Model (canonical — THINKBOX_SPEC.md)

```
KUDBEE
├── Engineering OS v1.0 (the platform — manages engineering)
│     ├── KILOH (orchestrator)
│     ├── THINK Governance Engine (policy as code)
│     ├── GATE / BUS / JOURNAL
│     ├── Runtime: web + hermes-worker (prod), on-demand monitor/sentinel
│     ├── Data: Neon Postgres (pgvector) + Upstash Redis ×2
│     └── Deployment: Heroku (200 release rollback)
└── THINKBOX (the product — portable engineering workspace)
      └── PR-002 Dependency Resolution (next)
```

## Engineering OS Runtime

```
GitHub Actions (CI) → Heroku (web + hermes Std-1X) → Neon Postgres + Upstash Redis ×2
                                                            │
                    11-layer middleware (fail-open) ← SSE /api/os-stream → Control Tower
```

## Data Flow

```
Client → web (11-layer middleware) → Postgres (durable) + Redis (coordination)
       → SSE → Control Tower panels
Workers: governance (BRPOP 5s + DLQ), hermes (audit), monitor/sentinel (on-demand)
```

## Governance Architecture

```
.kilo/policies/*.json (20 rules, 8 categories)
  → protocol-guard.mjs (4 gates: pre-coding/pre-commit/pre-push/pre-pr)
  → evidence.jsonl (every decision logged)
  → mission-lock.json + objective-lock.json
```

## Key Files

| File | Purpose |
|:---|:---|
| THINKBOX_SPEC.md | product definition |
| THINK_PROTOCOL.md | operating model |
| KILOH_ENGINEERING_STANDARDS.md | TS-first contract |
| ENGINEERING_OS_v1_RELEASE.md | v1.0 release |
| ENGINEERING_OS_BASELINE_v1.md | frozen baseline |
| DISASTER_RECOVERY_RUNBOOK.md | 8 recovery procedures |
| THINKBOX_PR002_IMPLEMENTATION_GUIDE.md | next mission plan |
