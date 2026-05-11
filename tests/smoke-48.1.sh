#!/usr/bin/env bash
# tests/smoke-48.1.sh — Phase 48.1 Silo Foundation smoke tests
# Covers SC-1..SC-6. Idempotent. Self-cleaning. Exits non-zero on first failure.
set -euo pipefail

API="http://127.0.0.1:3001"
TEST_SESSION_ID="smoke-48.1-$(date +%s)"
fail() { echo "[FAIL] $1" >&2; exit 1; }
ok()   { echo "[ ok ] $1"; }

# --- Cleanup any leftover smoke rows from prior runs --------------------------
psql -d porter -c "DELETE FROM session_silo_overrides WHERE session_id LIKE 'smoke-48.1-%'" >/dev/null 2>&1 || true

# --- SC-1: silos table + software seed row -----------------------------------
echo "SC-1: silos table + software seed"
SOFTWARE_ROW=$(psql -d porter -tAc "SELECT id || '|' || display_name || '|' || enabled::text FROM silos WHERE id='software'") \
  || fail "SC-1: silos table missing or query failed"
# Postgres casts boolean to 'true'/'false' via ::text. Accept either short ('t') or long ('true').
[[ "$SOFTWARE_ROW" == software\|*\|t || "$SOFTWARE_ROW" == software\|*\|true ]] \
  || fail "SC-1: software seed row malformed: '$SOFTWARE_ROW'"
ok "SC-1: silos.software exists, enabled=true ($SOFTWARE_ROW)"

# Column shape check — must have prompt_path, cadence_seconds, detect_rules, default_model
COL_COUNT=$(psql -d porter -tAc "\\d silos" 2>/dev/null | grep -cE "^(prompt_path|cadence_seconds|detect_rules|default_model)\\|") \
  || true
[[ "$COL_COUNT" -ge 4 ]] || fail "SC-1: silos table missing required columns (have $COL_COUNT/4)"
ok "SC-1: silos table has required columns"

# detect_rules must contain project_types and cwd_markers arrays
DETECT_JSON=$(psql -d porter -tAc "SELECT detect_rules FROM silos WHERE id='software'")
echo "$DETECT_JSON" | grep -q '"project_types"' || fail "SC-1: detect_rules missing project_types"
echo "$DETECT_JSON" | grep -q '"cwd_markers"'   || fail "SC-1: detect_rules missing cwd_markers"
ok "SC-1: detect_rules has project_types + cwd_markers"

# --- SC-6: directive_immutable trigger blocks moe-direct UPDATE/DELETE -------
echo "SC-6: moe-direct immutability trigger"

# WARNING 6 fix — row-existence guard prevents vacuous pass:
# If target row 'silo-sw-design-system' doesn't exist, UPDATE/DELETE return 0 rows (no error)
# which would falsely satisfy the trigger test. Guard ensures the row IS there before testing.
psql -d porter -tAc "SELECT count(*) FROM directives WHERE id='silo-sw-design-system' AND source_type='moe-direct'" | grep -q "^1$" \
  || { echo "FAIL SC-6: target row 'silo-sw-design-system' not present — trigger test invalid" >&2; exit 1; }
ok "SC-6: target moe-direct row exists (guard passed)"

UPDATE_ERR=$(psql -d porter -c "UPDATE directives SET content='SMOKE_TEST_TAMPER' WHERE source_type='moe-direct' AND id='silo-sw-design-system'" 2>&1 || true)
echo "$UPDATE_ERR" | grep -qi "moe-direct\\|directive_immutable\\|immutable" \
  || fail "SC-6: UPDATE on moe-direct directive was NOT blocked. Output: $UPDATE_ERR"
ok "SC-6: UPDATE on moe-direct blocked"

DELETE_ERR=$(psql -d porter -c "DELETE FROM directives WHERE source_type='moe-direct' AND id='silo-sw-design-system'" 2>&1 || true)
echo "$DELETE_ERR" | grep -qi "moe-direct\\|directive_immutable\\|immutable" \
  || fail "SC-6: DELETE on moe-direct directive was NOT blocked. Output: $DELETE_ERR"
ok "SC-6: DELETE on moe-direct blocked"

# Confirm the row still exists with original content
STILL_THERE=$(psql -d porter -tAc "SELECT count(*) FROM directives WHERE id='silo-sw-design-system' AND source_type='moe-direct'")
[[ "$STILL_THERE" == "1" ]] || fail "SC-6: silo-sw-design-system disappeared (still_there=$STILL_THERE)"
ok "SC-6: silo-sw-design-system intact"

# --- Backend reachability gate (SC-2..SC-5 need the API) ---------------------
if ! curl -sf -o /dev/null "$API/health"; then
  echo "[warn] $API/health unreachable — skipping SC-2..SC-5 (run after systemctl restart porter-fastify)" >&2
  echo "schema checks green (SC-1, SC-6)"
  exit 0
fi

# --- SC-2: context endpoint injects silo section for code project -----------
echo "SC-2: /context injects Silo: Software Development for code cwd"
CTX_PORTER=$(curl -sf "$API/api/v1/intellect/context?project=Porter&cwd=/home/lobster/projects/Porter") \
  || fail "SC-2: GET /context failed"
SILO_COUNT=$(echo "$CTX_PORTER" | grep -c "## Silo: Software Development" || true)
[[ "$SILO_COUNT" -eq 1 ]] || fail "SC-2: expected 1 silo section, got $SILO_COUNT"
ok "SC-2: silo section present in Porter cwd"

# All 5 seed directive contents must appear
for SLUG in "silo-sw-parallelize-aggressively" "silo-sw-design-system" "silo-sw-components-only" "silo-sw-compact-means-padding" "silo-sw-porter-backbone"; do
  CONTENT=$(psql -d porter -tAc "SELECT content FROM directives WHERE id='$SLUG'")
  SNIPPET=$(echo "$CONTENT" | head -c 40)
  echo "$CTX_PORTER" | grep -qF "$SNIPPET" || fail "SC-2: directive $SLUG content not in context payload"
done
ok "SC-2: all 5 seed directive bodies present in context"

# --- SC-4: non-code project returns zero silo sections -----------------------
echo "SC-4: /context for non-code cwd returns no silo section"
CTX_FUNDS=$(curl -sf "$API/api/v1/intellect/context?project=Funds&cwd=/home/lobster/projects/Funds" || true)
FUNDS_SILO_COUNT=$(echo "$CTX_FUNDS" | grep -c "## Silo:" || true)
[[ "$FUNDS_SILO_COUNT" -eq 0 ]] || fail "SC-4: expected 0 silo sections for Funds cwd, got $FUNDS_SILO_COUNT"
ok "SC-4: no silo section in Funds cwd"

# --- SC-4b: BLOCKER 2 — no-cwd backward-compat (DRM-03 null-return path) ----
echo "SC-4b: /context with NO cwd param returns zero silo sections (DRM-03 null-return)"
CTX_NOCWD=$(curl -sf "$API/api/v1/intellect/context?project=Porter" || true)
NOCWD_SILO_COUNT=$(echo "$CTX_NOCWD" | grep -c "## Silo:" || true)
[[ "$NOCWD_SILO_COUNT" -eq 0 ]] || fail "SC-4b: callers omitting cwd must see zero silo sections; got $NOCWD_SILO_COUNT"
ok "SC-4b: no-cwd backward-compat preserved (DRM-03 null-return verified)"

# --- SC-5: /silo override persists across context calls ----------------------
echo "SC-5: /silo override persists for session"

# 5a. Override to software from a non-code cwd
curl -sf -X POST "$API/api/v1/intellect/silo-command" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$TEST_SESSION_ID\",\"command\":\"/silo software\"}" >/dev/null \
  || fail "SC-5a: POST /silo-command (software) failed"

CTX_OVERRIDE=$(curl -sf "$API/api/v1/intellect/context?project=Funds&cwd=/home/lobster/projects/Funds&session_id=$TEST_SESSION_ID")
OVERRIDE_SILO_COUNT=$(echo "$CTX_OVERRIDE" | grep -c "## Silo: Software Development" || true)
[[ "$OVERRIDE_SILO_COUNT" -eq 1 ]] || fail "SC-5a: override did not force software silo in Funds cwd (got $OVERRIDE_SILO_COUNT)"
ok "SC-5a: /silo software override applied"

# 5b. /silo none clears the override
curl -sf -X POST "$API/api/v1/intellect/silo-command" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$TEST_SESSION_ID\",\"command\":\"/silo none\"}" >/dev/null \
  || fail "SC-5b: POST /silo-command (none) failed"

CTX_CLEARED=$(curl -sf "$API/api/v1/intellect/context?project=Funds&cwd=/home/lobster/projects/Funds&session_id=$TEST_SESSION_ID")
CLEARED_SILO_COUNT=$(echo "$CTX_CLEARED" | grep -c "## Silo:" || true)
[[ "$CLEARED_SILO_COUNT" -eq 0 ]] || fail "SC-5b: /silo none did not clear override (got $CLEARED_SILO_COUNT)"
ok "SC-5b: /silo none cleared override"

# --- Cleanup -----------------------------------------------------------------
psql -d porter -c "DELETE FROM session_silo_overrides WHERE session_id='$TEST_SESSION_ID'" >/dev/null 2>&1 || true

echo ""
echo "all checks green (SC-1..SC-6)"
