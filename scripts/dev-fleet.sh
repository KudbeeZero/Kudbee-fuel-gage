#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# scripts/dev-fleet.sh — Run the full agent fleet locally (no Heroku).
#
# Mirrors the Procfile so /status shows the real agent fleet ONLINE.
# Starts, in parallel, the same 4 processes Heroku runs as dynos:
#   web            :3000  ingestion server (API + terminal + dashboard)
#   hermes-worker         governance task queue + autonomous auditor
#   monitor-worker        redis quota monitor + anomaly detection
#   sentinel        :3001  edge sentinel keep-alive + signal ingestion
#
# Usage:
#   ./scripts/dev-fleet.sh              # start all 4, foreground
#   ./scripts/dev-fleet.sh --web-only   # just the API server
#   ./scripts/dev-fleet.sh --workers    # just the 3 workers (web must be up)
#
# Ctrl-C stops all. Each process logs with its name as a prefix.
# Requires: node_modules installed + .env populated (see local-setup-check).
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules/.bin ]]; then
  echo "✗ node_modules missing. Run: npm ci --legacy-peer-deps" >&2
  exit 1
fi

declare -a PROCS=()
declare -a NAMES=()

start_one() {
  local name="$1"; shift
  echo "▶ starting $name: $*"
  "$@" 2>&1 | sed "s/^/[$name] /" &
  PROCS+=("$!")
  NAMES+=("$name")
}

cleanup() {
  echo ""
  echo "⏹ stopping fleet..."
  for pid in "${PROCS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "✓ fleet stopped"
}
trap cleanup INT TERM EXIT

MODE="${1:-all}"

if [[ "$MODE" == "all" || "$MODE" == "--web-only" ]]; then
  start_one "web" npx tsx --max-old-space-size=512 services/ingestion/server.js
fi

if [[ "$MODE" == "all" || "$MODE" == "--workers" ]]; then
  # Workers need REDIS_URL — warn if unset but let them try (they degrade).
  if [[ -z "${REDIS_URL:-}" && -z "$(grep -E '^REDIS_URL=' .env 2>/dev/null || true)" ]]; then
    echo "⚠  REDIS_URL not set — workers may run in degraded mode."
  fi
  start_one "hermes-worker" npx tsx --max-old-space-size=256 worker.js
  start_one "monitor-worker" node --max-old-space-size=256 services/monitor/agent.js
  start_one "sentinel" npx tsx --max-old-space-size=256 services/sentinel/src/index.ts
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  LOCAL FLEET — ${#PROCS[@]} process(es) running            ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  terminal:  http://localhost:3000/terminal.html   ║"
echo "║  /status:   should show agents ONLINE             ║"
echo "╚══════════════════════════════════════════════════╝"
echo "  Ctrl-C to stop all."
echo ""

wait
