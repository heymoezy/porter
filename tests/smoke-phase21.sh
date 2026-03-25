#!/usr/bin/env bash
# smoke-phase21 — Phase 21 First-Run Setup smoke test
# Covers requirements: FRS-01, FRS-02, FRS-03, FRS-04
#
# Run from repo root: bash tests/smoke-phase21.sh

set -euo pipefail

BASE_URL="http://127.0.0.1:3001/api/v1"
PGCONNSTR="postgresql://lobster:porter@127.0.0.1:5432/porter"

PASSED=0
FAILED=0
SKIPPED=0

pass() {
  PASSED=$((PASSED + 1))
  echo "  PASS: $1"
}

fail() {
  FAILED=$((FAILED + 1))
  echo "  FAIL: $1"
}

skip() {
  SKIPPED=$((SKIPPED + 1))
  echo "  SKIP: $1"
}

# ── Auth ──────────────────────────────────────────────────────────────────────
echo ""
echo "=== Auth ==="
LOGIN_RESP=$(curl -s -c /tmp/smoke-ph21-cookies.txt "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"moe@askporter.app","password":"porter"}')

if echo "$LOGIN_RESP" | grep -q '"ok":true'; then
  pass "Login as admin"
else
  fail "Login as admin"
  echo "Cannot proceed without auth. Exiting."
  exit 1
fi

# ── FRS-01: Detection endpoint ────────────────────────────────────────────────
echo ""
echo "=== FRS-01: Detection endpoint ==="

DETECT_RESP=$(curl -s -b /tmp/smoke-ph21-cookies.txt "$BASE_URL/bridge/detect")

if echo "$DETECT_RESP" | grep -q '"ok":true'; then
  pass "GET /bridge/detect returns ok"
else
  fail "GET /bridge/detect returns ok"
fi

if echo "$DETECT_RESP" | grep -q '"gateways"'; then
  pass "Response contains gateways array"
else
  fail "Response contains gateways array"
fi

if echo "$DETECT_RESP" | grep -q '"zeroConfigReady"'; then
  pass "Response contains zeroConfigReady"
else
  fail "Response contains zeroConfigReady"
fi

if echo "$DETECT_RESP" | grep -q '"detectedAt"'; then
  pass "Response contains detectedAt timestamp"
else
  fail "Response contains detectedAt timestamp"
fi

# ── FRS-02: Guided setup API ─────────────────────────────────────────────────
echo ""
echo "=== FRS-02: Guided setup API ==="

# Step 1: /setup/detect
SETUP_DETECT=$(curl -s -b /tmp/smoke-ph21-cookies.txt -X POST "$BASE_URL/bridge/setup/detect")
if echo "$SETUP_DETECT" | grep -q '"gateways"'; then
  pass "POST /setup/detect returns gateways"
else
  fail "POST /setup/detect returns gateways"
fi

# Step 2: /setup/validate (for ollama — should exist from detection)
SETUP_VALIDATE=$(curl -s -b /tmp/smoke-ph21-cookies.txt -X POST "$BASE_URL/bridge/setup/validate" \
  -H "Content-Type: application/json" \
  -d '{"type":"ollama"}')
if echo "$SETUP_VALIDATE" | grep -q '"ok":true'; then
  pass "POST /setup/validate for ollama returns ok"
else
  fail "POST /setup/validate for ollama returns ok"
fi

# Step 3: /setup/validate for nonexistent type returns structured error
SETUP_VALIDATE_MISSING=$(curl -s -b /tmp/smoke-ph21-cookies.txt -X POST "$BASE_URL/bridge/setup/validate" \
  -H "Content-Type: application/json" \
  -d '{"type":"openai_compat"}')
if echo "$SETUP_VALIDATE_MISSING" | grep -q 'GATEWAY_NOT_FOUND\|valid.*false\|error'; then
  pass "POST /setup/validate for missing gateway returns structured error (not 500)"
else
  fail "POST /setup/validate for missing gateway returns structured error"
fi

# Step 4: /setup/save (enable ollama)
SETUP_SAVE=$(curl -s -b /tmp/smoke-ph21-cookies.txt -X POST "$BASE_URL/bridge/setup/save" \
  -H "Content-Type: application/json" \
  -d '{"type":"ollama","enabled":true}')
if echo "$SETUP_SAVE" | grep -q '"saved":true'; then
  pass "POST /setup/save enables gateway"
else
  fail "POST /setup/save enables gateway"
fi

# ── FRS-03: Zero-config path ────────────────────────────────────────────────
echo ""
echo "=== FRS-03: Zero-config Ollama path ==="

# Check if Ollama is running locally
if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
  if echo "$DETECT_RESP" | grep -q '"zeroConfigReady":true'; then
    pass "zeroConfigReady is true (Ollama running)"
  else
    fail "zeroConfigReady should be true when Ollama is running"
  fi
else
  skip "Ollama not running locally — cannot verify zeroConfigReady=true"
fi

# ── FRS-04: OpenClaw dual-role ───────────────────────────────────────────────
echo ""
echo "=== FRS-04: OpenClaw dual-role ==="

OPENCLAW_META=$(psql "$PGCONNSTR" -t -c "SELECT metadata FROM gateways WHERE type='openclaw' LIMIT 1" 2>/dev/null || echo "")

if echo "$OPENCLAW_META" | grep -q 'gateway_roles'; then
  pass "OpenClaw metadata contains gateway_roles"
else
  if [ -z "$OPENCLAW_META" ]; then
    skip "No OpenClaw gateway row (OPENCLAW_TOKEN not set?)"
  else
    fail "OpenClaw metadata missing gateway_roles"
  fi
fi

if echo "$OPENCLAW_META" | grep -q 'messaging_gateway'; then
  pass "gateway_roles includes messaging_gateway"
else
  if [ -z "$OPENCLAW_META" ]; then
    skip "No OpenClaw gateway row"
  else
    fail "gateway_roles missing messaging_gateway"
  fi
fi

if echo "$OPENCLAW_META" | grep -q 'ai_dispatch'; then
  pass "gateway_roles includes ai_dispatch"
else
  if [ -z "$OPENCLAW_META" ]; then
    skip "No OpenClaw gateway row"
  else
    fail "gateway_roles missing ai_dispatch"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Results ==="
echo "  Passed:  $PASSED"
echo "  Failed:  $FAILED"
echo "  Skipped: $SKIPPED"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "SMOKE TEST FAILED"
  exit 1
else
  echo "SMOKE TEST PASSED"
fi
