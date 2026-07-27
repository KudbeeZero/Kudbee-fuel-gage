---
description: Proven human-in-the-loop handoff procedure — escales critical decisions to operator, logs audit trail, sets status to AWAITING_HUMAN
---
Execute the human-in-the-loop (HITL) handoff procedure. Use when a terminal agent encounters a decision that requires human judgment.

## 1. Assess Severity
Determine if this requires human intervention:
- CRITICAL priority voicemail → HITL REQUIRED
- Middleware guard BYPASSED → HITL REQUIRED
- Decision confidence < threshold → HITL REQUIRED
- Database connection failure → HITL REQUIRED
- All other cases → Log and continue, no HITL

## 2. Log the Decision
```bash
node scripts/agents.mjs decide <agent_id> "handoff: <reason>" "severity=<CRITICAL|HIGH|MEDIUM>"
```
This creates an audit trail entry with the handoff reason.

## 3. Set Agent Status to AWAITING_HUMAN
Write the current agent state to `.kilo/memory/local-state/<agent_id>.json` with `status: AWAITING_HUMAN`. The next cloud agent that boots will see this status and know to wait.

## 4. Route the Call
```bash
node scripts/phone-tree.mjs call <agent_id> operator "HANDOFF: <reason> — severity: <level>"
```
The operator (dispatcher) receives the call and queues it for human review.

## 5. If CRITICAL — Emergency Escalation
- Fire interrupt: `node scripts/cloud-agent.mjs interrupt operator "CRITICAL HANDOFF: <reason>"`
- BUS→CACHE flush: forces UI to show the alert immediately
- Voicemail with CRITICAL priority: `node scripts/cloud-agent.mjs call operator "HANDOFF" --priority=CRITICAL`

## 6. Human Responds
When the human operator responds with a decision:
- Log the decision: `node scripts/agents.mjs decide <agent_id> "handoff:resolved" "resolution=<human_decision>"`
- Set agent status back to `online`
- Route response call back to the originating agent
- Update the serial bus with the resolution

## 7. Handoff Trail
At the end, produce an audit trail:
```
═══ HANDOFF AUDIT ═══
Decision ID:  <id>
Agent:        <agent_id>
Severity:     <level>
Reason:       <reason>
Status:       AWAITING_HUMAN | RESOLVED
Resolution:   <human_decision>
Timestamp:    <ISO 8601>
═══ END AUDIT ═══
```
