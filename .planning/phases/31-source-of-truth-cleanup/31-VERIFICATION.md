---
phase: 31-source-of-truth-cleanup
verified: 2026-04-02T12:46:42Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 31: Source of Truth Cleanup Verification Report

**Phase Goal:** template_skills and persona_skills junction tables are the single source of truth for all skill assignments -- SKILLS.md is a thin generated manifest, skills_text is deprecated, and no skill data is duplicated across DB columns and files
**Verified:** 2026-04-02T12:46:42Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | template_skills junction table contains rows matching templates' JSONB skill arrays | VERIFIED | `SELECT COUNT(*) FROM template_skills` returns 91 rows; migration script at `backend/scripts/migrate-skills-sot.ts` (100 lines) performs exact+fuzzy matching |
| 2 | persona_skills has skill_id column with 17 porter-core rows migrated | VERIFIED | `SELECT COUNT(*) FROM persona_skills WHERE skill_id IS NOT NULL` returns 17; schema.ts line 806 defines `skillId: text('skill_id')` |
| 3 | skills_text column is preserved but marked deprecated | VERIFIED | schema.ts line 493: `skillsText: text('skills_text').notNull().default(''), // DEPRECATED (SOT-05)` and line 805: `skillName: text('skill_name').notNull(), // DEPRECATED` |
| 4 | Instantiating a template creates persona_skills from template_skills and generates SKILLS.md from DB | VERIFIED | templates.ts lines 270-276 reads template_skills with no JSONB fallback; line 363 calls `generateSkillsManifest()` not skills_text; no `writeFile.*skills_text` patterns anywhere in src/ |
| 5 | SKILLS.md is a thin manifest with skill IDs, descriptions, pack paths -- no prose | VERIFIED | skills-manifest.ts (87 lines) queries `persona_skills JOIN skills`, outputs skill IDs, names, descriptions (120 char max), pack paths grouped by category; header says "Auto-generated manifest. Do not edit manually." |
| 6 | Forge Station 2 writes persona_skills with skill_id | VERIFIED | forge.ts line 391 reads `template_skills`, line 401 INSERTs with `skill_id`; admin/forge.ts line 373 same junction query, line 383 INSERTs with `skill_id`; both call `writeSkillsManifest` after station advance |
| 7 | Toggling/deleting skills via API uses skill_id and triggers SKILLS.md regeneration | VERIFIED | admin/skills.ts line 206 toggle uses `skill_id = $2 OR skill_name = $2`, line 222 calls `writeSkillsManifest`; delete at line 184 finds affected personas, line 197 regenerates manifests; v1/admin/skills.ts has matching patterns at lines 194-204 and 226-230 |
| 8 | rpg-engine SKILLS.md generation reads skill_id and joins skills table | VERIFIED | rpg-engine.ts lines 725-731 queries `template_skills ts LEFT JOIN skills s ON s.id = ts.skill_id`; lines 814-818 output uses `s.skill_id`, `s.display_name`, `s.description`, pack path |
| 9 | No code path reads skills_text during instantiation | VERIFIED | `grep -rn "writeFile.*skills_text"` across all src/ returns zero matches; templates.ts skills_text only appears in formatTemplate (display/listing), not in instantiation flow |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/scripts/migrate-skills-sot.ts` | One-shot migration script, min 80 lines | VERIFIED | 100 lines, idempotent DDL + JSONB-to-junction migration + report |
| `backend/src/db/schema.ts` | skillId column in personaSkills | VERIFIED | Line 806: `skillId: text('skill_id')` |
| `backend/src/services/skills-manifest.ts` | generateSkillsManifest + writeSkillsManifest exports, min 40 lines | VERIFIED | 87 lines, exports both functions, queries persona_skills JOIN skills |
| `backend/src/routes/v1/templates.ts` | Uses generateSkillsManifest, no skills_text writeFile | VERIFIED | Line 5 imports, line 363 calls generateSkillsManifest |
| `backend/src/services/forge.ts` | Station 2 uses skill_id, calls writeSkillsManifest | VERIFIED | Lines 389-420 read template_skills, insert with skill_id, call writeSkillsManifest |
| `backend/src/services/admin/forge.ts` | Station 2 uses skill_id, calls writeSkillsManifest | VERIFIED | Lines 371-403 read template_skills, insert with skill_id, call writeSkillsManifest |
| `backend/src/routes/admin/skills.ts` | Toggle uses skill_id, delete regenerates manifests | VERIFIED | Toggle at line 206 with skill_id, delete at line 178 with affected persona regeneration |
| `backend/src/routes/v1/admin/skills.ts` | Delete cascades junction tables, toggle regenerates | VERIFIED | Lines 194-204 cascade delete with regeneration, lines 226-230 toggle regeneration |
| `backend/src/services/rpg-engine.ts` | skill_id join in SKILLS.md generation | VERIFIED | Lines 725-731 JOIN template_skills to skills, lines 814-818 enriched output |
| `backend/src/db/migrate-sot-v1.ts` | DDL migration for persona_skills.skill_id | VERIFIED | Exists (separate file following codebase pattern) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| migrate-skills-sot.ts | template_skills | INSERT INTO template_skills | WIRED | Lines 25, 38: parameterized INSERTs with ON CONFLICT DO NOTHING |
| migrate-skills-sot.ts | persona_skills | UPDATE skill_id | WIRED | Lines 58-74: UPDATE persona_skills SET skill_id |
| templates.ts | template_skills | SELECT from template_skills | WIRED | Lines 271-274: junction query, no JSONB fallback |
| templates.ts | skills-manifest.ts | import generateSkillsManifest | WIRED | Line 5 import, line 363 invocation |
| forge.ts | template_skills | SELECT from template_skills | WIRED | Lines 390-393: junction query |
| forge.ts | skills-manifest.ts | import writeSkillsManifest | WIRED | Line 14 import, line 420 invocation |
| admin/forge.ts | template_skills | SELECT from template_skills | WIRED | Lines 372-375: junction query |
| admin/forge.ts | skills-manifest.ts | import writeSkillsManifest | WIRED | Line 17 import, line 403 invocation |
| admin/skills.ts | skills-manifest.ts | import writeSkillsManifest | WIRED | Line 5 import, lines 197, 222 invocations |
| v1/admin/skills.ts | skills-manifest.ts | import writeSkillsManifest | WIRED | Line 6 import, lines 204, 230 invocations |
| rpg-engine.ts | template_skills + skills | JOIN on skill_id | WIRED | Lines 730-731: LEFT JOIN skills s ON s.id = ts.skill_id |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| SOT-01 | 31-01 | template_skills junction table is canonical source for template-to-skill mappings | SATISFIED | 91 rows in DB; instantiation reads from junction; no JSONB fallback in any creation path |
| SOT-02 | 31-01 | persona_skills uses skill_id not skill_name | SATISFIED | skill_id column added; 17 rows migrated; all INSERT paths write skill_id; toggle uses skill_id |
| SOT-03 | 31-02 | SKILLS.md is thin manifest generated from DB at instantiate-time | SATISFIED | skills-manifest.ts generates from persona_skills JOIN skills; templates.ts line 363 calls it |
| SOT-04 | 31-02 | Instantiation reads from template_skills, not skills_text | SATISFIED | templates.ts line 270 reads template_skills; no skills_text writeFile in any src/ path |
| SOT-05 | 31-01 | skills_text deprecated, preserved but not read during instantiation | SATISFIED | schema.ts line 493 has DEPRECATED comment; no writeFile with skills_text found |
| SOT-06 | 31-03 | Skill assignment changes trigger SKILLS.md regeneration | SATISFIED | Toggle and delete endpoints in both admin/skills.ts and v1/admin/skills.ts call writeSkillsManifest; forge Station 2 generates after advance |

**All 6 requirements SATISFIED. No orphaned requirements.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

No TODO/FIXME/HACK/PLACEHOLDER patterns found in any new or modified files. No empty implementations. No stub returns. No console.log-only handlers.

### Human Verification Required

### 1. Template Instantiation End-to-End

**Test:** Instantiate a template via `POST /api/v1/templates/:id/instantiate` and check the resulting persona directory for SKILLS.md content.
**Expected:** SKILLS.md contains skill IDs, pack paths, category groupings, "Auto-generated manifest" header -- not prose from skills_text.
**Why human:** Requires running server with valid auth session and a template that has template_skills rows.

### 2. Forge Pipeline End-to-End

**Test:** Submit a forge item and let it progress through Station 2. Verify persona_skills rows and SKILLS.md file.
**Expected:** persona_skills rows have skill_id populated; SKILLS.md on disk matches DB data.
**Why human:** Requires forge pipeline to be running and a valid forge item to process.

### 3. Toggle Endpoint Regeneration

**Test:** Toggle a skill assignment via `PUT /admin/skills/:personaId/:skillId/toggle` and check the persona's SKILLS.md on disk.
**Expected:** SKILLS.md is regenerated immediately reflecting the new enabled/disabled state.
**Why human:** Requires running server, valid auth, persona with skills assigned.

### Gaps Summary

No gaps found. All 9 observable truths verified against the actual codebase. All 6 requirements (SOT-01 through SOT-06) are satisfied with concrete code evidence. All artifacts exist, are substantive (not stubs), and are properly wired. TypeScript compiles clean with zero errors. All 6 commits verified in git log.

The phase goal is achieved: template_skills and persona_skills junction tables are the single source of truth. SKILLS.md is generated from DB data. skills_text is deprecated. No skill data is duplicated in code paths.

---

_Verified: 2026-04-02T12:46:42Z_
_Verifier: Claude (gsd-verifier)_
