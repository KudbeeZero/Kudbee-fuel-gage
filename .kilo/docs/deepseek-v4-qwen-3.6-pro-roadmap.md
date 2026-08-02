# DeepSeek V4 and Qwen 3.6 Pro Execution Roadmap

## Purpose

This is the executable next-phase plan for KUDBEE. It converts the app review
into model-scoped tasks, shared safety rules, and repeatable readiness gates.

Model names are treated as configured roles. Their capabilities must be proven
by repository evaluation; no model receives production authority by name alone.

## Governance For Weaker Models

The workflow is intentionally structured so a weaker model cannot silently
skip a release obligation. `config/phase/next/governance-policy.json` defines
nine layers: intent, preconditions, authority, isolation, execution, evidence,
review, handoff, and memory. `config/phase/next/sop-manifest.json` maps product,
frontend, mobile, backend, security, data, agents, quality, operations,
knowledge, and human review departments to owners and required procedures.

Run `node scripts/phase-governor.mjs check <model> <task-id>` before editing and
`node scripts/phase-governor.mjs report <report.json>` before handoff. Run
`npm run phase:ops-audit` to audit the PR workflow, CI/deployment pipelines,
agent registry, memory paths, and DTHINK command safety.

## Phase Order

### Phase 0: Contract

- DeepSeek V4 owns backend security and durability design.
- Qwen 3.6 Pro owns frontend product behavior and browser verification.
- Each task uses a dedicated worktree.
- Human approval is required for authentication, tenant, data, and deployment changes.
- Completion reports must include files, tests, risks, evidence, and rollback steps.

### Phase 1: Security Boundary

DeepSeek tasks: `DS-01`, `DS-02`.

Qwen task: `QW-01`.

Release blockers:

- No browser-only authentication.
- No provider secrets in browser storage.
- No caller-controlled tenant authorization.
- No production fallback secret.
- Sensitive routes require a verified principal and capability.

### Phase 2: Durable Data And Workers

DeepSeek task: `DS-03`.

Required behavior:

- Writes report `durable`, `queued`, `ephemeral`, or `rejected`.
- Production writes do not silently disappear into process memory.
- Worker claims use leases or consumer groups.
- Retries are idempotent.
- Crashed tasks recover.
- DLQ operations are atomic and audited.

### Phase 3: Backend Decomposition

DeepSeek tasks: `DS-04`, `DS-05`.

- One owner per route.
- `server.js` becomes composition and lifecycle code.
- Audit state is durable and tenant-scoped.
- Route manifest detects duplicate method/path registrations.

### Phase 4: Operator Product

Qwen tasks: `QW-02`, `QW-03`, `QW-04`.

- Overview is task-oriented: detect, inspect, decide, verify.
- Freshness, durability, tenant, release, and permission state are visible.
- Privileged actions show impact, require confirmation, and return receipts.
- Panel failures report traceable error telemetry.

### Phase 5: Mobile Companion

Qwen task: `QW-05`.

- Live data replaces hard-coded cards.
- Governance and settings are real workflows.
- Dangerous commands require admin capability and confirmation.
- Offline work is visibly queued or failed, never falsely complete.

### Phase 6: Lemonade-Inspired Workspace

Qwen task: `QW-06`.

The first UI slice is now implemented in `apps/web/src/pages/workspace.tsx` and
`apps/mobile/app/workspace.tsx`. It provides:

- Resumable local-first sessions.
- Agent status and ownership.
- A focused attention queue.
- Context composer with explicit continuation.
- Recent movement and command visibility.
- Responsive web and mobile entry points.

The browser matrix explicitly covers Chrome, Firefox, and Safari desktop;
Chrome iOS and Safari iOS shells; Chrome Android and Firefox Android mobile
viewports. Chrome iOS is tested on WebKit because Apple requires all iOS
browsers to use the WebKit engine.

The next slice must replace local demo state with authenticated server-backed
workspace records. It must preserve explicit freshness and durability labels,
support reconnect and offline recovery, and keep destructive agent actions out
of the default workspace composer.

## Scripts

### Task generation

```bash
node scripts/model-task-packet.mjs deepseek-v4 DS-01
node scripts/model-task-packet.mjs qwen-3.6-pro QW-01
```

### Local readiness

```bash
npm run phase:readiness
```

Runs manifest validation, task-packet resolution, diff hygiene, typecheck,
quick gates, and system integrity.

### Full readiness

```bash
npm run phase:readiness:full
```

Also runs E2E, agent, drift, resilience, THINK, governance, and browser
verification. Missing local Redis, Playwright, Box credentials, or staging
credentials are reported as warnings; real test failures remain failures.

### Individual verification scripts

```bash
npm run verify:agent-contracts
npm run verify:integrations
npm run verify:learning-protocol
npm run typecheck
bun test
node scripts/verify-system-integrity.mjs
node scripts/verify-e2e.mjs --smoke
node scripts/verify-agents.mjs
node scripts/verify-drift.mjs
node scripts/verify-resilience.mjs
node scripts/verify-think-loop.mjs
node scripts/verify-governance-loop.mjs
node scripts/browser-verifier.mjs
```

Company-agent and integration contracts are phase gates, not advisory
documentation. The default CI watcher and E2E path run bounded smoke with
Neon/Redis provider URLs disabled. Full database-writing E2E requires the
explicit `E2E_ALLOW_DATABASE_WRITES=1` opt-in; missing Box or Neon admin/API
capabilities are reported as optional skips by name only.

Supporting evidence and diagnostics remain available through:

```bash
node scripts/session-bootstrap.mjs
node scripts/system-status.mjs check
node scripts/dthink-pipeline.mjs stats
node scripts/snippet-agent.mjs health
node scripts/serial-bus.mjs history 5
node scripts/phone-tree.mjs tree
node scripts/agents.mjs status
```

## Completion Report

Every model task must report:

1. Task ID and model role.
2. Changed files.
3. API/data/security behavior changed.
4. Commands executed and pass/fail output.
5. Environment-gated checks.
6. Known risks and unresolved assumptions.
7. Rollback procedure.
8. Whether human approval is required.

## Promotion Rules

The next phase is ready when:

- `npm run phase:readiness` passes.
- Full readiness has no unexplained failures.
- Security and data blockers have explicit evidence.
- Model tasks do not overlap in the same worktree.
- Staging browser evidence is available before deployment promotion.
- Human approval is recorded for P0 changes.

The phase is not ready merely because typecheck or E2E passes. Authentication,
tenant isolation, durability, and truthful operational metrics remain release
blocking even when functional tests are green.

## CI Operating Decision

GitHub Actions workflow files are temporarily bypassed because GitHub billing
is currently blocking Actions and producing non-actionable failures. They are
not the source of release truth during this incident. The authoritative path
is the self-hosted runner:

```bash
node scripts/ci-self-hosted.mjs
npm run phase:ops-audit
npm run phase:readiness:full
```

GitHub remains the source-control and pull-request host. PR checks are based on
the committed self-hosted evidence, DTHINK record, and human review.

When billing is restored, GitHub Actions must be re-evaluated and pass one
non-production run before any workflow is restored or marked required.
