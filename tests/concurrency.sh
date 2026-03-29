#!/usr/bin/env bash
# tests/concurrency.sh — Verify SQLite concurrency under load
# Usage: bash tests/concurrency.sh [base_url]
#
# Fires CONCURRENCY concurrent HTTP requests against the porter /api/health endpoint
# and checks responses for "database is locked" errors or HTTP 500 status codes.
# Exit 0 = PASS, Exit 1 = FAIL
set -euo pipefail

BASE_URL=${1:-http://127.0.0.1:3001}
CONCURRENCY=10
FAIL=0

echo "Running $CONCURRENCY concurrent requests against $BASE_URL..."

# Fire concurrent requests using background processes
for i in $(seq 1 $CONCURRENCY); do
  curl -s -o /tmp/conc_resp_$i.txt -w "%{http_code}" "${BASE_URL}/api/health" > /tmp/conc_code_$i.txt 2>&1 &
done

# Wait for all to complete
wait

# Check responses for lock errors or 500s
for i in $(seq 1 $CONCURRENCY); do
  code=$(cat /tmp/conc_code_$i.txt 2>/dev/null || echo "000")
  body=$(cat /tmp/conc_resp_$i.txt 2>/dev/null || echo "")
  if echo "$body" | grep -qi "database is locked"; then
    echo "FAIL: Request $i got database locked error"
    FAIL=1
  fi
  if [ "$code" = "500" ]; then
    echo "FAIL: Request $i returned 500 — body: $(echo "$body" | head -c 200)"
    FAIL=1
  fi
done

# Cleanup temp files
rm -f /tmp/conc_resp_*.txt /tmp/conc_code_*.txt

if [ $FAIL -eq 0 ]; then
  echo "PASS: All $CONCURRENCY concurrent requests completed without lock errors"
  exit 0
else
  echo "FAIL: Database lock errors detected under concurrent load"
  exit 1
fi
