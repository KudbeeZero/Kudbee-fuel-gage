# Kudbee Terminal Agent System — TERMINAL.md

> **Living document** — updated on every session. Single source of truth for the terminal agent ecosystem.

Last updated: 2026-07-27T18:07:31Z | Session: ses_05b7dc575feb07buxiDZIsOOuU

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   CONTROL TOWER UI                       │
│  OBSERVABILITY tab → polls /api/system/agent-status     │
│  Shows: agent fleet, rate limits, decisions, snippets    │
└──────────────────────┬──────────────────────────────────┘
                       │ GET /api/system/agent-status (8s)
┌──────────────────────┴──────────────────────────────────┐
│              EXPRESS MIDDLEWARE LAYER                     │
│  routes/system.ts → agent-bridge.mjs state → JSON       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│              AGENT BRIDGE (shared state)                  │
│  .kilo/memory/agent-state.json  ← read by Express       │
│  .kilo/memory/rate-limits.json  ← concurrency control   │
│  .kilo/memory/wait-queue.json   ← overflow queue        │
│  scripts/agent-bridge.mjs                                │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│              TERMINAL AGENT FLEET                         │
│  .kilo/agents/{id}.agent  ← script agents               │
│  scripts/agents.mjs       ← management CLI              │
│  scripts/snippet-agent.mjs ← recall + graph             │
│  scripts/session-bootstrap.mjs ← session init           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│              KNOWLEDGE STORE                              │
│  .kilo/memory/snippets/    ← 8 knowledge snippets       │
│  .kilo/memory/memories/    ← per-agent recall logs      │
│  .kilo/memory/decisions/   ← audit trail               │
│  .kilo/memory/relations.json ← knowledge graph          │
│  .kilo/memory/journal.json ← session history            │
│  .kilo/memory/tokens/      ← raw injectable tokens      │
└─────────────────────────────────────────────────────────┘
```

---

## Terminal Agents vs CLI Agents

| Aspect | Terminal Agents | CLI Agents |
|:---|---:|:---|
| **File format** | `.kilo/agents/{id}.agent` (YAML + bash) | `.kilo/agent/{id}.md` (YAML + Markdown) |
| **Execution** | `node scripts/agents.mjs run <id>` | Kilo subagent invocation via Task tool |
| **Engine** | Node.js child_process | LLM-driven with Kilo tools |
| **Memory** | `.kilo/memory/memories/{id}.memory` (JSON) | LLM conversation context |
| **Decisions** | `dec-*.json` audit trail | Conversation messages |
| **Purpose** | Scripted automation, CI, health checks | Natural language reasoning, code editing |
| **Rate limited** | Yes — agent-bridge concurrency cap | No — shares LLM rate limits |
| **Observable** | Yes — `/api/system/agent-status` | No — session-local only |
| **Examples** | `pipeline-guardian`, `ci-watcher`, `knowledge-curator` | `middleware.md`, `session_checkpoint.md` |

---

## Terminal Agent Fleet (3 agents)

| Agent | Schedule | Category | Actions | Decisions | Status |
|:---|:---|---:|---:|---:|:---|
| `pipeline-guardian` | on-demand | middleware | 2 | 2 | active |
| `ci-watcher` | on-deploy | verification | 0 | 0 | idle |
| `knowledge-curator` | daily | memory | 0 | 0 | idle |

---

## Knowledge Store (8 snippets, 7 relations)

```
middleware-pipeline-architecture  (2 recalls)
  ├── middleware-patterns          (2 recalls)
  ├── api-route-catalog            (0 recalls)
  │     └── frontend-patterns      (2 recalls)
  └── redis-patterns               (1 recall)
        ├── database-schema         (1 recall)
        └── agent-ecosystem         (2 recalls)
              └── verification-patterns (0 recalls)
```

---

## Management Commands

### Session Bootstrap (run on every new session)

```bash
node scripts/session-bootstrap.mjs
```

Output: session ID, last session summary, agent fleet status, knowledge store stats, rate limit state, recent decisions, top recalled snippets.

### Agent Management

```bash
node scripts/agents.mjs status              # ├── Fleet dashboard
node scripts/agents.mjs list                # ├── All agents
node scripts/agents.mjs create <id> <cat>   # ├── New agent
node scripts/agents.mjs run <id> [task]     # ├── Execute agent
node scripts/agents.mjs recall <id> <query> # ├── Agent recall
node scripts/agents.mjs update <id>         # ├── Refresh knowledge
node scripts/agents.mjs decode <id>         # ├── Audit decisions
```

### Knowledge Management

```bash
node scripts/snippet-agent.mjs list          # ├── All snippets
node scripts/snippet-agent.mjs search <q>    # ├── Full-text search
node scripts/snippet-agent.mjs recall <q>    # ├── Semantic recall + memory
node scripts/snippet-agent.mjs graph <id>    # ├── Knowledge graph walk
node scripts/snippet-agent.mjs identity <id> # ├── Full identity card
node scripts/snippet-agent.mjs relate <a> <b># ├── Create relation
node scripts/snippet-agent.mjs inject <id>   # ├── Push to Think Token Forge
node scripts/snippet-agent.mjs health        # ├── System health
```

### Rate Limits & Queue

```bash
node scripts/agent-bridge.mjs state          # ├── Full state dump
node scripts/agent-bridge.mjs rate           # ├── Rate limit view
node scripts/agent-bridge.mjs acquire <id>   # ├── Acquire slot
node scripts/agent-bridge.mjs release <id>   # ├── Release slot
node scripts/agent-bridge.mjs enqueue <id>   # ├── Queue agent
node scripts/agent-bridge.mjs queue          # ├── Wait queue view
```

### Knowledge Injection Pipeline

```bash
node scripts/extract-codebase-knowledge.mjs  # ├── Extract tokens
node scripts/inject-knowledge-tokens.mjs     # ├── Inject into Forge
node scripts/snippet-manager.mjs list        # ├── Legacy snippet list
node scripts/snippet-manager.mjs verify      # ├── Legacy health
```

---

## Middleware Pipeline (11 layers)

All layers use `MiddlewareGuard` fail-open. Observability via `/api/system/route-latencies`.

| # | Name | Guard | File |
|:--|:---|:---|:---|
| 1 | Duration Tracker | — | `server.js` inline |
| 2 | Spheroid Audit | 5/45s | `spheroidAuditMiddleware.ts` |
| 3 | Rate Limiter | 5/30s | `rateLimiter.ts` (atomic EVAL) |
| 4 | 15s Timeout | 3/60s | `server.js` inline |
| 5 | CORS | — | `server.js` inline |
| 6 | Body Parser | — | `server.js` inline |
| 7 | Bearer Auth | 3/30s | `bearerAuthMiddleware.ts` |
| 8 | KiloBridge Budget | 3/30s | `kiloBridgeMiddleware.ts` |
| 9 | ECP Singleflight | 3/60s | `ecpMiddleware.ts` |
| 10 | API Rate Limiter | — | `server.js` inline |
| 11 | Zod Validation | 2/30s | `zodValidationMiddleware.ts` |
| R | Global Error Handler | — | `globalErrorMiddleware.ts` |

---

## API Endpoints

| Method | Path | Purpose |
|:---|:---|:---|
| GET | `/api/system/route-latencies` | Middleware stats + route percentiles |
| GET | `/api/system/agent-status` | Terminal agent fleet status |
| GET | `/api/system/diagnostics` | Deep health probe (DB + Redis) |
| GET | `/api/system/health-deep` | System health check |

---

## UI Integration

- **Tab**: OBSERVABILITY (primary nav, Gauge icon)
- **Page**: `apps/web/src/pages/observability.tsx`
- **Panels**: MiddlewareInspector, AgentFleetMonitor, RouteLatencyMonitor
- **Hooks**: `useMiddlewareStatus` (5s poll), `useAgentStatus` (8s poll)
- **Component**: `AgentFleetMonitor.tsx` — agent cards, rate limits, wait queue, decisions feed, top snippets

---

## Session History

| Session | Date | Summary | CI |
|:---|:---|:---|:---|
| ses_05b7dc575feb07buxiDZIsOOuU | 2026-07-27 | Phase 66 — Middleware Pipeline + Observability + Terminal Agents | GREEN |
| ses-1785175580974-2b6f999f | 2026-07-27 | Bootstrap run | — |

---

## Verification Status (latest)

| Gate | Result |
|:---|:---|
| Typecheck (lib) | Pass (12/12 tasks) |
| Tests (bun) | 46 pass, 0 fail |
| Build (web) | 290 kB main chunk |
| E2E (38 checks) | 38/38 passed |
| Snippets | 8 agents, 7 relations, 12,583B |
| Agent fleet | 3 agents, 2 decisions, 2 actions |

---

## File Inventory

### New files (this session)
```
scripts/session-bootstrap.mjs          Session init + wake-up
scripts/agent-bridge.mjs               Shared state for Express + agents
scripts/agents.mjs                     Terminal agent management
scripts/snippet-agent.mjs              Knowledge agent system
scripts/snippet-manager.mjs            Legacy snippet manager
scripts/extract-codebase-knowledge.mjs Knowledge extraction
scripts/inject-knowledge-tokens.mjs    Think Token Forge injection
apps/web/src/pages/observability.tsx   Observability dashboard
apps/web/src/components/observability/MiddlewareInspector.tsx
apps/web/src/components/observability/RouteLatencyMonitor.tsx
apps/web/src/components/observability/AgentFleetMonitor.tsx
apps/web/src/hooks/useMiddlewareStatus.ts
apps/web/src/hooks/useAgentStatus.ts
apps/web/src/lib/focusTrap.ts          Accessibility utility
.kilo/command/verify.md                /verify slash command
.kilo/command/pr.md                    /pr slash command
.kilo/agent/middleware.md              Middleware subagent
.kilo/skill/kudbee/SKILL.md            Interactive project skill
.kilo/agents/pipeline-guardian.agent   Terminal agent
.kilo/agents/ci-watcher.agent          Terminal agent
.kilo/agents/knowledge-curator.agent   Terminal agent
.kilo/memory/journal.json              Session memory
.kilo/memory/relations.json            Knowledge graph
.kilo/memory/snippets/ (8 files)       Knowledge snippets
.kilo/memory/memories/ (5 files)       Agent recall logs
.kilo/memory/tokens/ (8 files)         Injectable tokens
TERMINAL.md                            This file — living documentation
```
