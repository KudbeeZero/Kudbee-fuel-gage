---
description: Interactive terminal agent memory recall — full phone tree, handoff procedure, human-in-the-loop activation
---
Activate the interactive terminal agent memory system. Execute this procedure:

## 1. Full Memory Recall
```bash
node scripts/session-bootstrap.mjs
node scripts/agents.mjs status
```
Display: agent fleet, decisions log, snippet recall history, bus events, journal entries.

## 2. Phone Call Procedure
```bash
node scripts/phone-tree.mjs tree
node scripts/phone-tree.mjs history
```
Display: agent call tree hierarchy + all logged calls. If any calls are pending, route them now via:
```bash
node scripts/phone-tree.mjs call <from> <to> "message"
```

## 3. Voicemail Check
```bash
node scripts/cloud-agent.mjs voicemail pipeline-guardian
node scripts/cloud-agent.mjs voicemail knowledge-curator
node scripts/cloud-agent.mjs voicemail ci-watcher
```
If any voicemails are unread, replay them now. Mark as read after delivery.

## 4. Decision Audit
```bash
node scripts/agents.mjs decode pipeline-guardian
node scripts/agents.mjs decode knowledge-curator
```
Show all logged decisions with timestamps and categories. If any decisions require HUMAN IN THE LOOP, flag them now.

## 5. Human-in-the-Loop Handoff
If any of the following conditions are true, alert the human operator immediately:
- CRITICAL priority voicemails are unread
- Any middleware guard is in BYPASSED or DEGRADED state
- Serial bus shows error events (system:error topic)
- Phone tree shows unresolved calls (no response received)
- CI status is NOT green

Handoff format:
```
═══ HUMAN-IN-THE-LOOP HANDOFF ═══
Alert: <description>
Severity: CRITICAL | HIGH | MEDIUM
Action required: <specific action>
Agent: <agent_id>
Decision ID: <decision_id>
Phone: node scripts/phone-tree.mjs call operator <agent_id> "<alert>"
═══ END HANDOFF ═══
```

## 6. Standby Mode
If no critical alerts exist, enter standby:
- Heartbeat the agent fleet: `node scripts/agent-bridge.mjs rate`
- Update system status: `node scripts/system-status.mjs check`
- Report: "System standby. 3 agents online. All checks green. Awaiting next command."
