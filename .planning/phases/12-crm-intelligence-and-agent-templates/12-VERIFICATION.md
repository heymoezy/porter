---
phase: 12-crm-intelligence-and-agent-templates
verified: 2026-03-22T10:45:00+08:00
status: passed
score: 11/11 must-haves verified
re_verification: true
gaps:
  - truth: "Smoke test validates correct API response key for timeline"
    status: resolved
    reason: "Fixed in 943fc0c — changed 'items' to 'timeline' in smoke-phase12.sh"
  - truth: "Smoke test targets correct Fastify backend port"
    status: resolved
    reason: "Fixed in 943fc0c — changed port 8877 to 3001 in smoke-phase12.sh"
human_verification: []
---

# Phase 12: CRM Intelligence + Agent Templates Verification Report

**Phase Goal:** CRM intelligence (AI contact analysis, activity timeline) and agent template catalog (100+ templates, instantiation)
**Verified:** 2026-03-22T10:45:00+08:00 (SGT)
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | contact_analyses table exists with all required columns and CHECK constraints | VERIFIED | migrate-12.ts: CREATE TABLE contact_analyses with CHECK on sentiment, engagement_score, churn_risk, relationship_stage; index idx_ca_contact |
| 2 | agent_templates table exists with all content columns and indexes | VERIFIED | migrate-12.ts: CREATE TABLE agent_templates with 17 columns, 2 indexes; confirmed idempotent migration guard |
| 3 | personas table has template_id column | VERIFIED | migrate-12.ts try/catch ALTER; schema.ts personas definition has templateId field (line 124) |
| 4 | Smoke test scaffold exists and can run | FAILED | smoke-phase12.sh is executable and has #!/usr/bin/env bash, but BASE_URL targets port 8877 (porter.py) not 3001 (Fastify), and line 129 checks "items" key instead of "timeline" |
| 5 | POST /api/v1/contacts/:id/analyze returns 202 with job_id | VERIFIED | contacts.ts line 196: POST /:id/analyze registered before GET /:id, returns 202 with ok({ job_id, message }) |
| 6 | Scheduler picks up contact_analysis jobs and writes results to contact_analyses table | VERIFIED | scheduler.ts line 311: contact_analysis handler, dynamic import of analyzeContact, INSERT INTO contact_analyses, markJobComplete + scheduleNextContactAnalysis re-enqueue |
| 7 | GET /api/v1/contacts/:id includes ai_analysis from the latest analysis row | VERIFIED | contacts.ts lines 232-251: queries contact_analyses WHERE contact_id = ? ORDER BY created_at DESC LIMIT 1, included as ai_analysis in response |
| 8 | GET /api/v1/contacts/:id/timeline returns all touchpoints in descending chronological order | VERIFIED | contacts.ts lines 447-521: UNION ALL across 4 arms (message, project_event, file, analysis), ORDER BY created_at DESC with LIMIT/OFFSET |
| 9 | GET /api/v1/templates returns at least 100 templates with fully populated fields | VERIFIED | seed-templates.ts: 103 insertTemplate() calls, python scan confirms no empty content fields; templates route returns parsed JSON fields |
| 10 | POST /api/v1/templates/:id/instantiate returns 201 with a ready agent | VERIFIED | templates.ts line 241: validates required_backends via probeBackend, required_tools via workspace_connections, creates persona row with template_id, writes SOUL/ROLE_CARD/IDENTITY/SKILLS .md files, rollback on failure |
| 11 | POST /api/v1/templates/:id/instantiate returns 422 with specific missing items when deps unavailable | VERIFIED | templates.ts lines 283-287: returns 422 err('MISSING_DEPENDENCIES', JSON.stringify({ missing_backends, missing_tools })) |

**Score:** 9/11 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/db/migrate-12.ts` | Phase 12 schema migration | VERIFIED | Exports migrate12CrmIntelligence(), migration ID 'phase12_crm_intelligence', 2 CREATE TABLE + 1 ALTER, seedTemplates() called after migration record insert |
| `backend/src/db/schema.ts` | Drizzle definitions for contactAnalyses and agentTemplates | VERIFIED | contactAnalyses (line 421), agentTemplates (line 436), personas.templateId (line 124) |
| `tests/smoke-phase12.sh` | Smoke test scaffold for all Phase 12 endpoints | PARTIAL | File exists, is executable, covers all 5 requirements — but BASE_URL wrong port (8877 vs 3001) and CRM-04 check uses wrong response key ("items" vs "timeline") |
| `backend/src/services/contact-analyzer.ts` | Ollama dispatch, prompt builder, JSON parser | VERIFIED | Exports ContactAnalysis interface + analyzeContact(); queries messages via contact_conversations JOIN; calls config.ollamaUrl + '/api/generate' with format:'json' and AbortSignal.timeout(30000); strips markdown fences; returns DEFAULT_ANALYSIS when no messages |
| `backend/src/routes/v1/contacts.ts` | POST /:id/analyze route and ai_analysis in GET /:id; GET /:id/timeline | VERIFIED | All three additions confirmed at lines 195, 232, 447 |
| `backend/src/services/scheduler.ts` | contact_analysis handler, re-enqueue loop, bootstrap seeder | VERIFIED | Handler at line 311, scheduleNextContactAnalysis export at line 47 (4h/12h/24h/6h), bootstrapContactAnalysis at line 77, called from start() at line 138 |
| `backend/src/routes/v1/templates.ts` | Template CRUD and instantiation routes | VERIFIED | GET /, GET /:id, POST /:id/instantiate with dependency validation, .md file writes, rollback |
| `backend/src/routes/v1/index.ts` | Route registration including templates | VERIFIED | Line 22: import templateV1Routes; line 46: register with prefix '/templates' |
| `backend/src/db/seed-templates.ts` | 100 template seed data function | VERIFIED | 103 insertTemplate() calls across 10 categories, sqlite.transaction() wrapper, idempotency guard (COUNT >= 100), called from migrate-12.ts |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| backend/src/db/migrate-12.ts | backend/src/db/schema.ts | table names must match between raw SQL and Drizzle | VERIFIED | SQL: contact_analyses / agent_templates; Drizzle: contactAnalyses / agentTemplates — column names match |
| backend/src/services/scheduler.ts | backend/src/services/contact-analyzer.ts | dynamic import of analyzeContact | VERIFIED | Line 328: const { analyzeContact } = await import('./contact-analyzer.js') |
| backend/src/routes/v1/contacts.ts | agent_jobs table | INSERT with trigger_type='contact_analysis' | VERIFIED | Line 196+ POST /:id/analyze inserts into agent_jobs with trigger_type='contact_analysis' |
| backend/src/services/contact-analyzer.ts | Ollama REST API | fetch to config.ollamaUrl + '/api/generate' | VERIFIED | Line 168: fetch(`${config.ollamaUrl}/api/generate`, ...) |
| scheduler.ts (handler) | agent_jobs table | re-enqueue via scheduleNextContactAnalysis | VERIFIED | Lines 355 and 364: scheduleNextContactAnalysis called on both success and error paths |
| scheduler.ts (start) | agent_jobs table | bootstrapContactAnalysis seeds on startup | VERIFIED | Line 138: bootstrapContactAnalysis() called inside start() before setInterval |
| backend/src/routes/v1/index.ts | backend/src/routes/v1/templates.ts | import and register with prefix '/templates' | VERIFIED | Lines 22 and 46 |
| backend/src/routes/v1/templates.ts | personas table + filesystem | INSERT into personas + fs.writeFile for .md files | VERIFIED | Lines 302, 315-321: INSERT INTO personas with template_id, writes SOUL/ROLE_CARD/IDENTITY/SKILLS .md files |
| backend/src/db/seed-templates.ts | agent_templates table | 100+ INSERT statements in transaction | VERIFIED | 103 insertTemplate() calls, all wrapped in sqlite.transaction() |
| backend/src/index.ts | backend/src/db/migrate-12.ts | migrate12CrmIntelligence() called in boot sequence | VERIFIED | Lines 31 and 145: import and call after migrate11UnifiedChat |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CRM-03 | 12-01, 12-02 | AI-powered contact analysis generated from interaction history | SATISFIED | contact-analyzer.ts queries real message history, scheduler handler writes to contact_analyses, POST /contacts/:id/analyze returns 202, GET /contacts/:id includes ai_analysis |
| CRM-04 | 12-01, 12-03 | Contact activity timeline aggregates all touchpoints across projects | SATISFIED | GET /contacts/:id/timeline: UNION ALL of messages, project_events, files, analyses with pagination |
| TMPL-01 | 12-01, 12-04 | 100 agent templates with complete skills, tools, and system prompt definitions | SATISFIED | 103 templates with all 5 content fields non-empty, confirmed by python scan |
| TMPL-02 | 12-01, 12-04 | Templates searchable and filterable by category via API | SATISFIED | GET /templates?category= and GET /templates?tag= using json_each() for tag matching |
| TMPL-03 | 12-01, 12-04 | Template instantiation creates a fully configured, ready-to-work agent | SATISFIED | POST /templates/:id/instantiate validates deps, creates persona row with template_id, writes 4 .md files, rollback on failure, returns 422 for missing deps |

All 5 requirement IDs (CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03) from plan frontmatter are verified in code. No orphaned requirements found — REQUIREMENTS.md Traceability table maps all 5 to Phase 12 with status "Complete".

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tests/smoke-phase12.sh | 9 | BASE_URL points to port 8877 (porter.py) — Phase 12 routes only exist on Fastify at port 3001 | Blocker | All smoke test assertions will fail when actually run against the real backend |
| tests/smoke-phase12.sh | 129 | Checks for `"items"` key in timeline response but API returns `"timeline"` key | Blocker | CRM-04 timeline check always fails |

No anti-patterns found in implementation files (contact-analyzer.ts, scheduler.ts, contacts.ts, templates.ts, seed-templates.ts, migrate-12.ts, schema.ts).

---

## Human Verification Required

None. All Phase 12 deliverables are pure API — no frontend, no visual behavior, no real-time UX to verify.

---

## Gaps Summary

Two defects in `tests/smoke-phase12.sh` only — all implementation code is correct and fully wired.

**Gap 1: Wrong port in smoke test BASE_URL**
The smoke test scaffold was committed with `BASE_URL="http://127.0.0.1:8877/api/v1"`. The Fastify backend (where all Phase 12 routes live) listens on port 3001 by default (`config.port = process.env.PORTER_BACKEND_PORT || 3001`). Port 8877 is porter.py, which has no /api/v1/contacts/:id/analyze, /api/v1/contacts/:id/timeline, or /api/v1/templates routes. Running the smoke test as-is will produce 404s for all Phase 12 endpoints.

**Gap 2: Wrong response key in timeline check**
Line 129 of smoke-phase12.sh checks for `"items"` in the timeline response. The actual implementation at contacts.ts line 516 returns `{ timeline: rows, total, limit, offset }`. The key is `timeline`, not `items`. This assertion will always fail even if the port were corrected.

**Root cause:** Both gaps are in the smoke test scaffold only — the implementation (API routes, scheduler, seed data) is correct. The smoke test was not validated against the actual API responses before commit.

**Fix required:** Two one-line changes to smoke-phase12.sh:
1. Line 9: `BASE_URL="http://127.0.0.1:3001/api/v1"`
2. Line 129: change `'"items"'` to `'"timeline"'`

---

_Verified: 2026-03-22T10:45:00+08:00 (SGT)_
_Verifier: Claude (gsd-verifier)_
