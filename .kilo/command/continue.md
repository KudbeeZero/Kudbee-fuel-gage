---
description: Full session recall — load all memory, replay voicemails, sync agents, harvest Think Forge data
---
You are resuming a Kudbee terminal agent session. Execute the following to load full context:

## 1. Run Session Bootstrap
```bash
node scripts/session-bootstrap.mjs
```
This loads the memory journal, agent fleet, knowledge store, serial bus events, and phone tree.

## 2. Replay Voicemails
Read `.kilo/memory/voicemails/` for any undelivered messages. If voicemails exist:
- Report each voicemail with urgency level
- Mark as read after replaying
- If any are CRITICAL, run BUS→CACHE flush: `node scripts/bus-to-cache.mjs test`

## 3. Sync Agent Fleet
```bash
node scripts/agents.mjs status
```
Compare current fleet state to last known state from journal. Report any new, offline, or changed agents.

## 4. Harvest Think Forge Data
```bash
node scripts/think-forge-bridge.mjs feed
```
Auto-stream any unprocessed snippet recalls into the think_tokens pgvector table. This ensures LLM context is always fresh.

## 5. Update Terminal Mirror (if web app is running)
If the web app is running and the OBSERVABILITY tab is visible, the terminal mirror component will auto-reflect the agent fleet status. Run:
```bash
node scripts/cloud-agent.mjs status
```
to push current state to the shared agent-state endpoint that the frontend polls.

## 6. Verify System Health
```bash
node scripts/system-status.mjs check
```
Confirm CI status, test results, pipeline health, and documentation timestamps are current.

## 7. Report
After completing all steps, report:
- Session ID and timestamp
- Agent fleet status (online/offline counts)
- Voicemails replayed (count + urgency distribution)
- Think Forge injections (count)
- CI status (GREEN/RED)
- Any warnings or anomalies
