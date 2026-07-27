---
description: Launch interactive terminal agent — full Kudbee Control Tower with phone tree, command reference, and system status
---
Execute the complete interactive terminal agent launch sequence.

## 1. System Bootstrap
```bash
node scripts/session-bootstrap.mjs
```

## 2. Full Phone Tree (inter-agent communication audit)
```bash
node scripts/phone-tree.mjs tree
node scripts/phone-tree.mjs history
node scripts/phone-tree.mjs route dispatcher
```

## 3. Command Reference
List every available command with its purpose:

| Command | What it does |
|:---|:---|
| `/load` | Master bootstrap — 8-phase enterprise sequence for new cloud agents |
| `/status` | 7-phase diagnostic — memory layers, tools inventory, gap analysis |
| `/think` | DTHINK interactive console — problem audit, challenge audit, state verification |
| `/sync` | Real-time terminal↔UI bridge — push state to web app |
| `/report` | Standardized agent standby report — all agents use same format |
| `/handoff` | Human-in-the-loop procedure — escalation, audit trail, operator routing |
| `/broadcast` | Multi-agent serial bus broadcast — publish to all cloud agents |
| `/patch` | Live UI state update — terminal work reflected in web app in <8s |
| `/memory` | Interactive memory recall — full phone tree + voicemail replay + HITL check |
| `/continue` | Full session resume — 7-step: bootstrap, voicemails, fleet, forge, mirror, verify |
| `/verify` | CI gates — typecheck + tests + build + e2e + knowledge extraction |
| `/pr` | PR lifecycle — status, review, create, verify+PR, merge |
| `/help` | This menu — interactive terminal launch + full reference |

## 4. Agent Fleet Status
```bash
node scripts/agents.mjs status
```

## 5. Knowledge Store Health
```bash
node scripts/snippet-agent.mjs health
```

## 6. Serial Bus Activity
```bash
node scripts/serial-bus.mjs stats
```

## 7. DTHINK Pipeline
```bash
node scripts/dthink-pipeline.mjs tail 5
```

## 8. Interactive Menu
Present the full Kudbee Control Tower menu so the user can choose next action.
