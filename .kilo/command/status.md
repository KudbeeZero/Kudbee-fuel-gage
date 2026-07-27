---
description: Comprehensive system diagnostic — all memory layers, available tools, skill gap analysis, Think Forge capture. Run first before any work.
---
Execute a full system diagnostic. ACCESS EVERY LAYER before returning. Think of this as the agent's self-awareness scan — it tells you exactly what you have, what you're missing, and what to do next.

## PHASE 1: Memory Layer Access (all at once)

Run these in parallel and capture ALL output:

```bash
node scripts/session-bootstrap.mjs
```
Loads: memory journal, agent fleet with recall logs, knowledge snippets with semantic tracking, serial bus events, phone tree.

```bash
node scripts/agents.mjs decode pipeline-guardian
node scripts/agents.mjs decode knowledge-curator
node scripts/agents.mjs decode ci-watcher
```
Loads: all decision audit trails per agent.

```bash
node scripts/phone-tree.mjs history
```
Loads: all inter-agent phone calls (routing, hops, message content).

```bash
node scripts/cloud-agent.mjs voicemail pipeline-guardian
node scripts/cloud-agent.mjs voicemail knowledge-curator
```
Loads: pending voicemails with urgency levels.

```bash
ls .kilo/memory/bus/ | wc -l
```
Counts: total serial bus events on disk.

## PHASE 2: Available Tools Inventory

List EVERY command, plugin, and skill available:

```bash
ls .kilo/command/ | sed 's/.md$//' | sort
```
Commands available: <list>

```bash
ls .kilo/agent/ | grep -v AGENTS.kilo | sed 's/.md$//' | sort
```
CLI subagents available: <list>

```bash
ls .kilo/skill/ | sort
```
Skills available: <list>

```bash
ls scripts/ | grep '.mjs$' | sed 's/.mjs$//' | sort
```
Scripts available: <list>

## PHASE 3: Skill Gap Analysis

For each missing capability, recommend what should be created:

| Capability | Status | Gap |
|:---|:---|:---|
| Terminal agent system | ✓ 3 agents, 6 pipelines | No gap |
| Knowledge store | ✓ 8 snippets, 7 relations | No gap |
| Serial bus | ✓ 9 events, pub/sub | Gap: need Redis pub/sub subscriber |
| Phone tree | ✓ 4 nodes, 3 calls | No gap |
| Voicemail | ✓ 3 voicemails, CRITICAL support | No gap |
| Think Token Forge | ✓ 1 injection | Gap: need pgvector backend for semantic search |
| Frontend mirror | ✓ TerminalMirror, AgentFleet | No gap |
| Multi-agent broadcast | ✓ /broadcast | No gap |
| Human-in-the-loop | ✓ /handoff | No gap |
| CI integration | ✓ /verify | No gap |
| Session checkpoint | ✓ auto-commit | No gap |

**Recommendations for missing capabilities:**
- If `pgvector` is unavailable: use local JSON file as think_token store (already implemented in think-forge-bridge.mjs)
- If Redis is unavailable: LOCAL mode handles everything via files (already implemented)
- If `@tailwindcss/vite` is missing: web build fails — run `npm install` in root

## PHASE 4: Think Token Forge Capture

Stream all diagnostic output into the Think Token Forge pipeline:

```bash
node scripts/think-forge-bridge.mjs feed
```

This auto-injects diagnostic data as think_token entries. Every recall, decision, and system status becomes searchable context for the LLM.

## PHASE 5: Frontend Mirror Update

Push state to the web UI so it reflects the diagnostic:

```bash
node scripts/agent-bridge.mjs state
node scripts/serial-bus.mjs publish system:health '{"status":"GREEN","diagnostic":"complete"}'
```

The BUS→CACHE bridge invalidates stale UI cache. The TerminalMirror component (Observability page) reflects the new state within 4-8 seconds.

## PHASE 6: Check Other Cloud Agents

Before starting any work, check what other cloud agents are doing:

```bash
cat .kilo/memory/local-state/*.json 2>/dev/null | head -20
```
Shows: heartbeat state of all agents in this container.

```bash
cat .kilo/memory/journal.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('Last:', d.journal?.[d.journal.length-1]?.type, 'Total sessions:', d.trends?.sessions)"
```
Shows: last session activity and total sessions.

```bash
node scripts/agents.mjs status
```
Shows: current fleet status — if an agent is running a task, DON'T interrupt it.

## PHASE 7: Final Recommendation

Based on all data collected, produce this output:

```
══════════════════════════════════════════════════════
  /status DIAGNOSTIC COMPLETE
──────────────────────────────────────────────────────
  MEMORY:     All 4 layers healthy (journal, memories, bus, decisions)
  TOOLS:      <N> commands, <N> agents, <N> skills, <N> scripts
  MISSING:    <list gaps or "none">
  OTHER AGENTS: <N> running, <N> idle — safe to proceed
  THINK FORGE: <N> injections recorded
  FRONTEND:   Synced — TerminalMirror shows current state
──────────────────────────────────────────────────────
  RECOMMENDED NEXT ACTION:
  <best next step based on current state>
──────────────────────────────────────────────────────
  STATUS:     READY TO EXECUTE
══════════════════════════════════════════════════════
```
