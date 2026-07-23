#!/usr/bin/env bash
set -euo pipefail

# verify-endpoints.sh — E2E smoke test for production-critical API endpoints
# Usage: ./scripts/verify-endpoints.sh [BASE_URL]
# Default BASE_URL: http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected_status="${4:-200}"
  local body="${5:-}"

  local status
  if [ "$method" = "GET" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}${path}" 2>/dev/null || echo "000")
  elif [ "$method" = "POST" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST -H "Content-Type: application/json" -d "${body:-{}}" "${BASE_URL}${path}" 2>/dev/null || echo "000")
  elif [ "$method" = "PATCH" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X PATCH -H "Content-Type: application/json" -d "${body:-{}}" "${BASE_URL}${path}" 2>/dev/null || echo "000")
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

# 5.2: Core health check
check "System health" "GET" "/api/system/health-deep" "200"
check "System diagnostics" "GET" "/api/system/diagnostics" "200"

# 5.3: Dashboard summary
check "Dashboard summary" "GET" "/api/dashboard/summary" "200"

# 5.4: Audit vault verify
check "Audit vault verify" "POST" "/api/audit/vault/verify" "200" '{"anchorId":"test"}'

# 5.5: SSE stream availability (GET should return SSE headers)
check "SSE events stream" "GET" "/api/events" "200"
check "OS stream" "GET" "/api/os-stream" "200"

# 5.6: Governance endpoints
check "Governance proposed list" "GET" "/api/governance/proposed" "200"
check "Governance feed" "GET" "/api/governance/feed" "200"

# 5.7: Telemetry endpoints
check "Telemetry logs" "GET" "/api/telemetry/logs" "200"
check "Telemetry stats" "GET" "/api/telemetry/stats" "200"

# 5.8: Think endpoints
check "Think trajectories" "GET" "/api/think/trajectories" "200"
check "Think anomalies" "GET" "/api/think/anomalies" "200"

# 5.9: Memory endpoints
check "Memory recall" "GET" "/api/memory/recall?query=test" "200"

# 5.10: POST-based endpoints (basic connectivity)
check "Telemetry batch ingest" "POST" "/api/telemetry/ingest/batch" "200" '{"events":[]}'
check "Agent evaluate" "POST" "/api/agents/evaluate" "200" '{}'

echo ""
echo "=========================================="
echo " Results: ${PASS} passed, ${FAIL} failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
