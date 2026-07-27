---
description: Real-time bidirectional sync — pushes terminal state to web UI and confirms receipt. The observability page reflects immediately.
---
Execute real-time sync between terminal agent system and the web UI:

## 1. Push State to Agent Bridge
```bash
node scripts/agent-bridge.mjs state
```
This writes current agent fleet, decisions, snippets, bus events, rate limits, and phone tree to the shared state endpoint that the web UI polls every 4-8s.

## 2. Warm the Cache
```bash
node scripts/terminal-cache.mjs warm
```
Pre-warms L1 (in-memory) and L2 (disk) cache so the next UI poll hits cache (0ms latency).

## 3. Serial Bus Confirmation
Publish a `session:bootstrap` event to the serial bus with the current state summary. The BUS→CACHE bridge will auto-invalidate stale UI cache entries, forcing a fresh load on the next poll.

## 4. Verify UI Received It
Read the shared state file and confirm it contains the latest agent fleet data. Report the age of the state (seconds since last write). If age > 10s, the sync failed — retry.

## 5. Report
Format:
```
═══ SYNC COMPLETE ═══
Agents: 3 | Decisions: 4 | Bus events: 9 | Cache: warm
UI poll interval: 4-8s | State age: <1s
Status: TERMINAL ↔ UI SYNCHRONIZED ✓
═══ END SYNC ═══
```
