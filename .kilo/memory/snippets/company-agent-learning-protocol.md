# Company-Agent Learning Protocol

The company agent loop is evidence-first and bounded:

1. Recall relevant memory and prior decisions for the agent and task.
2. Declare intent, non-goals, preconditions, authority, isolation, rollback, and acceptance conditions.
3. Execute one bounded job inside the company manifest's write authority.
4. Collect command results, changed files, runtime evidence, and explicit environment skips.
5. Receive an independent reviewer, test, CI, or quality signal. The implementer is not the sole reviewer.
6. Mint a structured `PENDING_APPROVAL` THINK token containing metadata, evidence, quality signal, correction delta, confidence, and a bounded follow-up.
7. Feed the structured token metadata into DTHINK.
8. Update the owning agent memory with the reviewed result and its limitations.
9. Create at most one bounded follow-up with an owner, dependency, acceptance condition, and approval boundary.

## Safety Boundary

Secrets, tokens, connection strings, and credential values must never appear in
THINK, DTHINK, memory artifacts, logs, prompts, screenshots, or PR comments.
Missing evidence means stop, not success. Agents must not make autonomous
production, deployment, destructive, authentication, tenant, or authorization
changes. Agent directives, authority, and self-modification require independent
review and explicit approval; unverified self-modification is forbidden.

The canonical machine-readable contract is `config/think/protocol.json`.
