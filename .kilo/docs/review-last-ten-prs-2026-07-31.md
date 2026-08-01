# Last Ten PR Review

## Scope

Reviewed merged PRs #219 through #228 using GitHub metadata, merge history,
current source, and cached DTHINK/agent findings. No PR was treated as verified
solely because it was merged.

## High Findings

- PR #221: terminal execution routes lack an explicit agent authorization gate.
- PR #221: swarm and shield status responses contain hard-coded operational data.
- PR #224: scheduler arguments are passed as part of one script filename.
- PR #225: Redis REST fallback does not encode command arguments.
- PR #223: workspace Redis failures can be interpreted as empty state.
- Gastown: prompt text was interpolated into shell commands.
- Gastown: Safe-Zone was bootstrapped but not enforced before execution.
- Gastown: THINK recall used `result.tokens` instead of `result.results`.
- Gastown: successful outcomes could be minted directly as `VERIFIED`.
- Gastown: convoy merge accepted invalid lifecycle states.

## Corrections Applied In This Review

- Imported Zod schemas as type-only values, fixing the Think Loop startup crash.
- Used `result.results` for Gastown THINK recall.
- Replaced Gastown DTHINK shell interpolation with argument-safe execution.
- Made Gastown strict Safe-Zone bootstrap/evaluation a dispatch gate.
- Forced Gastown outcomes to `PENDING_APPROVAL`.
- Added convoy lifecycle validation and an explicit `startConvoy()` transition.
- Corrected Gastown documentation so it does not claim durable audit persistence
  that is not implemented.

## Remaining Release Blockers

- Gastown durable convoy persistence, leases, and restart recovery.
- Route-level authorization for Gastown dashboard and convoy endpoints.
- Prompt/secret redaction before DTHINK and THINK persistence.
- Worker timeouts and worker-crash isolation.
- Redis REST argument encoding tests.
- Public staging browser evidence from Box/Playwright.
- Production dependency findings: 1 critical and 14 high.

## External Pattern Review

Lemonade patterns worth adapting: resumable workspace state, attention-aware
agent status, mobile streaming history, and thin runtime adapters.

Crush patterns worth adapting: reconnectable session streams, project-scoped
configuration, explicit tool permissions, LSP-bounded context, local logs, and
privacy-preserving operational metrics.

Reject: global dangerous mode and uncoordinated parallel edits in one worktree.

## Evidence Rule

Every future PR promotion requires code evidence, focused tests, deployment
evidence, and a DTHINK trace. A merged PR is history, not proof of correctness.
