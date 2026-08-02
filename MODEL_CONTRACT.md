# MODEL CONTRACT

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
