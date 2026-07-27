---
description: Master bootstrap — run first on ANY new cloud agent. Loads full system context, interactive terminal, all plugins/skills, multi-agent awareness, adaptive next-step routing.
subtask: false
---
You are booting a new Kudbee cloud agent. Execute this master sequence. Do NOT skip any phase.

## PHASE 1: Self-Awareness (ALWAYS first)

```bash
node scripts/session-bootstrap.mjs
```
Report the output. If bootstrap fails, read TERMINAL.md and `.kilo/skill/kudbee/SKILL.md` for fallback context.

## PHASE 2: Multi-Agent Awareness

Check if other cloud agents are running:
```bash
node scripts/agents.mjs status
cat .kilo/memory/local-state/*.json 2>/dev/null || echo "No local agents"
```

**Decision tree (enterprise reasoning):**
- If another agent is ACTIVE with status "processing" → DO NOT INTERRUPT. Wait. Report: "Agent <id> is processing <task>. Standing by."
- If another agent is AWAITING_HUMAN → check voicemails, see if human responded yet
- If no other agents are active → PROCEED to Phase 3
- If agent fleet is empty → run auto-registration: `node scripts/skill-auto-import.mjs auto`

## PHASE 3: Context Sync

Pull the latest state from all sources:
```bash
node scripts/dthink-pipeline.mjs tail 10
node scripts/serial-bus.mjs history 10
node scripts/phone-tree.mjs history
```

**Decision tree:**
- If DTHINK shows recent `human:handoff` → check if resolved before proceeding
- If serial bus shows `system:interrupt` or `middleware:degrade` → investigate before starting
- If all clean → PROCEED to Phase 4

## PHASE 4: Plugin & Skill Inventory

List everything available:
```bash
ls .kilo/command/*.md | sed 's/.*\///;s/.md$//' | sort | while read c; do echo "  /$c — $(head -3 .kilo/command/$c.md | grep description | sed 's/description: //')"; done
```

```bash
ls .kilo/skill/*/SKILL.md | sed 's/.*\///' | sort
```

```bash
ls .kilo/agent/*.md | grep -v AGENTS.kilo | sed 's/.*\///;s/.md$//' | sort
```

Report the count: "Available: <N> commands, <N> skills, <N> CLI agents"

## PHASE 5: Adaptive Routing

Based on what you found in phases 1-4, determine the BEST next action:

**If CI is RED:**
→ Run `/verify` to diagnose and fix
→ Run `/sync` to update the web UI

**If voicemails are pending:**
→ Run `/memory` to replay and process

**If other agents are waiting (AWAITING_HUMAN):**
→ Run `/handoff` to escalate to operator

**If DTHINK shows unresolved problems:**
→ Run `/think` to audit and resolve

**If all is GREEN and quiet:**
→ Run `/report` to generate standby report
→ Run `/sync` to push to web UI
→ Present the interactive menu:

```
╔══════════════════════════════════════════╗
║         KUDBEE CONTROL TOWER            ║
╠══════════════════════════════════════════╣
║  [1] Verify all CI gates                ║
║  [2] Run typecheck                      ║
║  [3] Run tests (services/lib)           ║
║  [4] Build web app                      ║
║  [5] Run E2E verification               ║
║  [6] Inspect middleware pipeline        ║
║  [7] Inspect route latencies            ║
║  [8] Audit production fixes            ║
║  [9] Review OUTING_PLAN.md             ║
║  [A] Show PR status                    ║
║  [B] Review branch changes             ║
║  [C] Create PR                         ║
║  [D] CI + PR one-shot                  ║
║  [E] Merge & cleanup                   ║
║  [/sync]    Terminal↔UI bridge         ║
║  [/report]  Standby report             ║
║  [/handoff] Human-in-the-loop          ║
║  [/broadcast] Multi-agent broadcast    ║
║  [/patch]   Live UI update             ║
║  [/memory]  Full memory recall         ║
║  [/continue] Session resume            ║
║  [/think]   DTHINK console             ║
║  [/status]  System diagnostic          ║
║  [0] Full health check                 ║
╚══════════════════════════════════════════╝
```

## PHASE 6: Enterprise Escalation

If at any point you encounter:
- CRITICAL voicemail → `node scripts/cloud-agent.mjs interrupt operator "CRITICAL: <reason>" --priority=CRITICAL`
- Middleware degraded → `node scripts/bus-to-cache.mjs bridge` to force cache flush
- Agent offline with pending tasks → `node scripts/agents.mjs run <id> <task>` to attempt restart
- Unknown state → Run `/status` again, then `/think` for deep audit

## PHASE 7: Spin Up Agents (if needed)

If the system needs active monitoring:
```bash
node scripts/cloud-agent.mjs start pipeline-guardian middleware
```
This starts live recording. The guard scans all 11 middleware layers and reports.

If knowledge needs curation:
```bash
node scripts/agents.mjs run knowledge-curator "curate after bootstrap"
```

If CI needs verification:
```bash
node scripts/agents.mjs run ci-watcher "verify after bootstrap"
```

## PHASE 8: Final Report

After all phases complete, output:

```
══════════════════════════════════════════════════════
  /load COMPLETE — AGENT INITIALIZED
──────────────────────────────────────────────────────
  Session:    <id>
  CI:         GREEN | RED
  Tests:      46/46
  Agents:     <count> online, <count> running
  DTHINK:     <count> entries in pipeline
  Voicemails: <count> pending
  Commands:   <count> available
  Skills:     <count> loaded
  Other agents: <count> detected
──────────────────────────────────────────────────────
  RECOMMENDED NEXT: <specific action>
  BLOCKED: YES | NO (<reason if yes>)
──────────────────────────────────────────────────────
  STATUS: READY | BLOCKED | DEGRADED
══════════════════════════════════════════════════════
```
