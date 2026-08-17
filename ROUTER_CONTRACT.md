# ROUTER CONTRACT

Level 0-4 Mayor routing. Router is OFF by default (`ROUTER_ENABLED=false`).

## Levels
- **L0** — deterministic / cache / existing memory → **NO model call**
- **L1** — Phi-4 local/free routine worker
- **L2** — Gemini Mayor (orchestration / interpretation)
- **L3** — specialist (XAI/Grok in os-agent; Inception is THINK-only in the monorepo)
- **L4** — Gemini deep reasoning / learning / governance

## DeepSeek
**ZERO application routing.** Never selected by the router, never a fallback.

## Rules
- Every routed call records a machine-readable `reason` for telemetry.
- Escalation: schema failure, timeout, provider error, non-routine task.
- No infinite retry, no infinite fallback, no provider storm.
- Model output never equals execution authority.
