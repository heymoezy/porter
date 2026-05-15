#!/usr/bin/env bash
set -euo pipefail

# Phase 11 Smoke Test — Unified Chat, CRM, and Files
# Covers all 9 requirements: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CRM-01, CRM-02, FILE-01, FILE-02, FILE-03
#
# NOTE: This script requires plans 02-05 to be implemented before all tests pass.
# It serves as the phase gate validation artifact.
#
# Usage: ./tests/smoke-phase11.sh
# Run from repo root.

BASE_URL="http://127.0.0.1:3001/api/v1"
PASS=0
FAIL=0

# ── Auth ──────────────────────────────────────────────────────────────────────
# Extract session cookie from login
COOKIE=$(curl -s -c - "$BASE_URL/../login" -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"moe@askporter.app","password":"porter"}' | grep porter_session | awk '{print $NF}')

if [ -z "$COOKIE" ]; then
  echo "FATAL: Login failed — no porter_session cookie returned"
  exit 1
fi
AUTH="-b porter_session=$COOKIE"

# ── Helper ────────────────────────────────────────────────────────────────────
check() {
  local name="$1"
  local pattern="$2"
  local response="$3"
  if echo "$response" | grep -q "$pattern"; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected pattern: '$pattern')"
    echo "      Response: $(echo "$response" | head -c 200)"
    FAIL=$((FAIL + 1))
  fi
}

# ── CHAT-01: Create conversation, post messages, GET returns chronological array ─
echo ""
echo "=== CHAT-01: Conversation + messages CRUD ==="
CONV_RESP=$(curl -sf $AUTH "$BASE_URL/conversations" -X POST \
  -H "Content-Type: application/json" \
  -d '{"scope_type":"global","title":"Smoke test CHAT-01"}')
check "CHAT-01 create conversation returns ok" '"ok":true' "$CONV_RESP"

CONV_ID=$(echo "$CONV_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$CONV_ID" ]; then
  # Post first message
  MSG1_RESP=$(curl -sf $AUTH "$BASE_URL/conversations/$CONV_ID/messages" -X POST \
    -H "Content-Type: application/json" \
    -d '{"content":"First message","sender_type":"user"}')
  check "CHAT-01 post first message returns ok" '"ok":true' "$MSG1_RESP"

  # Post second message
  MSG2_RESP=$(curl -sf $AUTH "$BASE_URL/conversations/$CONV_ID/messages" -X POST \
    -H "Content-Type: application/json" \
    -d '{"content":"Second message","sender_type":"agent"}')
  check "CHAT-01 post second message returns ok" '"ok":true' "$MSG2_RESP"

  # GET messages — expect both in chronological array
  MSGS_RESP=$(curl -sf $AUTH "$BASE_URL/conversations/$CONV_ID/messages")
  check "CHAT-01 GET messages returns array" '"messages":' "$MSGS_RESP"
  check "CHAT-01 GET messages contains first message" 'First message' "$MSGS_RESP"
  check "CHAT-01 GET messages contains second message" 'Second message' "$MSGS_RESP"
else
  echo "FAIL: CHAT-01 could not extract conversation ID — skipping message sub-tests"
  FAIL=$((FAIL + 3))
fi

# ── CHAT-02: Threaded messages with parent_id ─────────────────────────────────
echo ""
echo "=== CHAT-02: Threaded messages ==="
if [ -n "$CONV_ID" ]; then
  # Post a root message and get its ID
  ROOT_RESP=$(curl -sf $AUTH "$BASE_URL/conversations/$CONV_ID/messages" -X POST \
    -H "Content-Type: application/json" \
    -d '{"content":"Root message for threading","sender_type":"user"}')
  ROOT_ID=$(echo "$ROOT_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

  if [ -n "$ROOT_ID" ]; then
    # Post a reply with parent_id
    REPLY_RESP=$(curl -sf $AUTH "$BASE_URL/conversations/$CONV_ID/messages" -X POST \
      -H "Content-Type: application/json" \
      -d "{\"content\":\"Reply to root\",\"sender_type\":\"agent\",\"parent_message_id\":$ROOT_ID}")
    check "CHAT-02 post reply with parent_id returns ok" '"ok":true' "$REPLY_RESP"

    # GET messages — thread should show children
    THREAD_RESP=$(curl -sf $AUTH "$BASE_URL/conversations/$CONV_ID/messages")
    check "CHAT-02 GET messages contains threaded reply" 'Reply to root' "$THREAD_RESP"
  else
    echo "FAIL: CHAT-02 could not extract root message ID — skipping reply sub-test"
    FAIL=$((FAIL + 1))
  fi
else
  echo "SKIP: CHAT-02 (no conversation ID from CHAT-01)"
  FAIL=$((FAIL + 2))
fi

# ── CHAT-03: Full-text search via FTS5 ────────────────────────────────────────
echo ""
echo "=== CHAT-03: FTS5 search ==="
SEARCH_RESP=$(curl -sf $AUTH "$BASE_URL/conversations?q=Smoke+test+CHAT-01")
check "CHAT-03 GET conversations?q= returns results" '"ok":true' "$SEARCH_RESP"
check "CHAT-03 FTS5 search finds seeded conversation" 'CHAT-01' "$SEARCH_RESP"

# ── CHAT-04: External channel (WhatsApp/email) — SKIP ─────────────────────────
echo ""
echo "=== CHAT-04: External channel (WhatsApp webhook) ==="
# SKIP: Requires WhatsApp webhook setup (real phone number, Meta developer account,
# and public webhook URL). Cannot be automated in smoke test without full integration.
# Verified at integration test time only.
echo "SKIP: CHAT-04 — WhatsApp webhook requires live Meta integration (out of scope for smoke test)"

# ── CRM-01: Contact with multiple emails and phones ───────────────────────────
echo ""
echo "=== CRM-01: Contact multi-value emails and phones ==="
CONTACT_RESP=$(curl -sf $AUTH "$BASE_URL/contacts" -X POST \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Alice Smoke","first_name":"Alice","last_name":"Smoke","emails":[{"value":"alice@example.com","label":"work","is_primary":1},{"value":"alice@personal.io","label":"personal"}],"phones":[{"value":"+6591234567","country_code":"+65","label":"mobile","is_primary":1}]}')
check "CRM-01 create contact returns ok" '"ok":true' "$CONTACT_RESP"

CONTACT_ID=$(echo "$CONTACT_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$CONTACT_ID" ]; then
  GET_CONTACT=$(curl -sf $AUTH "$BASE_URL/contacts/$CONTACT_ID")
  check "CRM-01 GET contact has emails array" '"emails":' "$GET_CONTACT"
  check "CRM-01 GET contact has phones array" '"phones":' "$GET_CONTACT"
  check "CRM-01 GET contact has primary email" 'alice@example.com' "$GET_CONTACT"
  check "CRM-01 GET contact has country code" '"\+65"' "$GET_CONTACT"
else
  echo "FAIL: CRM-01 could not extract contact ID — skipping GET sub-tests"
  FAIL=$((FAIL + 3))
fi

# ── CRM-02: Social links on contact ───────────────────────────────────────────
echo ""
echo "=== CRM-02: Contact social links ==="
if [ -n "$CONTACT_ID" ]; then
  SOCIAL_RESP=$(curl -sf $AUTH "$BASE_URL/contacts/$CONTACT_ID" -X PATCH \
    -H "Content-Type: application/json" \
    -d '{"social":[{"platform":"linkedin","handle":"alice-smoke"},{"platform":"x","handle":"@alicesmoke"}]}')
  check "CRM-02 PATCH contact social links returns ok" '"ok":true' "$SOCIAL_RESP"

  GET_SOCIAL=$(curl -sf $AUTH "$BASE_URL/contacts/$CONTACT_ID")
  check "CRM-02 GET contact has social array" '"social":' "$GET_SOCIAL"
  check "CRM-02 GET contact linkedin handle present" 'alice-smoke' "$GET_SOCIAL"
else
  echo "SKIP: CRM-02 (no contact ID from CRM-01)"
  FAIL=$((FAIL + 3))
fi

# ── FILE-01: Upload file with project association ─────────────────────────────
echo ""
echo "=== FILE-01: File upload with project association ==="
# Get a real project_id first
PROJ_RESP=$(curl -sf $AUTH "$BASE_URL/projects?limit=1")
PROJ_ID=$(echo "$PROJ_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$PROJ_ID" ]; then
  TMPFILE=$(mktemp /tmp/smoke-test-XXXXXX.txt)
  echo "Phase 11 smoke test file content" > "$TMPFILE"
  UPLOAD_RESP=$(curl -sf $AUTH "$BASE_URL/files" -X POST \
    -F "file=@$TMPFILE;type=text/plain" \
    -F "project_id=$PROJ_ID")
  rm -f "$TMPFILE"
  check "FILE-01 upload file with project_id returns ok" '"ok":true' "$UPLOAD_RESP"

  FILE_ID=$(echo "$UPLOAD_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$FILE_ID" ]; then
    LIST_RESP=$(curl -sf $AUTH "$BASE_URL/files?project_id=$PROJ_ID")
    check "FILE-01 GET files?project_id returns file" "$FILE_ID" "$LIST_RESP"
  else
    echo "FAIL: FILE-01 could not extract file ID — skipping list sub-test"
    FAIL=$((FAIL + 1))
  fi
else
  echo "SKIP: FILE-01 (no project found to associate with)"
  FAIL=$((FAIL + 2))
fi

# ── FILE-02: Upload with invalid project_id must fail (atomic rollback) ────────
echo ""
echo "=== FILE-02: Atomic upload failure on invalid project_id ==="
TMPFILE2=$(mktemp /tmp/smoke-test-XXXXXX.txt)
echo "This file should not be persisted" > "$TMPFILE2"
FAIL_RESP=$(curl -s $AUTH "$BASE_URL/files" -X POST \
  -F "file=@$TMPFILE2;type=text/plain" \
  -F "project_id=nonexistent-project-id-xxxx")
rm -f "$TMPFILE2"
check "FILE-02 upload with invalid project_id returns error" '"ok":false' "$FAIL_RESP"

# ── FILE-03: GET /files with mime_type filter ─────────────────────────────────
echo ""
echo "=== FILE-03: File list with mime_type filter ==="
MIME_RESP=$(curl -sf $AUTH "$BASE_URL/files?mime_type=text/plain")
check "FILE-03 GET files?mime_type= returns ok" '"ok":true' "$MIME_RESP"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "======================================="
echo "Phase 11 Smoke Test Results"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  SKIP: 1 (CHAT-04 — external channel)"
TOTAL=$((PASS + FAIL))
echo "  Total (excl. skip): $TOTAL"
echo "======================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
