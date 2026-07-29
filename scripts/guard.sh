#!/usr/bin/env bash
# ============================================================================
# Kudbee Agent Guard Script — 4-Hour Autonomous Watch
# ============================================================================
# Runs while operator sleeps. Monitors all production systems every 60s.
# Auto-fixes known issues. Logs everything to DTHINK pipeline.
# Saves findings to .kilo/memory/guard-*.json.
# ============================================================================

set -euo pipefail
START_TIME=$(date +%s)
DURATION=$((4 * 60 * 60))  # 4 hours
INTERVAL=60                # check every 60s
ROUND=0
FAILURES=0
FIXES=0

PROD_URL="https://kudbee-fuel-gage-330ade653a62.herokuapp.com"
GUARD_DIR=".kilo/memory"
mkdir -p "$GUARD_DIR"
GUARD_LOG="$GUARD_DIR/guard-$(date +%Y%m%d-%H%M%S).jsonl"

log() {
  local level="$1" msg="$2"
  local ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "{\"ts\":\"$ts\",\"level\":\"$level\",\"msg\":\"$msg\"}" >> "$GUARD_LOG"
  printf "[%s] %-6s %s\n" "$(date +%H:%M:%S)" "$level" "$msg"
}

check_health() {
  local status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PROD_URL/health" 2>/dev/null || echo "000")
  echo "$status"
}

check_endpoint() {
  local path="$1" label="$2"
  local status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PROD_URL$path" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    return 0
  else
    log "WARN" "$label returned $status"
    return 1
  fi
}

auto_fix_deploy() {
  # If health is down for 3+ consecutive checks, force a deploy
  FAILURES=$((FAILURES + 1))
  if [ $FAILURES -ge 3 ]; then
    log "ACTION" "Health down for 180s — triggering force deploy"
    local sha=$(git rev-parse HEAD 2>/dev/null || echo "")
    if [ -n "$sha" ] && [ -n "${HEROKU_API_KEY:-}" ]; then
      curl -s -X POST \
        -H "Authorization: Bearer $HEROKU_API_KEY" \
        -H "Content-Type: application/json" \
        -H "Accept: application/vnd.heroku+json; version=3" \
        "https://api.heroku.com/apps/kudbee-fuel-gage/builds" \
        -d "{\"source_blob\":{\"url\":\"https://github.com/KudbeeZero/Kudbee-fuel-gage/tarball/${sha}\",\"version\":\"${sha}\"}}" \
        -o /dev/null -w "%{http_code}" 2>/dev/null
      FIXES=$((FIXES + 1))
      log "FIX" "Force deploy to Heroku triggered"
    fi
    FAILURES=0
    sleep 120  # wait for deploy
  fi
}

feed_dthink() {
  local msg="$1"
  node scripts/dthink-pipeline.mjs feed "system:guard" "$msg" 2>/dev/null || true
}

cleanup_old_logs() {
  # Keep only last 5 guard logs
  ls -t "$GUARD_DIR"/guard-*.jsonl 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
}

# ============================================================================
# MAIN LOOP
# ============================================================================
log "INFO" "Guard started — 4-hour watch (${DURATION}s, interval=${INTERVAL}s)"
log "INFO" "Target: $PROD_URL | Node: $(node -v 2>/dev/null || echo 'N/A') | PID: $$"
feed_dthink "Agent guard activated — 4-hour autonomous watch. Health checks every 60s. Auto-deploy on 3 consecutive failures."

while true; do
  ROUND=$((ROUND + 1))
  ELAPSED=$(( $(date +%s) - START_TIME ))
  
  # Exit after 4 hours
  if [ $ELAPSED -ge $DURATION ]; then
    log "INFO" "Guard shift complete after ${ROUND} rounds, ${ELAPSED}s elapsed"
    feed_dthink "Guard shift complete: ${ROUND} checks, ${FIXES} fixes, ${FAILURES} transient failures. System stable."
    break
  fi

  # ── Health Check ──────────────────────────────────────────────
  HEALTH=$(check_health)
  
  if [ "$HEALTH" = "200" ]; then
    FAILURES=0
    # Log only every 5th round to avoid noise
    if [ $((ROUND % 5)) -eq 0 ]; then
      log "OK" "Round $ROUND — health=$HEALTH (${ELAPSED}s elapsed)"
      
      # Run deep check every hour
      if [ $((ROUND % 60)) -eq 0 ]; then
        check_endpoint "/api/gastown/dashboard" "gastown"
        check_endpoint "/api/system/synapse-status" "synapse"
        check_endpoint "/api/system/deploy-status" "deploy"
        feed_dthink "Hourly deep check: round ${ROUND}, health OK"
      fi
    fi
  else
    log "FAIL" "Round $ROUND — health=$HEALTH"
    auto_fix_deploy
  fi

  # ── DTHINK Status Feed (every 30m) ───────────────────────────
  if [ $((ROUND % 30)) -eq 0 ]; then
    feed_dthink "Guard round ${ROUND}: health=${HEALTH}, ${FIXES} fixes, $(echo "scale=1; $ELAPSED/3600" | bc 2>/dev/null || echo "?")h elapsed"
  fi

  # ── Sleep ─────────────────────────────────────────────────────
  sleep $INTERVAL
done

# ── Final Report ─────────────────────────────────────────────────
log "INFO" "Guard report: ${ROUND} health checks, ${FIXES} fixes applied"
cleanup_old_logs
feed_dthink "FINAL: Guard completed. ${ROUND} checks, ${FIXES} fixes. Log saved to ${GUARD_LOG}"

echo ""
echo "══════════════════════════════════════════════════"
echo "  Guard Complete — $(date)"
echo "  Rounds: $ROUND | Fixes: $FIXES | Duration: ${ELAPSED}s"
echo "  Log: $GUARD_LOG"
echo "══════════════════════════════════════════════════"
