---
phase: 36-skill-quality-scoring
verified: 2026-04-03T02:17:41Z
status: gaps_found
score: 1/5 must-haves verified
gaps:
  - truth: "Every skill has a quality_score (0-100) computed from the 7-component formula"
    status: failed
    reason: "The scoring formula (computePackDiagnostics) was implemented in admin/backend/src/services/skill-library.ts (the archived standalone admin backend, not used in production). The production Brain backend at :3001 (backend/src/routes/admin/skills.ts) does not call computePackDiagnostics and returns no qualityScore field. All 207 skills have quality_score=0 in the DB."
    artifacts:
      - path: "backend/src/routes/admin/skills.ts"
        issue: "Production skills route does not call computePackDiagnostics, does not return qualityScore or qualityTier"
      - path: "backend/src/services/"
        issue: "No skill-library.ts or computePackDiagnostics exists in the production backend"
    missing:
      - "Port computePackDiagnostics from admin/backend/src/services/skill-library.ts into backend/src/services/"
      - "Update backend/src/routes/admin/skills.ts GET / handler to call computePackDiagnostics and return qualityScore + qualityTier per skill"
      - "Add tiers{} summary object to the list response"

  - truth: "Quality tiers (scaffold/baseline/production/high-performing/stale) are derived from score and shown instead of ready/partial/missing"
    status: failed
    reason: "Production Brain endpoint returns pack_status (old ready/partial/missing system) with no qualityTier field. The tier logic is correct in admin/backend/ source but that backend is archived/unused. The admin frontend receives data without qualityTier and quality badges show nothing."
    artifacts:
      - path: "backend/src/routes/admin/skills.ts"
        issue: "Returns pack_status ('ready'/'partial'/'missing'), no qualityTier field in response"
    missing:
      - "Add qualityTier computation to Brain backend skills list and detail handlers"
      - "Include 5 tiers (scaffold/baseline/production/high-performing/stale) in response"

  - truth: "Skills table and marketplace show quality tier badges with color coding instead of ready/partial/missing"
    status: failed
    reason: "Frontend build (Apr 3 01:56) correctly has SkillQualityBadge with all 5 tiers and tier filter pills in both table and grid views. However the Brain backend response has no qualityTier field, so SkillQualityBadge renders nothing and tier filter pills never populate (tiers{} absent from response)."
    artifacts:
      - path: "admin/frontend/app/components/skill-quality-badge.tsx"
        issue: "EXISTS and correct — all 5 tiers with proper color coding. NOT a frontend issue."
      - path: "backend/src/routes/admin/skills.ts"
        issue: "Response missing qualityTier and tiers{} — badge has no data to render"
    missing:
      - "Backend fix only: add qualityTier to skills list response and tiers{} to summary"

  - truth: "Admin can filter skills by quality tier in both table and grid views"
    status: failed
    reason: "Tier filter pills in skills-studio.tsx and skills-marketplace.tsx are correctly implemented and wired to filter by qualityTier. BUT tier pills only render when data.tiers has entries with count > 0. Since Brain backend returns no tiers{} field, all filter pills are invisible. The filtering logic is correct but starved of data."
    artifacts:
      - path: "admin/frontend/app/components/forge/skills-studio.tsx"
        issue: "Code is correct (line 114: filter by qualityTier, lines 276-284: tier pills). No data from backend."
      - path: "admin/frontend/app/components/forge/skills-marketplace.tsx"
        issue: "Code is correct (line 58: filter by qualityTier, lines 154-162: tier pills). No data from backend."
    missing:
      - "Backend fix only: return tiers{scaffold, baseline, production, high-performing, stale} counts in skills list response"

  - truth: "A quality audit API endpoint scores all skills, updates the DB, and returns a scaffolds report"
    status: failed
    reason: "The audit endpoint GET /api/admin/skills/audit was implemented in admin/backend/src/routes/skills.ts (archived backend). The production Brain backend at :3001 has no /api/admin/skills/audit route — returns 404 {'error': 'Not found'}. The Audit button in the frontend calls this endpoint and it fails silently."
    artifacts:
      - path: "backend/src/routes/admin/skills.ts"
        issue: "No /audit route in production skills handler"
      - path: "admin/backend/src/routes/skills.ts"
        issue: "Has the audit endpoint but this backend is archived (port 5175, not used in production)"
    missing:
      - "Port the /audit handler from admin/backend/src/routes/skills.ts into backend/src/routes/admin/skills.ts"
      - "Update DB with quality_score and quality_tier for all skills when audit runs"
      - "Register migration 036_skill_quality_scoring in schema_migrations (currently missing, though columns exist)"
---

# Phase 36: Skill Quality Scoring Verification Report

**Phase Goal:** Every skill has a measurable quality score that distinguishes scaffold filler from production-ready content — admin can see at a glance which skills are real and which need work
**Verified:** 2026-04-03T02:17:41Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Root Cause Summary

Phase 36 was executed by Gemini CLI entirely in the **wrong backend**. The Porter monorepo has undergone an architectural merge: Brain + Admin were merged into one process at `:3001` (`backend/` directory). The standalone admin backend at `:5175` (`admin/backend/`) is archived and no longer used in production.

Gemini implemented all quality scoring logic in `admin/backend/` (the archived backend) rather than `backend/` (the production backend). The result is well-written code in the wrong place.

**What IS correct (in the wrong location):**
- `computePackDiagnostics()` with 7-component 0-100 formula in `admin/backend/src/services/skill-library.ts`
- `/audit` endpoint with batch scoring + DB update in `admin/backend/src/routes/skills.ts`
- `migrate-qlt-v1.ts` migration (imported and called from the Brain's `backend/src/index.ts` — this one landed correctly)
- DB schema updated: `quality_score` and `quality_tier` columns added to `skills` table in `backend/src/db/schema.ts`

**What IS correct (in the right location):**
- Frontend build (Apr 3 01:56) has all Phase 36 UI: `SkillQualityBadge` with 5 tiers, tier filter pills in both views, score breakdown in `skill-pack-explorer`

**What is MISSING from production:**
- `computePackDiagnostics` not called in `backend/src/routes/admin/skills.ts`
- No `qualityTier`, `qualityScore` in Brain backend skills API response
- No `tiers{}` summary in Brain backend response
- No `/audit` endpoint at `/api/admin/skills/audit` in Brain backend

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every skill has quality_score (0-100) from 7-component formula | FAILED | Brain backend response has no qualityScore field; DB shows quality_score=0 for all 207 skills |
| 2 | Quality tiers replace ready/partial/missing | FAILED | Brain returns `pack_status` (old system), no `qualityTier`; all skills default to scaffold in DB |
| 3 | Skills table and marketplace show quality tier badges | FAILED | Frontend badge component exists and is correct; Brain response has no `qualityTier` to display |
| 4 | Admin can filter skills by quality tier in both views | FAILED | Filter pills wired correctly in frontend; never populate since `tiers{}` absent from Brain response |
| 5 | Quality audit API endpoint scores all skills and returns report | FAILED | No `/audit` route on Brain backend (:3001); returns 404 |

**Score: 1/5** (DB schema columns exist — partial credit for the DB migration landing correctly)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/db/migrate-qlt-v1.ts` | Migration adds quality columns | VERIFIED | Exists, imported in Brain index.ts, columns added to DB |
| `backend/src/db/schema.ts` | skills table has quality_score + quality_tier | VERIFIED | Lines 850-851 confirmed |
| `backend/src/routes/admin/skills.ts` | Returns qualityScore, qualityTier, tiers in list response | MISSING | Returns pack_status only; no quality fields |
| `backend/src/routes/admin/skills.ts` (audit) | GET /audit endpoint | MISSING | No audit route in production skills handler |
| `admin/frontend/app/components/skill-quality-badge.tsx` | 5-tier badge component | VERIFIED | All 5 tiers with correct colors |
| `admin/frontend/app/components/forge/skills-studio.tsx` | Tier filter pills + audit button | VERIFIED | Wired correctly; just needs backend data |
| `admin/frontend/app/components/forge/skills-marketplace.tsx` | Tier filter pills | VERIFIED | Wired correctly; just needs backend data |
| `admin/frontend/app/routes/skill-pack-explorer.tsx` | Score breakdown display | VERIFIED | Renders component breakdown when diagnostics present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `skills-studio.tsx` | `/api/admin/skills/` | `useQuery api call` | BROKEN | Brain response lacks qualityTier/tiers{} |
| `skills-studio.tsx` | `/api/admin/skills/audit` | `useMutation GET` | NOT_WIRED | 404 from Brain backend |
| `skills-marketplace.tsx` | `qualityTier` filter | `activeTier state` | BROKEN | tiers{} never populated |
| `skill-pack-explorer.tsx` | `diagnostics.components` | `DiagnosticsSummary` | BROKEN | Brain detail endpoint returns no diagnostics |
| Brain index.ts | `migrateQltV1` | `await migrateQltV1(pool)` | PARTIAL | Migration runs but schema_migrations entry not found; columns exist (ALTER IF NOT EXISTS) |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| QLT-01 | Quality score computed from 7 components | BLOCKED | Formula exists in wrong backend; Brain returns no qualityScore |
| QLT-02 | Quality tiers replace pack_status | BLOCKED | Tiers correct in archived backend; Brain returns pack_status only |
| QLT-03 | Skills table and marketplace show quality tier badges | BLOCKED | Frontend wired; no data from Brain backend |
| QLT-04 | Admin can filter skills by quality tier | BLOCKED | Filter logic correct; tiers{} absent from response starves the UI |
| QLT-05 | Quality audit endpoint scores all skills | BLOCKED | /audit not registered on Brain backend; 404 in production |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `admin/backend/src/services/skill-library.ts` | 213-294 | Full implementation in archived backend | BLOCKER | All quality scoring logic unreachable in production |
| `admin/backend/src/routes/skills.ts` | 99-157 | Audit endpoint in archived backend | BLOCKER | Audit feature unreachable at runtime |
| `backend/src/routes/admin/skills.ts` | 60-78 | Skills mapped with no quality fields | BLOCKER | Production response missing 5 required fields |
| `backend/src/db/schema.ts` | 850-851 | quality columns defined | INFO | Correct — columns exist in schema and DB |

### Human Verification Required

None needed — all gaps are verified programmatically.

## Gaps Summary

All 5 success criteria fail for the same root cause: **Gemini implemented Phase 36 in the archived `admin/backend/` instead of the production `backend/` directory.**

The fix is surgical — port the quality scoring logic from `admin/backend/src/services/skill-library.ts` and the audit endpoint from `admin/backend/src/routes/skills.ts` into the production backend at `backend/src/routes/admin/skills.ts`. The frontend is complete and correct.

**Specific files to update:**
1. `backend/src/routes/admin/skills.ts` — add quality scoring to list handler (computePackDiagnostics call or equivalent), add `tiers{}` to summary, add `/audit` endpoint
2. `backend/src/services/skill-library.ts` (create) — port `computePackDiagnostics`, `SCAFFOLD_PHRASES`, `listSkillFiles` helpers from `admin/backend/src/services/skill-library.ts`

**DB note:** Quality columns exist in the DB but `schema_migrations` does not have `036_skill_quality_scoring`. The Brain's `migrateQltV1` will register it on the next restart (idempotent via ADD COLUMN IF NOT EXISTS).

---

_Verified: 2026-04-03T02:17:41Z_
_Verifier: Claude Sonnet 4.6 (gsd-verifier)_
