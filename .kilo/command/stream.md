---
description: Stream Lab — live Cache↔BUS↔Frontend integration flow. Warm cache, publish bus events, invalidate, push to frontend, record in DTHINK.
---
Execute the full Stream Lab integration pipeline. This wires Cache ↔ BUS ↔ Frontend ↔ DTHINK into a single flow using ONLY tools from the arsenal.

## Flow (run sequentially)

### 1. Warm Cache
```bash
node scripts/terminal-cache.mjs warm
```

### 2. Read Cache (verify 0ms latency)
```bash
node scripts/terminal-cache.mjs get agent-state
```

### 3. Publish Bus Event
```bash
node scripts/serial-bus.mjs publish system:health '{"status":"GREEN","agents":3}'
```

### 4. BUS→CACHE Invalidation
```bash
node scripts/bus-to-cache.mjs test
node scripts/bus-to-cache.mjs stats
```

### 5. Verify Cache Is Cold
```bash
node scripts/terminal-cache.mjs stats
```

### 6. Push to Agent Bridge (frontend sees this)
```bash
node scripts/agent-bridge.mjs state
```

### 7. Record in DTHINK
```bash
node scripts/dthink-pipeline.mjs feed system:sync "Stream Lab — cache invalidated, state pushed, frontend ready"
```

### 8. Verify Frontend
The Express API at `GET /api/system/agent-status` reads from the agent-bridge. The TerminalMirror component polls every 4s. After the BUS→CACHE flush, the next UI poll hits cold cache → fetches fresh state from the agent-bridge.

### 9. Report
```
═══ STREAM LAB COMPLETE ═══
Cache:      L1+L2 warm → bus event → L1 invalidated, L2 pruned
BUS:        19 events → topics: system:health, agent:run, agent:complete
Bridge:     agent-state pushed → API endpoint ready
Frontend:   TerminalMirror polls /api/system/agent-status every 4s
DTHINK:     8 entries recorded — full trace available
Arsenal:    /sync + /patch + /status + /think all compatible
═══ END STREAM ═══
```
