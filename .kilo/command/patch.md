---
description: Live UI state update from terminal — patches the frontend agent-state endpoint so the website reflects terminal work in real time
---
Execute a live patch: terminal work instantly appears in the web UI with zero page refresh.

## 1. Push Fresh State
The agent bridge is the shared memory between terminal and UI. Write fresh state:
```bash
node scripts/agent-bridge.mjs state
```
This updates the in-memory agent state that the Express system router serves at `GET /api/system/agent-status`.

## 2. Cache Invalidation (Force UI Refresh)
The BUS→CACHE bridge auto-invalidates stale cache entries when events fire. Force a cache flush:
```bash
node scripts/serial-bus.mjs publish system:health '{"status":"GREEN","agents":3}'
```
This triggers the BUS→CACHE bridge which invalidates `agent-state` and `dashboard` cache keys. The next UI poll (4-8s) hits cold cache → fetches fresh state from the agent bridge.

## 3. Confirm Patch Applied
Read the current agent-state and confirm the new data is there:
```bash
node scripts/agent-bridge.mjs state | head -5
```

## 4. TerminalMirror Component
If the Observability page is open in the browser, the TerminalMirror component polls `/api/system/agent-status` every 4 seconds. The patch will appear in the log window on the next poll cycle.

## 5. Verify End-to-End
```bash
node scripts/system-status.mjs check
```
Shows the synchronized state between terminal and UI.
