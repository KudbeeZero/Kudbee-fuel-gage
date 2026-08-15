#!/usr/bin/env bash
set -euo pipefail

# verify-endpoints.sh — E2E smoke test for production-critical API endpoints
# Usage: ./scripts/verify-endpoints.sh [BASE_URL]
# Default BASE_URL: http://localhost:3000
#
# Protected endpoints are tested with a valid test bearer token derived from
# STREAM_SECRET (never printed). Anonymous access to protected endpoints is
# asserted as 401. Public/health endpoints are asserted as reachable.

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Build a valid test bearer token from STREAM_SECRET (throwaway, never printed).
if [ -n "${STREAM_SECRET:-}" ]; then
  AUTH="$(node -e '
    const { createHmac } = require("crypto");
    const secret = process.env.STREAM_SECRET;
    const iat = Date.now();
    const payload = Buffer.from(JSON.stringify({ agentId: "smoke-operator", iat, roles: ["OPERATOR"] })).toString("base64url");
    const sig = createHmac("sha256", secret).update("smoke-operator:" + iat).digest("hex");
    process.stdout.write("Bearer " + payload + "." + sig);
  ')"
else
  AUTH=""
fi

check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected_status="${4:-200}"
  local body="${5:-}"
  local auth_header="${6:-}"

  local curl_args=(-s -o /dev/null -w "%{http_code}" --max-time 10)
  if [ -n "$auth_header" ]; then
    curl_args+=(-H "Authorization: $auth_header")
  fi

  # NB: avoid ${body:-{}} — the brace-in-default expands to malformed '{}}'.
  local data="$body"
  [ -z "$data" ] && data='{}'

  local status
  if [ "$method" = "GET" ]; then
    status=$(curl "${curl_args[@]}" "${BASE_URL}${path}" 2>/dev/null || echo "000")
  elif [ "$method" = "POST" ]; then
    status=$(curl "${curl_args[@]}" -X POST -H "Content-Type: application/json" -d "$data" "${BASE_URL}${path}" 2>/dev/null || echo "000")
  elif [ "$method" = "PATCH" ]; then
    status=$(curl "${curl_args[@]}" -X PATCH -H "Content-Type: application/json" -d "$data" "${BASE_URL}${path}" 2>/dev/null || echo "000")
  else
    status="000"
  fi

  if [ "$status" = "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC} [${status}] ${method} ${path}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}FAIL${NC} [${status}] ${method} ${path} (expected ${expected_status})"
    FAIL=$((FAIL + 1))
  fi
}

echo "=========================================="
echo " Kudbee Production Endpoint Smoke Test"
echo " Target: ${BASE_URL}"
echo "=========================================="
echo ""

# ── Public / health (must stay reachable) ─────────────────────────────────
check "System health" "GET" "/api/system/health-deep" "200"
check "System diagnostics" "GET" "/api/system/diagnostics" "200"
check "Dashboard summary" "GET" "/api/dashboard/summary" "200"
check "Telemetry logs" "GET" "/api/telemetry/logs" "200"
check "Telemetry stats" "GET" "/api/telemetry/stats" "200"

# ── Anonymous access to protected endpoints must be rejected (401) ────────
check "Anonymous governance (401)" "GET" "/api/governance/tenants" "401"
check "Anonymous agents (401)" "POST" "/api/agents/verify" "401" '{}'
check "Anonymous memory (401)" "GET" "/api/memory/recall?query=test" "401"
check "Anonymous think (401)" "GET" "/api/think/trajectories?limit=5" "401"
check "Anonymous terminal (401)" "POST" "/api/terminal/execute" "401" '{"command":"echo no"}'
check "Anonymous filesystem (401)" "POST" "/api/tools/fs/read" "401" '{"path":"/tmp/x"}'

# ── Protected endpoints with valid credentials (auth must PASS) ────────────
# 401 = auth failed; 403 = auth passed but authorization failed; 200 = allowed.
# We assert the request is NOT rejected by authentication (status != 401).
check_authed() {
  local label="$1" method="$2" path="$3" body="${4:-}" auth_header="$5"
  local data="$body"; [ -z "$data" ] && data='{}'
  local curl_args=(-s -o /dev/null -w "%{http_code}" --max-time 10 -H "Authorization: $auth_header")
  local status
  if [ "$method" = "GET" ]; then
    status=$(curl "${curl_args[@]}" "${BASE_URL}${path}" 2>/dev/null || echo "000")
  else
    status=$(curl "${curl_args[@]}" -X POST -H "Content-Type: application/json" -d "$data" "${BASE_URL}${path}" 2>/dev/null || echo "000")
  fi
  if [ "$status" != "401" ] && [ "$status" != "000" ]; then
    echo -e "${GREEN}PASS${NC} [${status}] ${method} ${path} (auth passed)"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}FAIL${NC} [${status}] ${method} ${path} (auth should pass)"
    FAIL=$((FAIL + 1))
  fi
}

if [ -n "$AUTH" ]; then
  check_authed "Auth governance tenants" "GET" "/api/governance/tenants" "" "$AUTH"
  check_authed "Auth telemetry logs" "GET" "/api/telemetry/logs" "" "$AUTH"
else
  echo -e "${RED}WARN${NC} STREAM_SECRET not set — skipping authenticated protected-route checks"
fi

echo ""
echo "=========================================="
echo " Results: ${PASS} passed, ${FAIL} failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
