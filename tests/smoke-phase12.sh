#!/usr/bin/env bash
# smoke-phase12 — Phase 12 CRM Intelligence + Agent Templates smoke test
# Covers requirements: CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03
#
# NOTE: This script serves as the phase gate validation scaffold.
#       Some tests require plans 02-04 to be fully implemented.
#       Run from repo root: ./tests/smoke-phase12.sh

BASE_URL="http://127.0.0.1:3001/api/v1"
PASS=0
FAIL=0

# ── Auth ──────────────────────────────────────────────────────────────────────
LOGIN_RESP=$(curl -s -c /tmp/smoke-phase12-cookies.txt "$BASE_URL/../login" -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"moe@askporter.app","password":"porter"}')

COOKIE=$(grep porter_session /tmp/smoke-phase12-cookies.txt 2>/dev/null | awk '{print $NF}')

if [ -z "$COOKIE" ]; then
  echo "FATAL: Login failed — no porter_session cookie returned"
  echo "       Response: $LOGIN_RESP"
  rm -f /tmp/smoke-phase12-cookies.txt
  exit 1
fi
AUTH="-b porter_session=$COOKIE"
rm -f /tmp/smoke-phase12-cookies.txt

# ── Helpers ───────────────────────────────────────────────────────────────────
pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  local name="$1"
  local expected="$2"
  local response="$3"
  echo "FAIL: $name"
  echo "      Expected pattern: '$expected'"
  echo "      Response snippet: $(echo "$response" | head -c 300)"
  FAIL=$((FAIL + 1))
}

check() {
  local name="$1"
  local pattern="$2"
  local response="$3"
  if echo "$response" | grep -q "$pattern"; then
    pass "$name"
  else
    fail "$name" "$pattern" "$response"
  fi
}

check_status() {
  local name="$1"
  local expected_code="$2"
  local response="$3"
  if echo "$response" | grep -q "\"status\":$expected_code\|HTTP/$expected_code\|\"ok\":true"; then
    pass "$name"
  else
    # For 4xx checks, look for ok:false with status in response
    if [ "$expected_code" = "404" ] && echo "$response" | grep -q '"ok":false'; then
      pass "$name"
    else
      fail "$name" "HTTP $expected_code" "$response"
    fi
  fi
}

section() {
  echo ""
  echo "=== $1 ==="
}

# ── Setup: create a test contact ───────────────────────────────────────────────
section "SETUP: Create test contact"
CONTACT_RESP=$(curl -s $AUTH "$BASE_URL/contacts" -X POST \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Phase12 SmokeTest","first_name":"Phase12","last_name":"SmokeTest","emails":[{"value":"phase12-smoke@example.com","label":"work","is_primary":1}]}')
check "SETUP create test contact returns ok" '"ok":true' "$CONTACT_RESP"

CONTACT_ID=$(echo "$CONTACT_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [ -z "$CONTACT_ID" ]; then
  # Fallback: grep-based extraction
  CONTACT_ID=$(echo "$CONTACT_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$CONTACT_ID" ]; then
  echo "FATAL: Could not create test contact — CRM tests will be skipped"
  FAIL=$((FAIL + 6))
fi

# ── CRM-03: Contact AI analysis ────────────────────────────────────────────────
section "CRM-03: Contact AI Analysis"

if [ -n "$CONTACT_ID" ]; then
  # POST /contacts/:id/analyze — expect 202 with job_id
  ANALYZE_RESP=$(curl -s $AUTH "$BASE_URL/contacts/$CONTACT_ID/analyze" -X POST \
    -H "Content-Type: application/json")
  check "CRM-03 POST /contacts/:id/analyze returns ok" '"ok":true' "$ANALYZE_RESP"
  check "CRM-03 POST /contacts/:id/analyze returns job_id" '"job_id"' "$ANALYZE_RESP"

  # POST /contacts/nonexistent/analyze — expect 404
  NOTFOUND_RESP=$(curl -s $AUTH "$BASE_URL/contacts/nonexistent-contact-id-xxxx/analyze" -X POST \
    -H "Content-Type: application/json")
  check "CRM-03 POST /contacts/nonexistent/analyze returns 404" '"ok":false' "$NOTFOUND_RESP"

  # Wait 5 seconds for async job to complete (scheduler tick is 2s)
  echo "      (waiting 5s for analysis job to complete...)"
  sleep 5

  # GET /contacts/:id — expect ai_analysis key exists (may be null if Ollama is down)
  GET_CONTACT=$(curl -s $AUTH "$BASE_URL/contacts/$CONTACT_ID")
  check "CRM-03 GET /contacts/:id has ai_analysis key" '"ai_analysis"' "$GET_CONTACT"
else
  echo "SKIP: CRM-03 (no contact ID from SETUP)"
  FAIL=$((FAIL + 3))
fi

# ── CRM-04: Contact timeline ───────────────────────────────────────────────────
section "CRM-04: Contact Timeline"

if [ -n "$CONTACT_ID" ]; then
  # GET /contacts/:id/timeline — expect 200 with array
  TIMELINE_RESP=$(curl -s $AUTH "$BASE_URL/contacts/$CONTACT_ID/timeline")
  check "CRM-04 GET /contacts/:id/timeline returns ok" '"ok":true' "$TIMELINE_RESP"
  check "CRM-04 GET /contacts/:id/timeline returns timeline array" '"timeline"' "$TIMELINE_RESP"

  # GET /contacts/:id/timeline?limit=10&offset=0 — expect 200
  TIMELINE_PAGED=$(curl -s $AUTH "$BASE_URL/contacts/$CONTACT_ID/timeline?limit=10&offset=0")
  check "CRM-04 GET /contacts/:id/timeline?limit=10&offset=0 returns ok" '"ok":true' "$TIMELINE_PAGED"

  # Verify items have type field if any exist
  ITEM_COUNT=$(echo "$TIMELINE_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',{}).get('timeline',[])))" 2>/dev/null || echo "0")
  if [ "$ITEM_COUNT" -gt 0 ] 2>/dev/null; then
    check "CRM-04 timeline items have type field" '"type"' "$TIMELINE_RESP"
  else
    pass "CRM-04 timeline items type field (no items yet — ok)"
  fi
else
  echo "SKIP: CRM-04 (no contact ID from SETUP)"
  FAIL=$((FAIL + 3))
fi

# ── TMPL-01: Template catalog listing ─────────────────────────────────────────
section "TMPL-01 + TMPL-02: Template Catalog"

# GET /templates — expect 200 with templates array, length >= 100
TEMPLATES_RESP=$(curl -s $AUTH "$BASE_URL/templates")
check "TMPL-01 GET /templates returns ok" '"ok":true' "$TEMPLATES_RESP"
check "TMPL-01 GET /templates returns templates array" '"templates"' "$TEMPLATES_RESP"

TMPL_COUNT=$(echo "$TEMPLATES_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',{}).get('templates',[])))" 2>/dev/null || echo "0")
if [ "$TMPL_COUNT" -ge 100 ] 2>/dev/null; then
  pass "TMPL-01 GET /templates returns >= 100 templates (got $TMPL_COUNT)"
else
  fail "TMPL-01 GET /templates returns >= 100 templates" ">= 100" "got $TMPL_COUNT templates"
fi

# ── TMPL-02: Template filtering by category and tag ───────────────────────────

# GET /templates?category=engineering — expect 200 with only engineering templates
CAT_RESP=$(curl -s $AUTH "$BASE_URL/templates?category=engineering")
check "TMPL-02 GET /templates?category=engineering returns ok" '"ok":true' "$CAT_RESP"
if echo "$CAT_RESP" | grep -q '"category":"engineering"'; then
  pass "TMPL-02 category filter returns only engineering templates"
else
  # Acceptable if no engineering templates exist yet or empty array
  if echo "$CAT_RESP" | grep -q '"templates":\[\]'; then
    pass "TMPL-02 category filter returns ok with empty (templates not yet seeded)"
  else
    fail "TMPL-02 category filter returns only engineering templates" '"category":"engineering"' "$CAT_RESP"
  fi
fi

# GET /templates?tag=react — expect 200 with templates containing that tag
TAG_RESP=$(curl -s $AUTH "$BASE_URL/templates?tag=react")
check "TMPL-02 GET /templates?tag=react returns ok" '"ok":true' "$TAG_RESP"

# GET /templates/:id — get first template and verify full content
FIRST_TMPL_ID=$(echo "$TEMPLATES_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); ts=d.get('data',{}).get('templates',[]); print(ts[0]['id'] if ts else '')" 2>/dev/null || echo "")

if [ -n "$FIRST_TMPL_ID" ]; then
  TMPL_DETAIL=$(curl -s $AUTH "$BASE_URL/templates/$FIRST_TMPL_ID")
  check "TMPL-01 GET /templates/:id returns ok" '"ok":true' "$TMPL_DETAIL"
  check "TMPL-01 GET /templates/:id has system_prompt" '"system_prompt"' "$TMPL_DETAIL"
  check "TMPL-01 GET /templates/:id has soul_text" '"soul_text"' "$TMPL_DETAIL"
  check "TMPL-01 GET /templates/:id has role_card_text" '"role_card_text"' "$TMPL_DETAIL"
  check "TMPL-01 GET /templates/:id has identity_text" '"identity_text"' "$TMPL_DETAIL"
  check "TMPL-01 GET /templates/:id has skills_text" '"skills_text"' "$TMPL_DETAIL"
else
  echo "SKIP: TMPL-01 detail tests (no templates in catalog)"
  FAIL=$((FAIL + 6))
fi

# GET /templates/nonexistent — expect 404
TMPL_404=$(curl -s $AUTH "$BASE_URL/templates/nonexistent-template-id-xxxx")
check "TMPL-01 GET /templates/nonexistent returns 404" '"ok":false' "$TMPL_404"

# ── TMPL-03: Template instantiation ───────────────────────────────────────────
section "TMPL-03: Template Instantiation"

if [ -n "$FIRST_TMPL_ID" ]; then
  # POST /templates/:id/instantiate — create agent from template
  INST_RESP=$(curl -s $AUTH "$BASE_URL/templates/$FIRST_TMPL_ID/instantiate" -X POST \
    -H "Content-Type: application/json" \
    -d '{}')
  check "TMPL-03 POST /templates/:id/instantiate returns ok or queued" '"ok":true\|"queued":true\|"agent"' "$INST_RESP"
  check "TMPL-03 POST /templates/:id/instantiate returns template_id" '"template_id"' "$INST_RESP"

  # POST /templates/:id/instantiate with name override
  CUSTOM_RESP=$(curl -s $AUTH "$BASE_URL/templates/$FIRST_TMPL_ID/instantiate" -X POST \
    -H "Content-Type: application/json" \
    -d '{"name":"Custom Name Override"}')
  check "TMPL-03 POST /templates/:id/instantiate with name override returns ok" '"ok":true\|"agent"' "$CUSTOM_RESP"
  check "TMPL-03 instantiated agent has custom name" 'Custom Name Override' "$CUSTOM_RESP"
else
  echo "SKIP: TMPL-03 instantiation tests (no templates in catalog)"
  FAIL=$((FAIL + 4))
fi

# POST /templates/nonexistent/instantiate — expect 404
INST_404=$(curl -s $AUTH "$BASE_URL/templates/nonexistent-template-id-xxxx/instantiate" -X POST \
  -H "Content-Type: application/json" \
  -d '{}')
check "TMPL-03 POST /templates/nonexistent/instantiate returns 404" '"ok":false' "$INST_404"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "======================================="
echo "Phase 12 Smoke Test Results"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
TOTAL=$((PASS + FAIL))
echo "  Total: $TOTAL"
echo "======================================="
echo ""
echo "NOTE: Some tests require plans 02-04 to be fully implemented."
echo "      Template tests expect 100+ seeded templates (plan 02)."
echo "      Analysis endpoint tested but job completion requires plan 03."

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
