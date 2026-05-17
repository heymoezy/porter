#!/usr/bin/env bash
# tests/smoke-48.3.sh — Phase 48.3 Software Dream Worker smoke tests
# Covers DRW-01..DRW-13. Idempotent. Self-cleaning. Exits non-zero on first failure.
set -euo pipefail

API="http://127.0.0.1:3001"
TS=$(date +%s)
SMOKE_SILO="software-smoke-48.3"
SMOKE_SESSION_PREFIX="smoke-48.3-$TS"
FIX_DIR="tests/fixtures"
FIX_OK="$FIX_DIR/dream-response-software.json"
FIX_BAD="$FIX_DIR/dream-response-malformed.json"
FIX_DOC="$FIX_DIR/dream-response-doctrine-violation.json"

fail() { echo "[FAIL] $1" >&2; cleanup; exit 1; }
ok()   { echo "[ ok ] $1"; }

cleanup() {
  psql -d porter -c "DELETE FROM memory_proposals WHERE silo_id='$SMOKE_SILO' OR dream_run_id IN (SELECT id FROM dream_runs WHERE silo_id='$SMOKE_SILO')" >/dev/null 2>&1 || true
  psql -d porter -c "DELETE FROM dream_runs WHERE silo_id='$SMOKE_SILO'" >/dev/null 2>&1 || true
  psql -d porter -c "DELETE FROM directives WHERE scope='silo' AND scope_id='$SMOKE_SILO'" >/dev/null 2>&1 || true
  psql -d porter -c "DELETE FROM silos WHERE id='$SMOKE_SILO'" >/dev/null 2>&1 || true
  psql -d porter -c "DELETE FROM session_transcript_turns WHERE session_id LIKE 'smoke-48.3-%'" >/dev/null 2>&1 || true
  psql -d porter -c "DELETE FROM intellect_events WHERE source_type='dream_worker' AND details_json->>'siloId'='$SMOKE_SILO'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --- Cleanup leftovers from prior runs ---------------------------------------
cleanup

# --- DRW-01: memory_proposals table + indexes + CHECKs -----------------------
echo "DRW-01: memory_proposals schema"
MP_EXISTS=$(psql -d porter -tAc "SELECT to_regclass('memory_proposals')")
[[ "$MP_EXISTS" == "memory_proposals" ]] || fail "DRW-01: memory_proposals table missing (got '$MP_EXISTS')"
ok "DRW-01: memory_proposals table exists"

MP_COLS=$(psql -d porter -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='memory_proposals' AND column_name IN ('id','dream_run_id','silo_id','proposal_kind','target_directive_ids','proposed_content','proposed_metadata','source_evidence','sort_order','status','created_at','expires_at','reviewed_at','reviewed_by')")
[[ "$MP_COLS" -eq 14 ]] || fail "DRW-01: memory_proposals columns missing (have $MP_COLS/14)"
ok "DRW-01: memory_proposals columns present (14/14)"

MP_KIND_CHECK=$(psql -d porter -tAc "SELECT count(*) FROM information_schema.check_constraints cc JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name=ccu.constraint_name WHERE ccu.table_name='memory_proposals' AND cc.check_clause ILIKE '%proposal_kind%merge%supersede%delete%new_directive%'")
[[ "$MP_KIND_CHECK" -ge 1 ]] || fail "DRW-01: proposal_kind CHECK constraint missing"
ok "DRW-01: proposal_kind CHECK constraint present"

MP_STATUS_CHECK=$(psql -d porter -tAc "SELECT count(*) FROM information_schema.check_constraints cc JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name=ccu.constraint_name WHERE ccu.table_name='memory_proposals' AND cc.check_clause ILIKE '%status%pending%accepted%rejected%expired%'")
[[ "$MP_STATUS_CHECK" -ge 1 ]] || fail "DRW-01: status CHECK constraint missing"
ok "DRW-01: status CHECK constraint present"

for IDX in memory_proposals_silo_status_created_idx memory_proposals_run_sort_idx memory_proposals_expiry_idx; do
  N=$(psql -d porter -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='$IDX'")
  [[ "$N" -eq 1 ]] || fail "DRW-01: index $IDX missing"
done
ok "DRW-01: all 3 indexes present"

# --- DRW-02: dream_runs table + indexes + CHECKs -----------------------------
echo "DRW-02: dream_runs schema"
DR_EXISTS=$(psql -d porter -tAc "SELECT to_regclass('dream_runs')")
[[ "$DR_EXISTS" == "dream_runs" ]] || fail "DRW-02: dream_runs table missing"
ok "DRW-02: dream_runs table exists"

DR_COLS=$(psql -d porter -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='dream_runs' AND column_name IN ('id','silo_id','status','model_used','triggered_by','triggered_by_user','action_config','prompt_token_estimate','response_token_estimate','turns_sampled','sessions_sampled','proposals_extracted','duration_ms','error_message','started_at','completed_at')")
[[ "$DR_COLS" -ge 16 ]] || fail "DRW-02: dream_runs columns missing (have $DR_COLS/16)"
ok "DRW-02: dream_runs columns present"

DR_STATUS_CHECK=$(psql -d porter -tAc "SELECT count(*) FROM information_schema.check_constraints cc JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name=ccu.constraint_name WHERE ccu.table_name='dream_runs' AND cc.check_clause ILIKE '%status%running%completed%failed%'")
[[ "$DR_STATUS_CHECK" -ge 1 ]] || fail "DRW-02: status CHECK constraint missing"
DR_TRIG_CHECK=$(psql -d porter -tAc "SELECT count(*) FROM information_schema.check_constraints cc JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name=ccu.constraint_name WHERE ccu.table_name='dream_runs' AND cc.check_clause ILIKE '%triggered_by%schedule%manual%'")
[[ "$DR_TRIG_CHECK" -ge 1 ]] || fail "DRW-02: triggered_by CHECK constraint missing"
ok "DRW-02: CHECK constraints present"

for IDX in dream_runs_silo_started_idx dream_runs_status_idx; do
  N=$(psql -d porter -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='$IDX'")
  [[ "$N" -eq 1 ]] || fail "DRW-02: index $IDX missing"
done
ok "DRW-02: indexes present"

DR_MIG=$(psql -d porter -tAc "SELECT count(*) FROM schema_migrations WHERE id='dreams_v1'")
[[ "$DR_MIG" -eq 1 ]] || fail "DRW-02: schema_migrations row 'dreams_v1' missing"
ok "DRW-02: schema_migrations recorded"

# --- DRW-08: dream-cadence scheduler wiring + stuck-sweep workflow ----------
# REBASED 2026-05-17 (Phase 50 MSF-04, smoke-50 SC-18):
#   Pre-Phase-50, DRW-08 asserted the BUILTIN_WORKFLOWS 'Software dream — weekly
#   consolidation' row (trigger_value='every_week', action_type='dream_run') existed
#   and the scheduler had an every_week (302400-tick) branch. Phase 50 Plan 01
#   retired that mechanism in favor of per-silo runSiloCadenceCheck reading
#   silos.cadence_seconds from the DB (1h tick, 95% floor). Plan 50-04 smoke-50
#   SC-18 asserts the legacy row stays DELETED. The invariant under test here —
#   "dream cadence is wired into the scheduler" — is unchanged; only the
#   mechanism is. Re-anchored to the per-silo tick. Stuck-sweep workflow check
#   is unaffected (Plan 48.3, still live).
echo "DRW-08: dream cadence wiring + stuck-sweep workflow"
WK_SWEEP=$(psql -d porter -tAc "SELECT count(*) FROM workflows WHERE action_type='dream_runs_stuck_sweep'")
[[ "$WK_SWEEP" -ge 1 ]] || fail "DRW-08: dream_runs_stuck_sweep workflow row missing"
ok "DRW-08: stuck-sweep workflow seeded"

grep -q "runSiloCadenceCheck" backend/src/services/scheduler.ts || fail "DRW-08: scheduler.ts missing runSiloCadenceCheck (Phase 50 MSF-04 per-silo cadence replacement for every_week)"
grep -q "SILO_CADENCE_CHECK_INTERVAL" backend/src/services/scheduler.ts || fail "DRW-08: scheduler.ts missing SILO_CADENCE_CHECK_INTERVAL constant"
ok "DRW-08: scheduler.ts has per-silo cadence tick (runSiloCadenceCheck + SILO_CADENCE_CHECK_INTERVAL)"

# --- DRW-03: prompt template file + substitution markers ---------------------
echo "DRW-03: prompt template at silos.prompt_path"
PROMPT_PATH=$(psql -d porter -tAc "SELECT prompt_path FROM silos WHERE id='software'")
[[ -n "$PROMPT_PATH" ]] || fail "DRW-03: silos row 'software' missing (48.1 should have seeded it)"
test -f "$PROMPT_PATH" || fail "DRW-03: prompt file missing at $PROMPT_PATH"
ok "DRW-03: prompt file exists at $PROMPT_PATH"

for MARKER in "{{ACTIVE_DIRECTIVE_COUNT}}" "{{ACTIVE_DIRECTIVES_BLOCK}}" "{{TRANSCRIPT_BLOCK}}" "{{TURNS_SAMPLED}}" "{{SESSIONS_SAMPLED}}"; do
  grep -qF "$MARKER" "$PROMPT_PATH" || fail "DRW-03: template missing substitution marker $MARKER"
done
ok "DRW-03: all 5 substitution markers present"

grep -qi "refine.*don.t.*append\|refinement doctrine" "$PROMPT_PATH" || fail "DRW-03: template missing Refinement Doctrine section"
ok "DRW-03: template references Refinement Doctrine"

# --- Backend reachability gate ----------------------------------------------
if ! curl -sf -o /dev/null "$API/health"; then
  echo "[warn] $API/health unreachable — skipping DRW-04..DRW-12 (start the backend and re-run)" >&2
  echo "schema checks green (DRW-01, DRW-02, DRW-03, DRW-08)"
  exit 0
fi
ok "backend reachable at $API/health"

# --- Wave-1 graceful skip: dream-worker.ts and/or POST /dream-run may not exist yet
# Worker module lands in Plan 04; HTTP endpoint lands in Plan 05. Both must be live
# for DRW-04..DRW-12 to run. The endpoint probe is a HEAD/POST that distinguishes
# 404 (route not mounted, Plan 05 not yet shipped) from other status codes.
SKIP_WORKER=""
if ! test -f backend/src/services/intellect/dream-worker.ts; then
  echo "[warn] dream-worker.ts not yet built; skipping DRW-04..DRW-12" >&2
  SKIP_WORKER=1
elif [[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/v1/intellect/dream-run" -H 'Content-Type: application/json' -d '{}')" == "404" ]]; then
  echo "[warn] POST $API/api/v1/intellect/dream-run returns 404 (Plan 05 endpoint not yet wired); skipping DRW-04..DRW-12" >&2
  SKIP_WORKER=1
fi

# --- Throwaway smoke silo + smoke directives (used by all worker checks) ----
psql -d porter -c "INSERT INTO silos (id, display_name, prompt_path, cadence_seconds, default_model, detect_rules, enabled) SELECT '$SMOKE_SILO', 'Smoke 48.3', prompt_path, 604800, default_model, '{}'::jsonb, true FROM silos WHERE id='software' ON CONFLICT (id) DO NOTHING" >/dev/null
# Pre-seed 6 directives for the smoke silo (4 'moe-direct' seeds + 2 dream-added) — boundary > 4 so doctrine engages
for i in 1 2 3 4; do
  psql -d porter -c "INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES ('mp-smoke-seed-$i', 'silo', '$SMOKE_SILO', 'smoke seed $i', 95, 'moe-direct', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())) ON CONFLICT (id) DO NOTHING" >/dev/null
done
psql -d porter -c "INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES ('mp-smoke-target-stale', 'silo', '$SMOKE_SILO', 'stale rule to delete', 70, 'dream_worker', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())) ON CONFLICT (id) DO NOTHING" >/dev/null
psql -d porter -c "INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES ('mp-smoke-target-supersede', 'silo', '$SMOKE_SILO', 'ambiguous rule to supersede', 70, 'dream_worker', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())) ON CONFLICT (id) DO NOTHING" >/dev/null
ok "smoke silo + 6 directives seeded (4 moe-direct + 2 dream_worker)"

# Seed minimal transcript turns tagged with the smoke silo so the sampler returns
# a non-empty corpus (worker short-circuits to completed/0-proposals when corpus
# is empty regardless of mock-injection). Cleanup wipes session_id LIKE 'smoke-48.3-%'.
psql -d porter -c "INSERT INTO session_transcript_turns (session_id, turn_index, role, silo_id, cwd, content, captured_at) VALUES ('${SMOKE_SESSION_PREFIX}-s1', 0, 'user', '$SMOKE_SILO', '/home/lobster/projects/Porter', 'use the design system not custom CSS', NOW() - INTERVAL '1 day') ON CONFLICT DO NOTHING" >/dev/null
psql -d porter -c "INSERT INTO session_transcript_turns (session_id, turn_index, role, silo_id, cwd, content, captured_at) VALUES ('${SMOKE_SESSION_PREFIX}-s1', 1, 'assistant', '$SMOKE_SILO', '/home/lobster/projects/Porter', 'Refactored to use design system tokens.', NOW() - INTERVAL '1 day') ON CONFLICT DO NOTHING" >/dev/null
psql -d porter -c "INSERT INTO session_transcript_turns (session_id, turn_index, role, silo_id, cwd, content, captured_at) VALUES ('${SMOKE_SESSION_PREFIX}-s2', 0, 'user', '$SMOKE_SILO', '/home/lobster/projects/Porter', 'always restart porter-fastify after frontend rebuild', NOW() - INTERVAL '2 days') ON CONFLICT DO NOTHING" >/dev/null
ok "smoke silo + 3 transcript turns seeded for sampler"

if [[ -z "$SKIP_WORKER" ]]; then
  # --- DRW-04 + DRW-07 + DRW-11: end-to-end run with doctrine-compliant mock
  # Mock-injection passed via body (_mock_response_path) because env vars don't
  # propagate from curl to the backend process; the endpoint forwards to
  # runDreamWorker → dispatchDream which prefers arg over env.
  echo "DRW-04 + DRW-07 + DRW-11: end-to-end worker run (mocked Bridge)"
  RUN_RESP=$(curl -sf -X POST "$API/api/v1/intellect/dream-run" \
    -H "Content-Type: application/json" \
    -d "{\"silo_id\":\"$SMOKE_SILO\",\"sample_size_override\":50000,\"_mock_response_path\":\"$(pwd)/$FIX_OK\"}")
  echo "$RUN_RESP" | grep -q '"dream_run_id"' || fail "DRW-04: POST /dream-run did not return dream_run_id (resp: $RUN_RESP)"
  RUN_ID=$(echo "$RUN_RESP" | jq -r '.data.dream_run_id // .dream_run_id')
  [[ -n "$RUN_ID" && "$RUN_ID" != "null" ]] || fail "DRW-04: dream_run_id parsing failed"
  ok "DRW-04: POST /dream-run accepted, run_id=$RUN_ID"

  # Poll dream_runs.status (up to 20s)
  STATUS="running"
  for i in $(seq 1 40); do
    STATUS=$(psql -d porter -tAc "SELECT status FROM dream_runs WHERE id='$RUN_ID'")
    [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]] && break
    sleep 0.5
  done
  [[ "$STATUS" == "completed" ]] || fail "DRW-04: dream_run status='$STATUS' (expected 'completed')"
  ok "DRW-04: dream_run reached status=completed"

  PROP_COUNT=$(psql -d porter -tAc "SELECT count(*) FROM memory_proposals WHERE dream_run_id='$RUN_ID'")
  [[ "$PROP_COUNT" -eq 3 ]] || fail "DRW-04: expected 3 proposals inserted, got $PROP_COUNT"
  ok "DRW-04: 3 proposals inserted from doctrine-compliant fixture"

  # DRW-07: action_config.sampling populated
  SAMPLING=$(psql -d porter -tAc "SELECT action_config->'sampling' FROM dream_runs WHERE id='$RUN_ID'")
  [[ "$SAMPLING" != "" && "$SAMPLING" != "null" ]] || fail "DRW-07: action_config.sampling missing on dream_run"
  ok "DRW-07: sampling decisions logged in action_config"

  # DRW-11: intellect_events for start + completed
  EV_STARTED=$(psql -d porter -tAc "SELECT count(*) FROM intellect_events WHERE source_type='dream_worker' AND event_type='dream_run_started' AND details_json->>'dreamRunId'='$RUN_ID'")
  EV_DONE=$(psql -d porter -tAc "SELECT count(*) FROM intellect_events WHERE source_type='dream_worker' AND event_type='dream_run_completed' AND details_json->>'dreamRunId'='$RUN_ID'")
  [[ "$EV_STARTED" -ge 1 ]] || fail "DRW-11: dream_run_started event missing"
  [[ "$EV_DONE" -ge 1 ]] || fail "DRW-11: dream_run_completed event missing"
  ok "DRW-11: started + completed audit events logged"

  # --- DRW-12: 48.4 read-contract indexes serve queries -----
  PENDING=$(psql -d porter -tAc "SELECT count(*) FROM memory_proposals WHERE silo_id='$SMOKE_SILO' AND status='pending'")
  [[ "$PENDING" -ge 3 ]] || fail "DRW-12: pending count query returned $PENDING (<3)"
  ok "DRW-12: list-pending-by-silo query returns rows"

  # Sort order: refinement kinds (delete, supersede) come BEFORE new_directive
  FIRST_KIND=$(psql -d porter -tAc "SELECT proposal_kind FROM memory_proposals WHERE dream_run_id='$RUN_ID' ORDER BY sort_order ASC LIMIT 1")
  LAST_KIND=$(psql -d porter -tAc "SELECT proposal_kind FROM memory_proposals WHERE dream_run_id='$RUN_ID' ORDER BY sort_order DESC LIMIT 1")
  [[ "$FIRST_KIND" == "delete" || "$FIRST_KIND" == "supersede" || "$FIRST_KIND" == "merge" ]] || fail "DRW-12: first by sort_order should be refinement, got '$FIRST_KIND'"
  [[ "$LAST_KIND" == "new_directive" ]] || fail "DRW-12: last by sort_order should be new_directive, got '$LAST_KIND'"
  ok "DRW-12: sort_order enforces refinement-before-append (first=$FIRST_KIND, last=$LAST_KIND)"

  # --- DRW-09: GET /dream-runs/:id polls status ---
  GET_RESP=$(curl -sf "$API/api/v1/intellect/dream-runs/$RUN_ID")
  echo "$GET_RESP" | grep -q '"status"' || fail "DRW-09: GET /dream-runs/:id did not return status"
  ok "DRW-09: GET endpoint returns dream_run row"

  # --- DRW-06: doctrine-violation fixture rejects run ---
  echo "DRW-06: doctrine-violation rejects run"
  VIO_RESP=$(curl -sf -X POST "$API/api/v1/intellect/dream-run" \
    -H "Content-Type: application/json" \
    -d "{\"silo_id\":\"$SMOKE_SILO\",\"sample_size_override\":50000,\"_mock_response_path\":\"$(pwd)/$FIX_DOC\"}")
  VIO_ID=$(echo "$VIO_RESP" | jq -r '.data.dream_run_id // .dream_run_id')
  [[ -n "$VIO_ID" && "$VIO_ID" != "null" ]] || fail "DRW-06: doctrine-violation run_id parse failed"
  for i in $(seq 1 40); do
    STATUS=$(psql -d porter -tAc "SELECT status FROM dream_runs WHERE id='$VIO_ID'")
    [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]] && break
    sleep 0.5
  done
  [[ "$STATUS" == "failed" ]] || fail "DRW-06: doctrine-violation should fail run; got status='$STATUS'"
  ERR=$(psql -d porter -tAc "SELECT error_message FROM dream_runs WHERE id='$VIO_ID'")
  echo "$ERR" | grep -qi "doctrine" || fail "DRW-06: error_message should mention 'doctrine'; got '$ERR'"
  ORPHANS=$(psql -d porter -tAc "SELECT count(*) FROM memory_proposals WHERE dream_run_id='$VIO_ID'")
  [[ "$ORPHANS" -eq 0 ]] || fail "DRW-06: doctrine-violation run left $ORPHANS orphan proposals (should be 0 — all-or-nothing)"
  ok "DRW-06: doctrine violation → status=failed, 0 proposals inserted"

  # --- DRW-10: malformed JSON fixture rejects run with no orphans ---
  echo "DRW-10: malformed-JSON failure with no orphans"
  BAD_RESP=$(curl -sf -X POST "$API/api/v1/intellect/dream-run" \
    -H "Content-Type: application/json" \
    -d "{\"silo_id\":\"$SMOKE_SILO\",\"sample_size_override\":50000,\"_mock_response_path\":\"$(pwd)/$FIX_BAD\"}")
  BAD_ID=$(echo "$BAD_RESP" | jq -r '.data.dream_run_id // .dream_run_id')
  for i in $(seq 1 40); do
    STATUS=$(psql -d porter -tAc "SELECT status FROM dream_runs WHERE id='$BAD_ID'")
    [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]] && break
    sleep 0.5
  done
  [[ "$STATUS" == "failed" ]] || fail "DRW-10: malformed JSON should fail run; got status='$STATUS'"
  BAD_ERR=$(psql -d porter -tAc "SELECT error_message FROM dream_runs WHERE id='$BAD_ID'")
  echo "$BAD_ERR" | grep -qiE "parse|json" || fail "DRW-10: error_message should mention parse/json; got '$BAD_ERR'"
  BAD_ORPHANS=$(psql -d porter -tAc "SELECT count(*) FROM memory_proposals WHERE dream_run_id='$BAD_ID'")
  [[ "$BAD_ORPHANS" -eq 0 ]] || fail "DRW-10: malformed-JSON run left $BAD_ORPHANS orphan proposals"
  ok "DRW-10: parse failure → status=failed, 0 orphan proposals"

  # --- DRW-05: Bridge dispatch shape (mock path inserts marker, but real path validated when live) ---
  # In the mocked path, we assert dream_runs.dispatch_id is either null OR points to a 'mock' marker.
  # The full DRW-05 raw-passthrough validation requires a live unmocked run — gated to manual checkpoint in Plan 05.
  DISPATCH_ID=$(psql -d porter -tAc "SELECT dispatch_id FROM dream_runs WHERE id='$RUN_ID'")
  if [[ -n "$DISPATCH_ID" && "$DISPATCH_ID" != "null" ]]; then
    GATEWAY=$(psql -d porter -tAc "SELECT gateway_type FROM bridge_dispatch_log WHERE id='$DISPATCH_ID'" 2>/dev/null || echo "")
    [[ "$GATEWAY" == "mock" || "$GATEWAY" == "claude_cli" || -z "$GATEWAY" ]] || fail "DRW-05: unexpected gateway_type '$GATEWAY' (expected mock or claude_cli)"
  fi
  ok "DRW-05: dispatch_id shape consistent (live raw-passthrough validated in Plan 05 manual checkpoint)"

else
  echo "[skip] DRW-04..DRW-12 (dream-worker.ts not yet built — Wave 1 run before Plan 04)"
fi

# --- DRW-13: harness self-test (this script's existence + executability) ----
test -x tests/smoke-48.3.sh || fail "DRW-13: smoke script not executable"
ok "DRW-13: smoke harness present + executable"

echo ""
echo "all checks green for current wave"
