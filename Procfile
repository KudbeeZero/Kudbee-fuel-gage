# ──────────────────────────────────────────────────────────────────────────
# Kudbee — Heroku process formation (Procfile)
# ──────────────────────────────────────────────────────────────────────────
# Basic dyno = 512 MB RAM each. V8 heap caps must stay ≤ ~65% of dyno RAM
# so native code, GC, and worker threads have headroom (no OOM under load).
#
#   web (Basic, 512MB):    heap 320MB = 63%   — the API + terminal + SSE
#   hermes-worker (Basic): heap 256MB = 50%   — governance queue + auditor
#   monitor-worker:        heap 256MB = 50%   — redis quota + anomaly monitor
#   sentinel (Basic):      heap 256MB = 50%   — edge keep-alive + egress
#   release:               heap 256MB (boot-verify only, not resident)
#
# ──────────────────────────────────────────────────────────────────────────
# Release phase: self-verification + DB migration before traffic routing.
release: node --max-old-space-size=256 scripts/boot-verify.mjs
web: npx tsx --max-old-space-size=320 --max-semi-space-size=16 services/ingestion/server.js
monitor-worker: node --max-old-space-size=256 services/monitor/agent.js
hermes-worker: npx tsx --max-old-space-size=256 worker.js
sentinel: npx tsx --max-old-space-size=256 services/sentinel/src/index.ts
