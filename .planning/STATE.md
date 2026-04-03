---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Living Skills
status: unknown
stopped_at: Completed 39-02-PLAN.md
last_updated: "2026-04-03T08:10:09.698Z"
progress:
  total_phases: 9
  completed_phases: 8
  total_plans: 24
  completed_plans: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Skills must be live behavioral modules — selected at runtime, injected into prompts, measured, and evolved through feedback.
**Current focus:** Phase 39 — Bridge Task Dispatch

## Current Position

Phase: 39 (Bridge Task Dispatch) — EXECUTING
Plan: 1 of 3

## Performance Metrics

**Velocity (from v1.0 + v2.0 + v3.0 + v4.0):**

- Total plans completed: 89 (51 from v1.0, 2 from v2.0, 19 from v3.0, 17 from v4.0)
- Phases completed: 29 across all milestones
- Average plan duration: ~6 min

## Accumulated Context

### Decisions

- [v5.0]: template_skills and persona_skills junction tables are THE source of truth — not JSONB arrays, not skills_text prose
- [v5.0]: SKILLS.md is a thin manifest generated from DB assignments — not hand-authored content
- [v5.0]: Skills are injected into prompts at dispatch time based on task relevance — not all assigned skills, only selected subset
- [v5.0]: Feedback must hit persistence — if it isn't stored, it didn't happen
- [v5.0]: Quality must be measurable — "files exist" ≠ "skill is good"
- [v5.0]: Evolution must be observable — what changed, why, whether it helped
- [v5.0]: Current state: template_skills has 0 rows, persona_skills has 17 rows (porter-core only), skills_text on all 107 templates, 81% of 209 skill packs are scaffold filler
- [Phase 31]: Used separate migration file (migrate-sot-v1.ts) following codebase convention instead of appending to consolidated migration
- [Phase 31]: 361/452 JSONB tags unmatched (short tags vs skill slugs) -- expected, not a failure
- [Phase 31]: Removed JSONB fallback for skills -- template_skills junction is now the only source in instantiation and forge
- [Phase 31]: Kept JSONB fallback for tools (out of scope for skills SOT cleanup)
- [Phase 31]: skill_id used as both skill_name and skill_id in persona_skills INSERT (skill_name column is deprecated)
- [Phase 31]: Toggle endpoint uses skill_id with OR skill_name fallback for backwards compat during transition
- [Phase 31]: v1/admin/skills.ts delete was missing junction table cleanup -- fixed as part of SOT-06
- [Phase 31]: rpg-engine query fixed from nonexistent skill_name column to skill_id with LEFT JOIN to skills table
- [Phase 32-00]: Admin Playwright tests use full URL (http://127.0.0.1:5175) not baseURL override — keeps Brain base URL clean for existing regression tests
- [Phase 32-00]: motion-designer used as TEST_SKILL constant — always present, has scaffold content covering both populated and empty file states
- [Phase 32-00]: PKX-0N test naming convention enables --grep PKX-0N targeted test runs throughout Phase 32
- [Phase 32-skill-pack-explorer]: Fast quality tier (size heuristic) on list endpoint, full word-count diagnostics only on detail — avoids ~1045 readFileSync calls
- [Phase 32-skill-pack-explorer]: PUT /:id/files/* registered before generic PUT /:id to prevent Fastify route param shadowing on file writes
- [Phase 32-02]: Eager-import lang/theme modules but lazy-import only the React CodeMirror component — simpler SSR safety
- [Phase 32-02]: Two-layer dirty guard: confirm() for within-page file switching, useBlocker for SPA navigation
- [Phase 32-02]: retry:false on file content query — 404 for missing files becomes isError so empty editor shows
- [Phase 32-skill-pack-explorer]: Plan 02 prerequisites created inline during plan 03 execution as Rule 3 auto-fix (skill-quality-badge.tsx, skill-pack-explorer.tsx, CodeMirror, route)
- [Phase 32-skill-pack-explorer]: s.name used as skill ID in agent-detail Link (persona_skills stores skill_id in name field per Phase 31)
- [Phase 33-01]: scoreSkill exported as pure function — testable without DB/FS mocking, description +2, tag +3, trigger +3, name part +1
- [Phase 33-01]: SCORE_THRESHOLD=1 (any match qualifies) ensures inclusive selection; MAX_SELECTED=3 caps injected skills per dispatch
- [Phase 33-01]: bridge_dispatch_log.skills_used JSONB column added with GIN index for future skill telemetry analytics
- [Phase 33-01]: selectSkills wraps full body in try/catch — fire-and-forget safe, never throws during dispatch pipeline
- [Phase 33]: skillsUsed shape defined inline in RoutingContext — no cross-service imports, serializable subset sufficient for JSONB logging
- [Phase 33]: stream-service.ts required zero changes — ctxOverride spread already propagates skillsUsed automatically
- [Phase 33]: Full RTS loop complete: selectSkills called at dispatch, skill prompts injected into systemPrompt, telemetry persisted in bridge_dispatch_log.skills_used
- [Phase 34-00]: FBK test stubs use test.skip(true, 'TODO: Enable after Wave N...') rather than test.todo() — enables single-line activation with no structural changes
- [Phase 34-01]: __DISPATCH_META__ token convention threads dispatch_id from routing-engine to SSE done event without changing StreamBackend interface
- [Phase 34-01]: times_selected increment uses COALESCE(skill_id, skill_name) for backwards compat with pre-Phase-31 persona_skills rows
- [Phase 34]: Fan-out feedback per selected skill — one skill_feedback_events row per skill for granular attribution
- [Phase 34]: dispatchId lives in React state only (not sessionStorage) — feedback buttons are ephemeral, no persistence needed
- [Phase 34]: Template effectiveness placed in BUILD tab of agent-detail.tsx — BUILD tab is data-driven view, logical home for aggregated metrics
- [Phase 34]: FBK-04 test stubs expect camelCase keys (skillId/agentId) but plan spec uses snake_case — left as snake_case per plan, test keys need update when enabling FBK-04
- [Phase 35-01]: Migration ID 035_skill_evolution_proposals follows 034_ prefix convention from Phase 34
- [Phase 35-01]: analyzeSkillEvolution is a pure analytics function — reads feedback, writes proposals, no other side effects
- [Phase 35-01]: Deduplication check on persona_id + skill_id + change_type + status=pending prevents proposal explosion across 6h analyzer runs
- [Phase 35-01]: triggering_feedback_ids capped at 20 entries per proposal to avoid bloated JSONB
- [Phase 35-02]: regenSkillsManifest inlined to avoid cross-service coupling; config.personasDir used for path consistency; rewrite_prompt/enrich_examples flagged for manual follow-up; effectiveness_before captured before mutation
- [Phase 35]: EvolutionPanel uses proposals list filtered to non-pending for history tab — avoids evolution_events join complexity since proposals already carry persona/skill names
- [Phase 35]: SkillsStudio tab ternary wraps existing content in fragment — zero restructuring of existing skills rendering logic
- [Phase 37-01]: Preview endpoint uses /skills-preview hyphenated path to avoid Fastify param collision with /:id/skills/:skillId
- [Phase 37-01]: scoreSkill replicated inline in admin backend — no cross-service import from backend/ into admin/backend/
- [Phase 37-01]: Mandatory skills (is_mandatory=1) always included in preview selected list regardless of SCORE_THRESHOLD
- [Phase 37-02]: TemplateSkillsTab is fully self-contained — parent passes only templateId, no prop drilling of query data
- [Phase 37-02]: Removed unused templateEffectiveness useQuery from agent-detail.tsx parent — effectiveness now owned by TemplateSkillsTab
- [Phase 37-02]: Template SKILLS tab (!isInstance) and born-agent SKILLS tab (hasApi) coexist with same label but different tab values
- [Phase 38]: dispatchCompression uses internal Bridge HTTP — avoids circular imports and reuses gateway selection
- [Phase 38]: triggerCompression is fire-and-forget from upsertSession — zero latency cost on dispatch hot path
- [Phase 38-adaptive-agent-context]: [Phase 38-01]: scoreDirective uses (10 - floor(priority/10)) for priority bonus; ALWAYS_INJECT_THRESHOLD=2; SkillCandidate gains tags field; directiveStats travels via RoutingContext; selectDirectives fallback when no task context
- [Phase 38]: context_stats written via UPDATE after INSERT — session data only available after upsertSession resolves
- [Phase 38]: Admin routes are at routes/admin/bridge.ts — routes/v1/admin/bridge.ts is not registered in index.ts (dead duplicate)
- [Phase 39]: executeTask is a standalone async generator (not class method) — simpler, testable, no this binding
- [Phase 39]: Separate getTaskQueue from dispatch-queues.ts — task queues must not share concurrency with chat requests
- [Phase 39]: CWD_ALLOWLIST is a module constant — security gate not config-driven, intentionally restrictive
- [Phase 39]: List endpoint truncates prompt to 200 chars and output to 500 chars — full content only via detail endpoint
- [Phase 39]: paramIdx counter pattern used for dynamic WHERE clause building in bridge task list endpoint
- [Phase 39-02]: runTaskInBackground is fire-and-forget (void) keeping POST /dispatch response immediate at 202
- [Phase 39-02]: In-memory runningTasks Map<string, AbortController> for cancel — no DB round-trip on cancel hot path

### Roadmap Evolution

- Phase 38 added: Adaptive Agent Context — smart directive injection, agent self-querying of memory DB, 50+ turn deep execution, tool output compression. Inspired by Tasklet.ai patterns. Depends on Phase 35 + 36.

### Pending Todos

None yet.

### Blockers/Concerns

- [v5.0]: 81% of skill packs are scaffold filler — quality enrichment is a content problem, not just a code problem
- [v5.0]: persona_skills uses skill_name not skill_id — needs migration for consistency
- [v5.0]: template_skills is completely empty — migration must populate from template JSONB arrays

## Session Continuity

Last session: 2026-04-03T08:10:09.695Z
Stopped at: Completed 39-02-PLAN.md
Resume file: None
