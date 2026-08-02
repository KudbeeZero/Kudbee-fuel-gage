# Terminal Audit

**Date:** 2026-08-02 | **Auditor:** KILOH

## Rule: ONE engineering terminal.

## Current Implementations (3)

| # | Implementation | Type | Canonical? | Connected? | Recommendation |
|:--|:---|:---|:---:|:---:|:---|
| 1 | **OllamaChat** (`pages/OllamaChat.tsx`, 25KB) | Full-page local LLM chat | NO | ✅ Ollama SSE | **ARCHIVE** — local LLM chat, not engineering events |
| 2 | **AgentTerminal** (`components/studio/AgentTerminal.tsx`, 12KB) | Studio dock with memory | NO | ❌ no BUS | **MERGE into LiveTerminal** — memory recall/remember is useful, add to LiveTerminal |
| 3 | **LiveTerminal** (`components/thinkbox/LiveTerminal.tsx`, 12KB) | THINKBOX embedded, SSE/BUS | **YES** | ✅ SSE/BUS | **KEEP — make canonical** |

## Supporting Terminal Components (4)

| Component | Purpose | Recommendation |
|:---|:---|:---|
| `TerminalStreamView.tsx` (14KB) | Renders Ollama stream blocks | **KEEP** — used by OllamaChat, keep as renderer |
| `ConsoleDock.tsx` (11KB) | Persistent bottom console | **MERGE into LiveTerminal** — redundant bottom console |
| `TerminalHUDTicker.tsx` (7KB) | News headline ticker | **KEEP** — telemetry overlay, separate concern |
| `TerminalMirror.tsx` (6KB) | Observability terminal mirror | **MERGE into LiveTerminal** — redundant terminal view |

## Terminal State (2)

| Store | Purpose | Recommendation |
|:---|:---|:---|
| `terminalStore.ts` (Zustand) | Terminal UI state | **KEEP** — use for canonical terminal |
| `useTerminalStream.ts` | Terminal event filtering | **KEEP** — bridge between SSE and terminal |

## Verdict

**LiveTerminal (in THINKBOX) becomes the canonical engineering terminal.**

OllamaChat → archived (local LLM chat, not engineering events).
AgentTerminal → merged into LiveTerminal (commands, memory recall).
ConsoleDock → merged into LiveTerminal (persistent console is redundant).
TerminalMirror → merged into LiveTerminal (observability view is same data).

**End state: ONE terminal. LiveTerminal. With all merged capabilities.**
