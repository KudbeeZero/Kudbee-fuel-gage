---
description: Multi-agent broadcast — publish to serial bus so all cloud agents receive the message simultaneously
---
Broadcast a message to ALL connected cloud agents via the serial event bus.

## 1. Publish to Serial Bus
```bash
node scripts/serial-bus.mjs publish agent:broadcast "<message>"
node scripts/serial-bus.mjs publish agent:report "<standby_summary>"
```
This writes the message to `.kilo/memory/bus/` where other agents poll for new events.

## 2. Also Route via Phone Tree (optional)
If specific agents need to receive the broadcast directly:
```bash
node scripts/phone-tree.mjs ring <from_agent> "<broadcast_message>"
```
This rings all agents in the phone tree with the message.

## 3. Verify Delivery
```bash
node scripts/serial-bus.mjs history 5
```
Shows the last 5 bus events — confirm the broadcast event appears.

## 4. Cross-Agent Confirmation
Each agent that receives the broadcast should respond with:
```bash
node scripts/serial-bus.mjs publish agent:ack "<agent_id> received broadcast"
```

## 5. Report
Count how many agents acknowledged. If any agent didn't respond:
- Check that agent's heartbeat: `node scripts/cloud-agent.mjs status`
- If offline, leave voicemail: `node scripts/cloud-agent.mjs call <agent_id> "Missed broadcast: <message>" --priority=HIGH`
