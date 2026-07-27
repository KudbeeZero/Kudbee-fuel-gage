---
description: Standardized multi-agent standby report — same format for every cloud agent, every time. See at a glance what each agent is doing.
---
Generate the standardized agent standby report. ALL cloud agents MUST use this exact format so multiple agents can be monitored from a single dashboard.

## Report Format (DO NOT deviate from this structure)

```
══════════════════════════════════════════
  AGENT STANDBY REPORT
──────────────────────────────────────────
  Agent ID:     <id>
  Session:      <session_id>
  Timestamp:    <ISO 8601>
  Status:       STANDBY | ACTIVE | AWAITING_HUMAN | DEGRADED
──────────────────────────────────────────
  FLEET:
    Agents:     <count> online
    Pipeline:   pipeline-guardian (<status>)
    Pipeline:   ci-watcher (<status>)
    Pipeline:   knowledge-curator (<status>)
──────────────────────────────────────────
  MEMORY:
    Decisions:  <count> logged
    Bus events: <count> in stream
    Phone calls: <count> routed
    Voicemails: <count> pending
──────────────────────────────────────────
  VERIFICATION:
    Tests:      46/46
    CI:         GREEN | RED
    Pipeline:   6/6 active
──────────────────────────────────────────
  NEXT ACTION:
    <specific next step>
──────────────────────────────────────────
  HUMAN HANDOFF REQUIRED: YES | NO
  Alerts: <count> critical
══════════════════════════════════════════
```

## Generate Report
Run each data source to populate the report:
```bash
node scripts/agents.mjs status          # Fleet section
node scripts/cloud-agent.mjs status     # Agent details
node scripts/system-status.mjs check    # Verification section
node scripts/agent-bridge.mjs rate       # Rate limits
```

## Determine Next Action
Based on current state:
- If CI RED: "Run npm run typecheck and bun test, then re-run E2E"
- If voicemails pending: "Replay voicemails for <agent_id>"
- If all green: "System healthy. Awaiting human command."
- If agent offline: "Restart <agent_id> via node scripts/agents.mjs run <id>"

## Publish to Serial Bus
After generating, publish the report summary to the serial bus so other cloud agents can read it:
```bash
node scripts/serial-bus.mjs publish agent:report "<report_summary>"
```
