# AGENT ARCHITECTURE — OPS-002 Workstream H

**Mission:** OPS-002 Engineering OS Hardening
**Date:** 2026-08-02 | **Mode:** READ-ONLY | **Auditor:** KILOH

---

## Executive Summary

The platform defines **7 architectural agents** (KILOH, DTHINK, FORGE, BUS,
GATE, JOURNAL, THINKBOX) and runs **11 terminal agents** (3 with active roles,
8 idle without category metadata). The architectural agents are conceptual
roles (some mapped to scripts); the terminal agents are executable `.agent`
definitions. The concept layer is rich but the mapping to executable artifacts
is uneven — several named roles (FORGE, GATE, JOURNAL) are not distinct
services yet.

## 1. Architectural Agents

| Agent | Mission | Inputs | Outputs | Implements |
|:---|:---|:---|:---|:---|
| KILOH | Orchestrate engineering | objectives, repo state | plans, branches, PRs, audits | orchestrator (this session) |
| DTHINK | Distributed reasoning | events, decisions | `dthink/stream.jsonl` entries | `scripts/dthink-pipeline.mjs` ✅ |
| FORGE | Implementation | task packets | code changes | conceptual (delegated to agents) — no dedicated service |
| BUS | Event transport | publish calls | serial bus events | `scripts/serial-bus.mjs` ✅ |
| GATE | Verification | code, PR | pass/fail evidence | `verify.yml` + `verify-gates.mjs` ✅ (partial) |
| JOURNAL | Durable knowledge | decisions/learnings | committed records | `.kilo/memory/*` + learning-cycle ✅ |
| THINKBOX | Workspace lifecycle | sources | workspace + manifest + events | `services/thinkbox/*` ✅ (PR-001) |

## 2. Terminal Agents (11)

| Agent | Category | Schedule | Actions | Status |
|:---|:---|:---|:---|:---|
| ci-watcher | verification | on-deploy | 37 | ACTIVE |
| knowledge-curator | memory | daily | 23 | ACTIVE |
| pipeline-guardian | middleware | on-demand | 23 | ACTIVE |
| gastown | general | on-demand | 11 | IDLE |
| gateway-router | general | manual | 0 | IDLE |
| hermes | general | manual | 0 | IDLE |
| ledger-keeper | general | manual | 0 | IDLE (recommend activating for cost) |
| monitor | general | manual | 0 | IDLE |
| sentinel | general | manual | 0 | IDLE |
| token-forge | general | manual | 0 | IDLE |
| web-doctor | general | manual | 0 | IDLE |

**Finding H-1:** 8/11 agents lack `category` in company-manifest (default "general").

## 3. Tool Mappings

| Capability | Tool |
|:---|:---|
| Protocol enforcement | `scripts/protocol-guard.mjs` |
| PR workflow | `scripts/pr-sync.sh` |
| Learning cycle | `scripts/learning-cycle.mjs` |
| Status report | `scripts/kiloh-report.mjs` |
| Workspace detection | `services/thinkbox/` (CLI: detect/list) |
| Event bus | `scripts/serial-bus.mjs` |
| Fleet mgmt | `scripts/agents.mjs` |
| DTHINK | `scripts/dthink-pipeline.mjs` |

## 4. Agent Health & Lifecycle

- **Lifecycle:** defined in `.kilo/agents/*.agent`, registered at bootstrap, renewed on Redis (72h TTL).
- **Health:** 11/11 discovered; 3 active with decision logs; 8 idle.
- **Memory:** per-agent `LEARNINGS.json` (ci-watcher 7, pipeline-guardian 3, knowledge-curator 1) + shared decisions/snippets.

## 5. Findings

| # | Severity | Finding |
|:--|:---|:---|
| H-1 | MEDIUM | 8 agents lack category metadata |
| H-2 | MEDIUM | FORGE/GATE/JOURNAL are conceptual — not distinct executable services (GATE maps to verify.yml; JOURNAL to memory scripts) |
| H-3 | LOW | ledger-keeper idle despite defined cost-tracking role |
| H-4 | LOW | agent memory profiles thin (recall history "none" in skills) |

## 6. Recommendations

| # | Action | Classification |
|:---|:---|:---|
| H-1 | Complete company-manifest categories for 8 agents | Safe |
| H-2 | Decide FORGE/GATE/JOURNAL boundaries; document as role-mappings (not new services) to avoid over-engineering | Safe (design) |
| H-3 | Activate ledger-keeper for monthly cost reporting | Safe (on-demand) |
| H-4 | Seed agent LEARNINGS with this session's traces | Safe |
