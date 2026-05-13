-- tests/fixtures/dreams-mock-proposals.sql
-- Seed fixture for Phase 48.4 smoke harness.
-- Invoked by tests/smoke-48.4.sh after the SMOKE_SILO cleanup has run.
-- This file uses literal IDs (mp-smoke-48.4-*) because the smoke harness
-- cleans them up via DELETE on every run — collision is acceptable; the
-- harness's trap cleanup removes them in cleanup() before re-INSERTing.

-- Smoke silo (idempotent — harness creates it first; this is belt-and-braces)
INSERT INTO silos (id, display_name, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
SELECT 'software-smoke-48.4', 'Smoke 48.4', prompt_path, 604800, default_model, '{}'::jsonb, true
FROM silos WHERE id='software'
ON CONFLICT (id) DO NOTHING;

-- 4 moe-direct seed directives for SEALED_SEED 422 test (one per kind that
-- mutates an existing directive: delete/supersede/merge — though SEALED_SEED
-- is kind-agnostic, having one obvious seed-target for each mutating kind
-- makes the test matrix explicit)
INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES
  ('mp-smoke-48.4-seed-1', 'silo', 'software-smoke-48.4', 'Smoke seed 1 (sealed)', 95, 'moe-direct', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
  ('mp-smoke-48.4-seed-2', 'silo', 'software-smoke-48.4', 'Smoke seed 2 (sealed)', 95, 'moe-direct', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
  ('mp-smoke-48.4-seed-3', 'silo', 'software-smoke-48.4', 'Smoke seed 3 (sealed)', 95, 'moe-direct', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
  ('mp-smoke-48.4-seed-4', 'silo', 'software-smoke-48.4', 'Smoke seed 4 (sealed)', 95, 'moe-direct', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
ON CONFLICT (id) DO NOTHING;

-- 4 dream_worker-source target directives for delete/supersede/merge accept tests
INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_at, updated_at) VALUES
  ('mp-smoke-48.4-target-stale', 'silo', 'software-smoke-48.4', 'Stale rule to be deleted via accept', 70, 'dream_worker', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
  ('mp-smoke-48.4-target-supersede', 'silo', 'software-smoke-48.4', 'Ambiguous rule to be superseded', 70, 'dream_worker', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
  ('mp-smoke-48.4-target-merge-a', 'silo', 'software-smoke-48.4', 'Merge target A — redundant phrasing variant 1', 70, 'dream_worker', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
  ('mp-smoke-48.4-target-merge-b', 'silo', 'software-smoke-48.4', 'Merge target B — redundant phrasing variant 2', 70, 'dream_worker', 'active', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
ON CONFLICT (id) DO NOTHING;

-- One parent dream_run with status='completed'
INSERT INTO dream_runs (id, silo_id, status, model_used, triggered_by, triggered_by_user, action_config, prompt_token_estimate, response_token_estimate, turns_sampled, sessions_sampled, proposals_extracted, duration_ms, error_message, started_at, completed_at)
VALUES (
  'dr-smoke-48.4-run-1',
  'software-smoke-48.4',
  'completed',
  'mock',
  'manual',
  'smoke-harness',
  '{"sampling":{"selected_kb":12}}'::jsonb,
  500, 200, 10, 3, 5, 1200, NULL,
  EXTRACT(EPOCH FROM NOW()) - 3600,
  EXTRACT(EPOCH FROM NOW()) - 3500
)
ON CONFLICT (id) DO NOTHING;

-- 7 memory_proposals — one per kind + SILO_MISMATCH + SEALED_SEED + EXPIRY probes
-- All have status='pending' and target the seeded mp-smoke-48.4-* directives
-- except the SILO_MISMATCH probe which intentionally references a real software-silo directive.
INSERT INTO memory_proposals (id, dream_run_id, silo_id, proposal_kind, target_directive_ids, proposed_content, proposed_metadata, source_evidence, sort_order, status, created_at, expires_at, reviewed_at, reviewed_by) VALUES
  ('mp-smoke-48.4-prop-delete',
   'dr-smoke-48.4-run-1', 'software-smoke-48.4', 'delete',
   ARRAY['mp-smoke-48.4-target-stale']::text[],
   'Stale: no reinforcement signal in 6 weeks. Archive.',
   '{"priority":70,"conceptual_area":"design-system","source_type":"dream_worker"}'::jsonb,
   '{"sample_turn_ids":[101,102],"phrasing_examples":["use the design system"],"reasoning":"Stale rule"}'::jsonb,
   0, 'pending',
   EXTRACT(EPOCH FROM NOW()) - 1800, EXTRACT(EPOCH FROM NOW()) + 30*86400, NULL, NULL),

  ('mp-smoke-48.4-prop-supersede',
   'dr-smoke-48.4-run-1', 'software-smoke-48.4', 'supersede',
   ARRAY['mp-smoke-48.4-target-supersede']::text[],
   'Always use components. Every UI element is a reusable component instance — if a needed component does not exist, create it in the library before consumer.',
   '{"priority":70,"conceptual_area":"component-discipline","source_type":"dream_worker"}'::jsonb,
   '{"sample_turn_ids":[201,202,203],"phrasing_examples":["component first","library before consumer"],"reasoning":"Tighter wording"}'::jsonb,
   1, 'pending',
   EXTRACT(EPOCH FROM NOW()) - 1800, EXTRACT(EPOCH FROM NOW()) + 30*86400, NULL, NULL),

  ('mp-smoke-48.4-prop-merge',
   'dr-smoke-48.4-run-1', 'software-smoke-48.4', 'merge',
   ARRAY['mp-smoke-48.4-target-merge-a','mp-smoke-48.4-target-merge-b']::text[],
   'Merged: combine the two redundant phrasing variants into one canonical rule.',
   '{"priority":70,"conceptual_area":"design-system","source_type":"dream_worker"}'::jsonb,
   '{"sample_turn_ids":[301,302],"phrasing_examples":["same idea twice"],"reasoning":"Redundancy"}'::jsonb,
   2, 'pending',
   EXTRACT(EPOCH FROM NOW()) - 1800, EXTRACT(EPOCH FROM NOW()) + 30*86400, NULL, NULL),

  ('mp-smoke-48.4-prop-new',
   'dr-smoke-48.4-run-1', 'software-smoke-48.4', 'new_directive',
   ARRAY[]::text[],
   'Always restart porter-fastify after frontend rebuild. Backend serves statics; rebuild without restart = blank screen.',
   '{"priority":70,"conceptual_area":"ship-discipline","source_type":"dream_worker"}'::jsonb,
   '{"sample_turn_ids":[401,402],"phrasing_examples":["always restart"],"reasoning":"Repeated pattern"}'::jsonb,
   3, 'pending',
   EXTRACT(EPOCH FROM NOW()) - 1800, EXTRACT(EPOCH FROM NOW()) + 30*86400, NULL, NULL),

  -- SILO_MISMATCH probe: targets a real 'software' silo directive (not 'software-smoke-48.4')
  ('mp-smoke-48.4-prop-mismatch',
   'dr-smoke-48.4-run-1', 'software-smoke-48.4', 'supersede',
   ARRAY['silo-sw-design-system']::text[],
   'Crosses silo boundary — must be rejected by accept handler with SILO_MISMATCH.',
   '{"priority":70,"conceptual_area":"test","source_type":"dream_worker"}'::jsonb,
   '{"sample_turn_ids":[],"phrasing_examples":[],"reasoning":"Test silo mismatch path"}'::jsonb,
   4, 'pending',
   EXTRACT(EPOCH FROM NOW()) - 1800, EXTRACT(EPOCH FROM NOW()) + 30*86400, NULL, NULL),

  -- SEALED_SEED probe: targets a moe-direct directive in the smoke silo
  ('mp-smoke-48.4-prop-sealed',
   'dr-smoke-48.4-run-1', 'software-smoke-48.4', 'delete',
   ARRAY['mp-smoke-48.4-seed-1']::text[],
   'Targets a sealed-seed directive — must be rejected by accept handler with SEALED_SEED.',
   '{"priority":70,"conceptual_area":"test","source_type":"dream_worker"}'::jsonb,
   '{"sample_turn_ids":[],"phrasing_examples":[],"reasoning":"Test sealed seed path"}'::jsonb,
   5, 'pending',
   EXTRACT(EPOCH FROM NOW()) - 1800, EXTRACT(EPOCH FROM NOW()) + 30*86400, NULL, NULL),

  -- EXPIRY probe: stale row that the every_24h sweep should flip to expired
  ('mp-smoke-48.4-prop-expired',
   'dr-smoke-48.4-run-1', 'software-smoke-48.4', 'new_directive',
   ARRAY[]::text[],
   'Stale proposal — expired by sweep handler.',
   '{"priority":70,"conceptual_area":"test","source_type":"dream_worker"}'::jsonb,
   '{"sample_turn_ids":[],"phrasing_examples":[],"reasoning":"Past expires_at"}'::jsonb,
   6, 'pending',
   EXTRACT(EPOCH FROM NOW()) - 60*86400, EXTRACT(EPOCH FROM NOW()) - 86400, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
