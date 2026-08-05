# MODEL CONTRACT

## Keystone Trust Boundary (SEC-001 / INV-013)

Governance files may NEVER be modified by an executing cloud agent.

### Ownership Table

| Artifact | Owner | Editable by |
|:---|:---|:---|
| `AGENTS.md` | Human | NO AGENT |
| `MODEL_CONTRACT.md` | Human | NO AGENT |
| `engineering_state.yaml` | Human | NO AGENT |
| `REPOSITORY_MANIFEST.json` | Human | NO AGENT |
| `kilo.json` | Human | NO AGENT |
| `scripts/repository-guardian.mjs` | Human | NO AGENT |
| `services/lib/governanceKeystone.ts` | Human | NO AGENT |
| `services/lib/bearerAuthMiddleware.ts` | Human | NO AGENT |
| `scripts/verify-secret-hygiene.mjs` | Human | NO AGENT |
| `scripts/verify-quick.mjs` | Human | NO AGENT |
| `.github/workflows/verify.yml` | Human | NO AGENT |
| `.github/workflows/codeql.yml` | Human | NO AGENT |

The canonical list lives in `services/lib/governanceKeystone.ts` — this table
is documentation; the module is the source of truth. Any agent write to a
listed path must be refused. `npm run guardian` verifies the keystone is
intact and enforceable.

## Knowledge Governance (INT-040)

Every durable knowledge object (THINK Token, Benchmark, Decision, Skill,
Bootstrap, Forge Optimization) must have a complete lifecycle.

### Lifecycle States (only these)

```
DRAFT → VERIFIED → ACTIVE → STALE → SUPERSEDED → ARCHIVED
```

### Knowledge Rules

Every knowledge object must answer:

- **Who owns me?** — `owner` field, non-empty.
- **Why do I exist?** — `evidence` or `references` field.
- **What supports me?** — linked benchmarks/decisions in `references`.
- **When was I last verified?** — `verified` date.
- **When should I be reviewed again?** — `review_after` (auto-computed).
- **What supersedes me?** — `superseded_by` / `supersedes` fields.

### Governance Rules

- No knowledge object is ever deleted — retirement is a state change.
- No two objects may share an ID.
- ACTIVE knowledge past its `review_after` date is a governance violation.
- SUPERSEDED knowledge must not remain ACTIVE.
- Every benchmark draft must have a lifecycle record (no orphans).
- `npm run knowledge:audit` must return PASS before merge.

### Lifecycle Engine

```bash
node scripts/knowledge-lifecycle.mjs register <type> <id> --owner <owner>
node scripts/knowledge-lifecycle.mjs transition <id> <state>
node scripts/knowledge-audit.mjs          # or npm run knowledge:audit
```

## GPT-5.6 — Principal Engineer
**Role:** Architecture, planning, prioritization, review  
**Allowed:** Architecture decisions, planning, prioritization, review, audits  
**Forbidden:** Large implementations, bulk code generation, Copilot-style PR creation  
**Output:** Decisions, recommendations, mission definitions, verification plans

## Copilot — Implementation
**Role:** Implementation  
**Allowed:** Small PRs, refactoring, tests, bug fixes  
**Forbidden:** Architecture changes, new engines, new dashboards, new tabs  
**Output:** Code changes, PRs, test updates

## KILOH — Repository Steward
**Role:** Release manager, CI, GitHub, security  
**Allowed:** CI optimization, GitHub workflow management, release engineering, security hardening, deployment  
**Forbidden:** Architecture expansion, feature implementation, frontend redesign  
**Output:** CI changes, deployment actions, security fixes, release tags

## Free Model — Verification
**Role:** Verification, review, documentation, small audits  
**Allowed:** Verification, review, documentation, small audits, impact analysis  
**Forbidden:** Large implementations, architecture changes, bulk code generation  
**Output:** Verification reports, audit findings, documentation, impact analysis

## Ownership Rules

- No two models may own the same responsibility simultaneously.
- Principal Engineer defines the mission; Free Model verifies safety; KILOH executes CI/release; Copilot implements.
- If a model is asked to perform a forbidden action, it must refuse and propose the correct owner.
- All changes must be traceable to one model's responsibility.

## Conflict Resolution

- If Principal Engineer and Free Model disagree on risk, escalate to human.
- If KILOH and Copilot disagree on implementation approach, Principal Engineer decides.
- If Free Model identifies a P0 security issue, KILOH must act immediately.
