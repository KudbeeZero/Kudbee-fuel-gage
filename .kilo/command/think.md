---
description: Interactive terminal think console — DTHINK pipeline recall, problem tracking, state verification, memory layer audit, THINK Protocol vNext orchestration
---
Bring up the interactive DTHINK terminal immediately. Present this menu:

```
══════════════════════════════════════════════
  DTHINK — DISTRIBUTED THINK CONSOLE
══════════════════════════════════════════════
  [1] View last DTHINK tokens (tail 10)
  [2] Detailed overview (full snapshot)
  [3] Recall last N entries
  [4] Problem audit — what was solved?
  [5] Challenge audit — what blocked us?
  [6] State verification — was it disrupted?
  [7] Memory layer audit — is it all recorded?
  [8] Frontend connection check
  [9] API integration check
  [0] Full health: all checks
  [T] THINK Protocol vNext — daily cycle
══════════════════════════════════════════════
```

## [T] THINK Protocol vNext — Daily Engineering Cycle

Read `THINK_PROTOCOL.md` (repo root) for the full operating model. Execute the
daily cycle:

1. **Think** — understand objective, scan docs/architecture, review decisions.
2. **Harmonize** — `git fetch origin && ./scripts/pr-sync.sh drift`
3. **Implement** — one vertical slice on `feature/<name>` branch.
4. **Navigate** — monitor CI via `gh pr checks`, drift via `pr-sync.sh`.
5. **Knowledge** — record decisions to `.kilo/memory/decisions/`, snippets.

```bash
# Full cycle per task:
./scripts/pr-sync.sh sync <branch>      # rebase + resolve + push
gh pr create --base main --title "..."  # one PR per branch
./scripts/pr-sync.sh merge <branch>     # sync + squash-merge + cleanup
```

## Menu Actions

### [1] View last DTHINK tokens
```bash
node scripts/dthink-pipeline.mjs tail 10
```

### [2] Detailed overview
```bash
node scripts/dthink-pipeline.mjs stats
node scripts/dthink-pipeline.mjs tail 20
```

### [3] Recall last N entries
Ask how many, then:
```bash
node scripts/dthink-pipeline.mjs tail <N>
node scripts/dthink-pipeline.mjs query type agent:decision <N>
```

### [4] Problem audit
Search DTHINK for problems solved:
```bash
node scripts/dthink-pipeline.mjs query type agent:decision
node scripts/agents.mjs decode pipeline-guardian
node scripts/agents.mjs decode knowledge-curator
```
Report: problems identified, solutions applied, who resolved them, when.

### [5] Challenge audit
Search DTHINK for challenges:
```bash
node scripts/serial-bus.mjs history 20 | grep -E "error|degrade|interrupt"
```
Report: any disruptions, degraded middleware, interrupted agents.

### [6] State verification
Verify that all activity was recorded:
```bash
node scripts/dthink-pipeline.mjs snapshot
node scripts/serial-bus.mjs stats
```
Compare: DTHINK entries vs serial bus events. If mismatch, flag.

### [7] Memory layer audit
```bash
node scripts/session-bootstrap.mjs | head -30
node scripts/agents.mjs status
```
Verify: journal entries vs decisions vs bus events vs DTHINK entries all consistent.

### [8] Frontend connection check
```bash
node scripts/agent-bridge.mjs state | head -3
```
Confirm: agent-state is being written (frontend polls this). If not, run /sync.

### [9] API integration check
```bash
node scripts/system-status.mjs check
```
Verify: all endpoints responding, cache warm, cache bridge active.

### [0] Full health
Run all 9 checks sequentially. Produce report:
```
	DTHINK HEALTH: <PASS/FAIL>
	Entries: <count>  |  Problems solved: <count>  |  Disruptions: <count>
	Memory layers: <all consistent / mismatch found>
	Frontend: <connected / offline>
	API: <responding / down>
```
