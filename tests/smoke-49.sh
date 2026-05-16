#!/usr/bin/env bash
# tests/smoke-49.sh — Phase 49 Pattern Detection smoke tests
# Covers LRN-01..LRN-05. Idempotent. Self-cleaning. Exits non-zero on first failure.
# Graceful skip per-LRN when upstream plans (49-01..49-04) have not yet shipped.
#
# Phase gate: this is the last harness in the Phase 49 chain. The full gate is:
#   bash tests/smoke-48.1.sh && bash tests/smoke-48.2.sh && \
#   bash tests/smoke-48.3.sh && bash tests/smoke-48.4.sh && \
#   bash tests/smoke-49.sh
set -euo pipefail

API="http://127.0.0.1:3001"
TS=$(date +%s)
SMOKE_SILO="software-smoke-49"
SMOKE_PROJECT="smoke-49-project"
SMOKE_SESSION="smoke-49-$TS"
FIX_DIR="tests/fixtures"
FIX_PATTERN="$FIX_DIR/dream-response-pattern-detection.json"

fail() { echo "[FAIL] $1" >&2; cleanup; exit 1; }
ok()   { echo "[ ok ] $1"; }
skip() { echo "[skip] $1"; }
warn() { echo "[warn] $1" >&2; }

cleanup() {
  # Wipe smoke memory_proposals (silo-scoped + dream-run-scoped fallbacks)
  psql -d porter -c "DELETE FROM memory_proposals WHERE silo_id='$SMOKE_SILO' OR dream_run_id IN (SELECT id FROM dream_runs WHERE silo_id='$SMOKE_SILO')" >/dev/null 2>&1 || true
  # Wipe smoke dream_runs
  psql -d porter -c "DELETE FROM dream_runs WHERE silo_id='$SMOKE_SILO'" >/dev/null 2>&1 || true
  # Wipe smoke directives — moe-direct rows need the bypass GUC to allow DELETE
  psql -d porter -c "BEGIN; SET LOCAL porter.allow_moe_direct_mutation = 'true'; DELETE FROM directives WHERE (scope='project' AND scope_id='$SMOKE_PROJECT') OR (scope='silo' AND scope_id='$SMOKE_SILO'); COMMIT;" >/dev/null 2>&1 || true
  # Wipe smoke silo row
  psql -d porter -c "DELETE FROM silos WHERE id='$SMOKE_SILO'" >/dev/null 2>&1 || true
  # Wipe smoke transcript turns (session_id prefix)
  psql -d porter -c "DELETE FROM session_transcript_turns WHERE session_id LIKE 'smoke-49-%'" >/dev/null 2>&1 || true
  # Wipe smoke intellect_events (source_type/details_json schema)
  psql -d porter -c "DELETE FROM intellect_events WHERE source_type='dream_worker' AND (details_json->>'siloId'='$SMOKE_SILO' OR details_json->>'suggestedScopeId'='$SMOKE_PROJECT')" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup   # entry-side cleanup (idempotent — prior aborted runs leave nothing behind)

# ── DB reachability gate ───────────────────────────────────────
psql -d porter -tAc "SELECT 1" >/dev/null 2>&1 || fail "psql: cannot connect to porter database"
ok "psql porter database reachable"

# ── LRN-04 source-on-disk check (Wave 1 graceful skip) ─────────
if ! grep -q "export function detectProject" backend/src/services/intellect/silo-detector.ts 2>/dev/null; then
  skip "LRN-04 detectProject not yet in silo-detector.ts"
  SKIP_LRN_04=1
else
  ok "LRN-04 detectProject present in silo-detector.ts"
  SKIP_LRN_04=""
fi

# ── LRN-01 source-on-disk check ────────────────────────────────
if ! grep -q "FRUSTRATION_REGEX" backend/src/services/intellect/dream-sampler.ts 2>/dev/null; then
  skip "LRN-01 FRUSTRATION_REGEX not yet in dream-sampler.ts"
  SKIP_LRN_01=1
else
  ok "LRN-01 FRUSTRATION_REGEX present in dream-sampler.ts"
  SKIP_LRN_01=""
fi

# ── LRN-02 source-on-disk check ────────────────────────────────
if ! grep -q "failurePatternSchema\|failure_patterns: z.array" backend/src/services/intellect/dream-parser.ts 2>/dev/null; then
  skip "LRN-02 failure_patterns schema not yet in dream-parser.ts"
  SKIP_LRN_02=1
else
  ok "LRN-02 failure_patterns schema present"
  SKIP_LRN_02=""
fi

# ── LRN-03 source-on-disk check ────────────────────────────────
if ! grep -q "detectContext\|effectiveProject" backend/src/routes/v1/intellect.ts 2>/dev/null; then
  skip "LRN-03 /context handler not yet refactored"
  SKIP_LRN_03=1
else
  ok "LRN-03 /context handler refactored with detectContext + effectiveProject"
  SKIP_LRN_03=""
fi

# ── LRN-03 partial-index check (forward investment — non-fatal when missing) ─
IDX_PRESENT=$(psql -d porter -tAc "SELECT 1 FROM pg_indexes WHERE indexname='idx_directives_scope_scope_id_status'" 2>/dev/null || echo "")
if [[ "$IDX_PRESENT" == "1" ]]; then
  ok "LRN-03 partial index idx_directives_scope_scope_id_status present"
else
  warn "LRN-03 partial index not yet applied — re-run after porter restart"
fi

# ── Smoke silo + smoke directives setup (only when not all LRN skipped) ──
if [[ -z "$SKIP_LRN_01" || -z "$SKIP_LRN_02" || -z "$SKIP_LRN_03" ]]; then
  # Throwaway smoke silo cloned from 'software'
  psql -d porter -c "INSERT INTO silos (id, display_name, prompt_path, cadence_seconds, default_model, detect_rules, enabled) SELECT '$SMOKE_SILO', 'Smoke 49', prompt_path, 604800, default_model, '{}'::jsonb, true FROM silos WHERE id='software' ON CONFLICT (id) DO NOTHING" >/dev/null
  # Seed 4 moe-direct silo directives (so refineableCount=0 → doctrine permits append-only when smoke fixture is used)
  # directives.created_at/updated_at are double precision (epoch seconds) — use EXTRACT not NOW()
  for i in 1 2 3 4; do
    psql -d porter -c "INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES ('mp-smoke-49-seed-$i', 'silo', '$SMOKE_SILO', 'smoke seed $i', 95, 'moe-direct', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())) ON CONFLICT (id) DO NOTHING" >/dev/null
  done
  ok "smoke silo + 4 moe-direct seeds inserted"
fi

# ── LRN-04 detectProject probe (via built artifact) ────────────
if [[ -z "$SKIP_LRN_04" ]]; then
  # Try the built dist/. If missing, [warn] but don't fail — dist needs `cd backend && npm run build`.
  if test -f backend/dist/services/intellect/silo-detector.js; then
    DETECTED=$(node -e "const m=require('./backend/dist/services/intellect/silo-detector.js'); console.log(m.detectProject('/home/lobster/projects/ymc.capital/backend')||'null')" 2>/dev/null || echo "")
    [[ "$DETECTED" == "ymc.capital" ]] || fail "LRN-04: detectProject('/home/lobster/projects/ymc.capital/backend') returned '$DETECTED' (expected 'ymc.capital')"
    NEG=$(node -e "const m=require('./backend/dist/services/intellect/silo-detector.js'); console.log(m.detectProject('/tmp/x')||'null')" 2>/dev/null || echo "")
    [[ "$NEG" == "null" ]] || fail "LRN-04: detectProject('/tmp/x') returned '$NEG' (expected null)"
    NULLIN=$(node -e "const m=require('./backend/dist/services/intellect/silo-detector.js'); console.log(m.detectProject(null)||'null')" 2>/dev/null || echo "")
    [[ "$NULLIN" == "null" ]] || fail "LRN-04: detectProject(null) returned '$NULLIN' (expected null)"
    ok "LRN-04 detectProject probe: ymc.capital + /tmp/x + null boundaries correct"
  else
    warn "LRN-04 backend/dist not built — re-run after 'cd backend && npm run build'"
  fi
fi

# ── LRN-03 project-scope CRUD + trigger immutability ───────────
if [[ -z "$SKIP_LRN_03" ]]; then
  # INSERT a non-moe-direct project-scope directive
  psql -d porter -c "INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES ('mp-smoke-49-proj-1', 'project', '$SMOKE_PROJECT', 'smoke project rule 1', 70, 'dream_worker', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())) ON CONFLICT (id) DO NOTHING" >/dev/null
  SEL=$(psql -d porter -tAc "SELECT count(*) FROM directives WHERE id='mp-smoke-49-proj-1' AND scope='project' AND scope_id='$SMOKE_PROJECT'")
  [[ "$SEL" -eq 1 ]] || fail "LRN-03: project-scope directive INSERT failed (count=$SEL)"
  ok "LRN-03: project-scope directive INSERT succeeded"

  # UPDATE the non-moe-direct row (must succeed)
  psql -d porter -c "UPDATE directives SET content='smoke project rule 1 — updated' WHERE id='mp-smoke-49-proj-1'" >/dev/null
  UPD=$(psql -d porter -tAc "SELECT content FROM directives WHERE id='mp-smoke-49-proj-1'")
  [[ "$UPD" == "smoke project rule 1 — updated" ]] || fail "LRN-03: project-scope non-moe-direct UPDATE failed"
  ok "LRN-03: project-scope non-moe-direct UPDATE succeeded"

  # INSERT a moe-direct project-scope row
  psql -d porter -c "INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES ('mp-smoke-49-proj-moe', 'project', '$SMOKE_PROJECT', 'sealed project rule', 90, 'moe-direct', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())) ON CONFLICT (id) DO NOTHING" >/dev/null

  # Attempt UPDATE without bypass — expect trigger to RAISE
  if psql -d porter -v ON_ERROR_STOP=1 -c "UPDATE directives SET content='attempt mutation' WHERE id='mp-smoke-49-proj-moe'" >/dev/null 2>&1; then
    fail "LRN-03: directive_immutable_moe_direct trigger DID NOT fire on scope='project' moe-direct UPDATE — trigger may be scope-leaky"
  fi
  ok "LRN-03: trigger fired on scope='project' moe-direct UPDATE (immutability holds across scopes)"

  # Attempt UPDATE WITH bypass — expect success. SET LOCAL requires a transaction.
  psql -d porter -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL porter.allow_moe_direct_mutation = 'true'; UPDATE directives SET content='attempt mutation with bypass' WHERE id='mp-smoke-49-proj-moe'; COMMIT;" >/dev/null
  BYP=$(psql -d porter -tAc "SELECT content FROM directives WHERE id='mp-smoke-49-proj-moe'")
  [[ "$BYP" == "attempt mutation with bypass" ]] || fail "LRN-03: bypass GUC did not allow moe-direct UPDATE (got '$BYP')"
  ok "LRN-03: bypass GUC allows scope='project' moe-direct UPDATE — trigger is scope-agnostic"
fi

# ── Backend reachability gate ──────────────────────────────────
if ! curl -sf -o /dev/null "$API/health"; then
  warn "$API/health unreachable — skipping HTTP-dependent LRN-01/02 + /context LRN-03/04"
  echo "schema + source-disk checks green; HTTP checks deferred"
  exit 0
fi
ok "backend reachable at $API/health"

# ── LRN-01 frustration force-include via live dream-run ────────
if [[ -z "$SKIP_LRN_01" ]]; then
  # Seed two frustration turns in a smoke session (recent captured_at → today stratum)
  psql -d porter -c "INSERT INTO session_transcript_turns (silo_id, session_id, turn_index, role, cwd, content, captured_at) VALUES ('$SMOKE_SILO', '$SMOKE_SESSION', 1, 'user', '/home/lobster/projects/$SMOKE_PROJECT', 'EVERY SINGLE TIME you make the same mistake on this thing', NOW())" >/dev/null
  psql -d porter -c "INSERT INTO session_transcript_turns (silo_id, session_id, turn_index, role, cwd, content, captured_at) VALUES ('$SMOKE_SILO', '$SMOKE_SESSION', 2, 'user', '/home/lobster/projects/$SMOKE_PROJECT', 'why are you still doing this — it has been broken forever', NOW())" >/dev/null
  ok "LRN-01: seeded 2 frustration user-turns in smoke session"

  # Trigger dream-run with pattern-detection mock. Sampler runs BEFORE dispatch so
  # frustration_forced gets logged regardless of which fixture supplies the mock body.
  # Mock-injection contract per 48.3-05: body field _mock_response_path.
  RUN_RESP=$(curl -sf -X POST "$API/api/v1/intellect/dream-run" \
    -H "Content-Type: application/json" \
    -d "{\"silo_id\":\"$SMOKE_SILO\",\"sample_size_override\":50000,\"_mock_response_path\":\"$(pwd)/$FIX_PATTERN\"}")
  RUN_ID=$(echo "$RUN_RESP" | jq -r '.data.dream_run_id // .dream_run_id')
  [[ -n "$RUN_ID" && "$RUN_ID" != "null" ]] || fail "LRN-01: dream_run_id parse failed (resp: $RUN_RESP)"

  # Poll until completion
  STATUS="running"
  for i in $(seq 1 40); do
    STATUS=$(psql -d porter -tAc "SELECT status FROM dream_runs WHERE id='$RUN_ID'")
    [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]] && break
    sleep 0.5
  done
  [[ "$STATUS" == "completed" ]] || fail "LRN-01: dream_run did not complete (status='$STATUS', run_id=$RUN_ID)"

  FRUST=$(psql -d porter -tAc "SELECT (action_config->'sampling'->>'frustration_forced')::int FROM dream_runs WHERE id='$RUN_ID'")
  [[ "$FRUST" -ge 1 ]] || fail "LRN-01: frustration_forced=$FRUST (expected >= 1) — Pass A0 did not fire"
  ok "LRN-01: frustration_forced=$FRUST (Pass A0 active)"

  FEX=$(psql -d porter -tAc "SELECT jsonb_array_length(action_config->'sampling'->'frustration_forced_examples') FROM dream_runs WHERE id='$RUN_ID'")
  [[ "$FEX" -ge 1 ]] || fail "LRN-01: frustration_forced_examples is empty"
  ok "LRN-01: frustration_forced_examples length=$FEX (audit field populated)"

  # ── LRN-02 failure-pattern insertion + audit ─────────────────
  if [[ -z "$SKIP_LRN_02" ]]; then
    FP_COUNT=$(psql -d porter -tAc "SELECT count(*) FROM memory_proposals WHERE dream_run_id='$RUN_ID' AND proposed_metadata->>'source'='failure_pattern'")
    [[ "$FP_COUNT" -eq 1 ]] || fail "LRN-02: expected 1 failure-pattern row in memory_proposals, got $FP_COUNT"
    ok "LRN-02: 1 failure-pattern row inserted"

    FP_KIND=$(psql -d porter -tAc "SELECT proposal_kind FROM memory_proposals WHERE dream_run_id='$RUN_ID' AND proposed_metadata->>'source'='failure_pattern' LIMIT 1")
    [[ "$FP_KIND" == "new_directive" ]] || fail "LRN-02: failure_pattern proposal_kind='$FP_KIND' (expected 'new_directive')"

    FP_SORT=$(psql -d porter -tAc "SELECT sort_order FROM memory_proposals WHERE dream_run_id='$RUN_ID' AND proposed_metadata->>'source'='failure_pattern' LIMIT 1")
    [[ "$FP_SORT" -ge 850 && "$FP_SORT" -le 899 ]] || fail "LRN-02: failure_pattern sort_order=$FP_SORT (expected 850..899)"
    ok "LRN-02: failure_pattern sort_order=$FP_SORT in [850, 899] band"

    FP_SCOPE=$(psql -d porter -tAc "SELECT proposed_metadata->>'suggested_scope' FROM memory_proposals WHERE dream_run_id='$RUN_ID' AND proposed_metadata->>'source'='failure_pattern' LIMIT 1")
    [[ "$FP_SCOPE" == "project" ]] || fail "LRN-02: failure_pattern suggested_scope='$FP_SCOPE' (expected 'project')"
    ok "LRN-02: failure_pattern carries suggested_scope='project'"

    # intellect_events live schema: source_type/event_type/details_json (NOT source/kind/payload)
    FP_EV=$(psql -d porter -tAc "SELECT count(*) FROM intellect_events WHERE source_type='dream_worker' AND event_type='dream_failure_pattern_detected' AND details_json->>'dreamRunId'='$RUN_ID'")
    [[ "$FP_EV" -eq 1 ]] || fail "LRN-02: expected 1 dream_failure_pattern_detected audit event, got $FP_EV"
    ok "LRN-02: dream_failure_pattern_detected audit event present"

    PROPS_EXTRACTED=$(psql -d porter -tAc "SELECT proposals_extracted FROM dream_runs WHERE id='$RUN_ID'")
    # Fixture has 1 proposal + 1 failure_pattern → expected 2
    [[ "$PROPS_EXTRACTED" -eq 2 ]] || fail "LRN-02: dream_runs.proposals_extracted=$PROPS_EXTRACTED (expected 2: proposals+failure_patterns)"
    ok "LRN-02: dream_runs.proposals_extracted=$PROPS_EXTRACTED (proposals + failure_patterns rolled up)"
  fi
fi

# ── LRN-03 + LRN-04 /context layering ──────────────────────────
if [[ -z "$SKIP_LRN_03" && -z "$SKIP_LRN_04" ]]; then
  # The smoke project directive 'mp-smoke-49-proj-1' was inserted above

  # Cwd-only call (NO ?project=) — expects server-side derivation
  CTX_CWD=$(curl -sf "$API/api/v1/intellect/context?cwd=/home/lobster/projects/$SMOKE_PROJECT")
  echo "$CTX_CWD" | jq -e '.data.stats.projectIdSource == "cwd"' >/dev/null || fail "LRN-04: cwd-only /context did not report projectIdSource='cwd' (resp: $CTX_CWD)"
  echo "$CTX_CWD" | jq -e ".data.stats.effectiveProject == \"$SMOKE_PROJECT\"" >/dev/null || fail "LRN-04: cwd-only /context did not derive effectiveProject='$SMOKE_PROJECT'"
  echo "$CTX_CWD" | jq -r '.data.context' | grep -q "Project Directives ($SMOKE_PROJECT)" || fail "LRN-03: cwd-only /context missing Project Directives section header"
  echo "$CTX_CWD" | jq -r '.data.context' | grep -q "smoke project rule 1" || fail "LRN-03: cwd-only /context missing smoke project directive content"
  ok "LRN-03 + LRN-04: cwd-only /context returns Project Directives + projectIdSource='cwd' + effectiveProject='$SMOKE_PROJECT'"

  # Explicit project query — expects projectIdSource='query'
  CTX_PROJ=$(curl -sf "$API/api/v1/intellect/context?project=$SMOKE_PROJECT")
  echo "$CTX_PROJ" | jq -e '.data.stats.projectIdSource == "query"' >/dev/null || fail "LRN-03: explicit ?project= did not report projectIdSource='query'"
  echo "$CTX_PROJ" | jq -r '.data.context' | grep -q "smoke project rule 1" || fail "LRN-03: explicit ?project= missing smoke project directive content"
  ok "LRN-03: explicit ?project= /context returns Project Directives + projectIdSource='query'"

  # Both query params present — explicit wins (back-compat with porter-session-start hook)
  CTX_BOTH=$(curl -sf "$API/api/v1/intellect/context?project=$SMOKE_PROJECT&cwd=/home/lobster/projects/SomethingElse")
  echo "$CTX_BOTH" | jq -e '.data.stats.projectIdSource == "query"' >/dev/null || fail "LRN-03: both-params did not honor explicit ?project= over cwd-derivation"
  ok "LRN-03: explicit ?project= wins over conflicting ?cwd= (back-compat with hook)"
fi

# ── LRN-05 self-check ──────────────────────────────────────────
test -x tests/smoke-49.sh || fail "LRN-05: smoke script not executable"
ok "LRN-05: smoke harness present + executable"

echo ""
echo "all checks green for current wave"
