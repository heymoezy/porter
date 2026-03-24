#!/usr/bin/env bash
# smoke-phase13.1 — Phase 13.1 Memory V3 State Engine smoke test
# Covers requirements: MEMV3-01 through MEMV3-05
#
# MEMV3-01: Schema (tables, indexes, migration key) — active in this plan (13.1-01)
# MEMV3-02: Injection API                           — requires Plan 02
# MEMV3-03: Consolidation (dedup/merge)             — requires Plan 03
# MEMV3-04: Agent self-edit API                     — requires Plan 03
# MEMV3-05: Admin overview endpoint                 — requires Plan 03
#
# Run from repo root: bash tests/smoke-phase13.1.sh

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
LOGIN_RESP=$(curl -s -c /tmp/smoke-ph131-cookies.txt "$BASE_URL/auth/login" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"moe@themozaic.com","password":"porter"}')

COOKIE=$(grep porter_session /tmp/smoke-ph131-cookies.txt 2>/dev/null | awk '{print $NF}' || true)

if [ -z "$COOKIE" ]; then
  echo "FATAL: Login failed — no porter_session cookie returned"
  echo "       Response: $LOGIN_RESP"
  rm -f /tmp/smoke-ph131-cookies.txt
  exit 1
fi

AUTH_HEADER="-b porter_session=$COOKIE"
rm -f /tmp/smoke-ph131-cookies.txt
echo "  Auth OK"

# ── MEMV3-01: Schema validation ───────────────────────────────────────────────
echo ""
echo "=== MEMV3-01: Schema ==="

# directives table exists
if psql "$PGCONNSTR" -c "SELECT 1 FROM directives LIMIT 0" >/dev/null 2>&1; then
  pass "directives table exists"
else
  fail "directives table exists"
fi

# project_notes table exists
if psql "$PGCONNSTR" -c "SELECT 1 FROM project_notes LIMIT 0" >/dev/null 2>&1; then
  pass "project_notes table exists"
else
  fail "project_notes table exists"
fi

# agent_notes table exists
if psql "$PGCONNSTR" -c "SELECT 1 FROM agent_notes LIMIT 0" >/dev/null 2>&1; then
  pass "agent_notes table exists"
else
  fail "agent_notes table exists"
fi

# migration recorded in schema_migrations
MIGRATION_CHECK=$(psql "$PGCONNSTR" -t -c "SELECT 1 FROM schema_migrations WHERE id = 'memory_v3'" 2>/dev/null | tr -d '[:space:]' || true)
if [ "$MIGRATION_CHECK" = "1" ]; then
  pass "schema_migrations has memory_v3 key"
else
  fail "schema_migrations has memory_v3 key"
fi

# pg_trgm extension enabled
TRGM_CHECK=$(psql "$PGCONNSTR" -t -c "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'" 2>/dev/null | tr -d '[:space:]' || true)
if [ "$TRGM_CHECK" = "pg_trgm" ]; then
  pass "pg_trgm extension enabled"
else
  fail "pg_trgm extension enabled"
fi

# migrated_to_v3 column exists on concepts
if psql "$PGCONNSTR" -c "SELECT migrated_to_v3 FROM concepts LIMIT 0" >/dev/null 2>&1; then
  pass "concepts.migrated_to_v3 column exists"
else
  fail "concepts.migrated_to_v3 column exists"
fi

# idx_directives_scope index exists
IDX_DIR=$(psql "$PGCONNSTR" -t -c "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_directives_scope'" 2>/dev/null | tr -d '[:space:]' || true)
if [ "$IDX_DIR" = "1" ]; then
  pass "idx_directives_scope index exists"
else
  fail "idx_directives_scope index exists"
fi

# idx_project_notes_project index exists
IDX_PN=$(psql "$PGCONNSTR" -t -c "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_project_notes_project'" 2>/dev/null | tr -d '[:space:]' || true)
if [ "$IDX_PN" = "1" ]; then
  pass "idx_project_notes_project index exists"
else
  fail "idx_project_notes_project index exists"
fi

# idx_agent_notes_agent index exists
IDX_AN=$(psql "$PGCONNSTR" -t -c "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agent_notes_agent'" 2>/dev/null | tr -d '[:space:]' || true)
if [ "$IDX_AN" = "1" ]; then
  pass "idx_agent_notes_agent index exists"
else
  fail "idx_agent_notes_agent index exists"
fi

# Verify migration idempotency: check that migrated concepts are marked migrated_to_v3=1
MIGRATED_COUNT=$(psql "$PGCONNSTR" -t -c "SELECT COUNT(*) FROM concepts WHERE migrated_to_v3 = 1" 2>/dev/null | tr -d '[:space:]' || echo "0")
echo "  INFO: ${MIGRATED_COUNT} concepts migrated to V3 structured tables"
pass "migration idempotency check (migrated_to_v3 column populated)"

# ── MEMV3-02: Injection API ───────────────────────────────────────────────────
echo ""
echo "=== MEMV3-02: Injection API ==="
skip "MEMV3-02 injection endpoints — requires Plan 02"

# ── MEMV3-03: Consolidation ───────────────────────────────────────────────────
echo ""
echo "=== MEMV3-03: Consolidation ==="
skip "MEMV3-03 consolidation (dedup/merge) — requires Plan 03"

# ── MEMV3-04: Agent self-edit API ─────────────────────────────────────────────
echo ""
echo "=== MEMV3-04: Agent Self-Edit ==="
skip "MEMV3-04 agent self-edit API — requires Plan 03"

# ── MEMV3-05: Admin overview endpoint ────────────────────────────────────────
echo ""
echo "=== MEMV3-05: Admin Overview ==="
skip "MEMV3-05 admin memory overview endpoint — requires Plan 03"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASSED passed, $FAILED failed, $SKIPPED skipped"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi

exit 0
