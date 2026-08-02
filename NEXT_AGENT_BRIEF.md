# NEXT_AGENT_BRIEF — Session Onboarding Package

**To:** Next cloud agent | **From:** KILOH (SESSION-001) | **Read time:** <5 min

---

## You Are Starting From

- **Engineering OS v1.0 — Certified (90/100), baseline frozen.**
- **No re-discovery needed.** All audits, governance, and infrastructure
  documentation exist and are current.

## The Mission Handed To You

> **THINKBOX PR-002 — Dependency Resolution Engine.**
> Build the second THINKBOX stage: given a detected workspace (PR-001), resolve
> its dependency graph offline (no install). Plan:
> `THINKBOX_PR002_IMPLEMENTATION_GUIDE.md`.

## Do NOT Re-Discover

- Governance (20 policies active, 4 gates) — `protocol-guard status` will tell you
- Infrastructure (2 apps, healthy) — validated this session
- Cost (~$50/mo) — cost guard live
- Agent fleet (11, metadata complete)
- CI (GitHub Actions only — Heroku CI retired)
- The product definition (`THINKBOX_SPEC.md`)

## Known Open Items (handle carefully)

| Item | Status | Action |
|:---|:---|:---|
| PR #245 (OPS-004 docs) | open, conflicts | merge or close as superseded (docs preserved in handoff) |
| Config 4 duplicates | staged | needs B-3 approval before removal |
| Scheduler add-on | provisioned | verify jobs; remove if idle (~$10/mo) |
| ledger-keeper | idle | activate for cost reporting |
| External provider costs | unverified | dashboard-only (Neon/Upstash/Groq/DeepSeek) |

## Immediate Priorities

1. Run `node scripts/session-bootstrap.mjs`
2. Verify `node scripts/protocol-guard.mjs status` → PASS
3. Merge or close PR #245
4. Create `feature/thinkbox-pr002`, declare mission THINKBOX-002
5. Implement per the implementation guide (M1→M4)

## Standing Rules (governance-enforced)

- One objective → one branch → one PR → merge continuously
- Run `pr-sync.sh sync` before any merge
- Major dependency bumps require an assessment (never auto-merge)
- Production changes require human approval
- Run `learning-cycle mission <id>` at mission end
- **No session ends until the next engineer is in a better position**

## First Commands

```bash
node scripts/session-bootstrap.mjs
node scripts/kiloh-report.mjs --dashboard
node scripts/protocol-guard.mjs status
git checkout main && git pull && git checkout -b feature/thinkbox-pr002
node scripts/protocol-guard.mjs mission THINKBOX-002 "Dependency Resolution Engine"
```
