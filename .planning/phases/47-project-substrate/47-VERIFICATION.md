---
phase: 47-project-substrate
verified: 2026-04-03T19:30:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 47: Project Substrate Verification Report

**Phase Goal:** Every project folder is a structured container — a canonical /_system/ directory, defined intake and work directories, intelligent file ingress that classifies and routes uploads, and an Atlas agent watching for structural drift
**Verified:** 2026-04-03T19:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Creating a project automatically provisions a /_system/ directory containing all 6 seed .md files | VERIFIED | `provisionProjectStructure` in project-substrate.ts iterates `SYSTEM_FILES` and writes each file if absent; called in POST /api/v1/projects handler (line 113) |
| 2 | A new project folder has all canonical directories: /_system/, /intake/, /context/, /work/, /outputs/, /archive/ | VERIFIED | `CANONICAL_DIRS = ['_system', 'intake', 'context', 'work', 'outputs', 'archive']` iterated with `fs.mkdir({ recursive: true })` in provisionProjectStructure |
| 3 | Uploading a file to a project triggers the intelligence ingress pipeline: classify, move, memory signal, update project context | VERIFIED | `processIngress` in file-ingress.ts implements all 7 steps; called from files.ts registry upload handler (line 675) guarded by `if (projectId)` |
| 4 | Atlas agent detects and repairs structural drift — missing directories are recreated, misplaced files are flagged, repair logged in project activity | VERIFIED | `runAtlasCheck` in atlas-agent.ts auto-repairs missing canonical dirs, flags missing _system files, flags root misplacements; `logAtlasFindings` inserts to agent_activity; wired into scheduler at 30-min interval (ATLAS_CHECK_INTERVAL=900) |

**Score:** 4/4 success criteria verified

---

### Plan 01 Must-Haves (PSB-01, PSB-02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/v1/projects provisions filesystem with /_system/ and 6 canonical subdirectories | VERIFIED | project-substrate.ts:90-92 iterates CANONICAL_DIRS with fs.mkdir |
| 2 | _system/ contains all 6 seed .md files | VERIFIED | SYSTEM_FILES record has project.md, checkpoint.md, memory.md, decisions.md, tasks.md, agents.md |
| 3 | projects table has fs_path TEXT column | VERIFIED | schema.ts line 125: `fsPath: text('fs_path')` |
| 4 | Re-provisioning preserves existing _system/ content | VERIFIED | fs.access check before writeFile (lines 97-103); only writes if file does not exist |

**Score:** 4/4

### Plan 02 Must-Haves (PSB-03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Upload triggers classification and routing when project_id present | VERIFIED | files.ts line 673-682: processIngress called inside `if (projectId)` guard |
| 2 | File ingress classifies into 7 categories (no LLM) | VERIFIED | classifyFile is pure synchronous function using extension lookup sets |
| 3 | Files moved to correct project subdirectory (CATEGORY_DIR_MAP) | VERIFIED | routeFile uses CATEGORY_DIR_MAP, handles cross-device moves with EXDEV fallback |
| 4 | Concept row inserted as memory signal | VERIFIED | emitIngressSignal inserts to concepts table with scope='project', source_type='file_ingress' |
| 5 | _system/project.md updated with file reference | VERIFIED | appendFileReference reads and appends "## Files" section |

**Score:** 5/5

### Plan 03 Must-Haves (PSB-04)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Atlas runs on schedule checking every project with fs_path | VERIFIED | scheduler.ts line 387: `tickCount % ATLAS_CHECK_INTERVAL === 0` triggers scheduleAtlasRuns; queries `WHERE fs_path IS NOT NULL AND status = 'active'` |
| 2 | Missing canonical directories auto-recreated | VERIFIED | atlas-agent.ts line 58: fs.mkdir on failed fs.access for each CANONICAL_DIRS entry |
| 3 | Misplaced root files flagged | VERIFIED | atlas-agent.ts lines 74-88: readdir with withFileTypes, flags files not in ROOT_ALLOWLIST |
| 4 | Every repair logged to activity feed | VERIFIED | logAtlasFindings inserts to agent_activity with event_type='atlas_check'; emits SSE 'project:activity' |
| 5 | Atlas reuses Phase 46 infrastructure | VERIFIED | Same agent_activity table pattern; dynamic import of emitSSE from scheduler.js |

**Score:** 5/5

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/services/project-substrate.ts` | provisionProjectStructure, CANONICAL_DIRS, SYSTEM_FILES | VERIFIED (115 lines) | Exports all 3; full implementation with config mount resolution, idempotent writes |
| `backend/src/db/migrate-psb-v1.ts` | migratePsbV1 adding fs_path column | VERIFIED (40 lines) | Idempotent via schema_migrations table; ALTER TABLE IF NOT EXISTS guard |
| `backend/src/services/file-ingress.ts` | classifyFile, routeFile, processIngress, CATEGORY_DIR_MAP | VERIFIED (290 lines) | All 4 exports present; classifyFile is pure sync; processIngress orchestrates all 7 pipeline steps |
| `backend/src/services/atlas-agent.ts` | runAtlasCheck, scheduleAtlasRuns, ATLAS_WATCHER_TYPE | VERIFIED (154 lines) | All 3 exports present; per-project error isolation; correct flag-only vs auto-repair distinction |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `routes/v1/projects.ts` | `services/project-substrate.ts` | `provisionProjectStructure` called after INSERT | WIRED | Import line 10; called at line 113 in POST handler with await |
| `routes/v1/wizard.ts` | `services/project-substrate.ts` | `provisionProjectStructure` after COMMIT (fire-and-forget) | WIRED | Import line 9; called at line 393, after client.release(), with .catch() |
| `services/project-substrate.ts` | `porter_config.json` | `resolveProjectsRoot` reads nodes[*].mounts | WIRED | Lines 46-73; looks for `id === 'projects'` mount with fallback to dataDir/projects |
| `routes/v1/files.ts` | `services/file-ingress.ts` | `processIngress` called when projectId present | WIRED | Import line 11; called lines 673-682 guarded by `if (projectId)` |
| `services/file-ingress.ts` | `concepts table` | INSERT INTO concepts for memory signal | WIRED | emitIngressSignal (line 170-177) inserts concept row |
| `services/file-ingress.ts` | `_system/project.md` | appendFileReference updates project context | WIRED | appendFileReference (lines 182-210) reads and appends ## Files section |
| `services/scheduler.ts` | `services/atlas-agent.ts` | `scheduleAtlasRuns` called in tick loop | WIRED | Import line 17; ATLAS_CHECK_INTERVAL=900 at line 32; tick call line 387 |
| `services/atlas-agent.ts` | `services/project-substrate.ts` | imports CANONICAL_DIRS | WIRED | Import line 13: `import { CANONICAL_DIRS } from './project-substrate.js'` |
| `services/atlas-agent.ts` | `agent_activity table` | INSERT INTO agent_activity for findings | WIRED | logAtlasFindings (lines 115-118) inserts with agent_id='atlas' |
| `backend/src/index.ts` | `db/migrate-psb-v1.ts` | `migratePsbV1` in startup migration chain | WIRED | Import line 43; await at line 223 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PSB-01 | 47-01-PLAN.md | Every project folder has canonical /_system/ with 6 seed .md files | SATISFIED | SYSTEM_FILES record + provisionProjectStructure writes each file |
| PSB-02 | 47-01-PLAN.md | Default structure includes /_system/, /intake/, /context/, /work/, /outputs/, /archive/ | SATISFIED | CANONICAL_DIRS array + mkdir loop |
| PSB-03 | 47-02-PLAN.md | Upload triggers ingress: classify, route, emit signal, update context | SATISFIED | processIngress orchestrates all 4 steps; wired into registry upload route |
| PSB-04 | 47-03-PLAN.md | Atlas agent monitors structure health and repairs drift | SATISFIED | scheduleAtlasRuns at 30-min interval; runAtlasCheck auto-repairs dirs, flags missing files and misplaced root files |

No orphaned requirements — all 4 PSB IDs declared in PLANS and present in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| file-ingress.ts | 283 | `.catch(() => {})` on SSE emit | Info | Intentional silent-fail for fire-and-forget SSE — acceptable pattern |
| atlas-agent.ts | 126 | `.catch(() => {})` on SSE emit | Info | Same intentional silent-fail pattern |

No blockers. No stubs. No placeholder implementations found.

---

### Human Verification Required

None — all key behaviors are verifiable through code inspection and TypeScript compilation. The following would be useful for regression confidence but are not blockers:

**1. Project creation end-to-end filesystem test**
- Test: POST /api/v1/projects with a new project name, then check filesystem for provisioned directories
- Expected: `<projects_root>/<slug>/` exists with all 6 canonical dirs and 6 seed files in _system/
- Why human: Requires live server + filesystem access to confirm runtime behavior

**2. File upload classification and routing**
- Test: Upload a .py file to a project via POST /api/v1/files/registry/upload with project_id, check that it lands in the project's work/ directory
- Expected: File moved from uploads/ to `<project>/work/<filename>`, response includes `category: "code"`
- Why human: Requires live upload with actual project that has fs_path provisioned

**3. Atlas 30-minute scan**
- Test: Manually delete a canonical directory, then trigger atlas check; verify it's recreated and logged in activity feed
- Expected: Directory recreated, agent_activity row inserted with event_type='atlas_check'
- Why human: 30-minute interval makes automated testing impractical without mocking the tick

---

### Commits Verified

All 6 commits documented in SUMMARY files exist in git history:

| Commit | Description |
|--------|-------------|
| `9e07a90` | feat(47-02): create file ingress classification and routing service |
| `1b6b473` | feat(47-01): add project substrate service and psb-v1 migration |
| `8198bcc` | feat(47-02): wire ingress pipeline into file upload route |
| `27fe77c` | feat(47-01): wire provisionProjectStructure into project creation routes |
| `0bbeb2f` | feat(47-03): add Atlas structural health agent |
| `1633b09` | feat(47-03): wire Atlas agent into scheduler tick loop |

---

### Gaps Summary

None. All must-haves verified. Phase goal fully achieved.

Every project folder is now a structured container:
- Canonical /_system/ directory with 6 seed .md files provisioned on project creation (PSB-01)
- 6 canonical subdirectories (_system/, intake/, context/, work/, outputs/, archive/) created on every project (PSB-02)
- Intelligent file ingress classifies by extension (7 categories, no LLM), routes to correct subdirectory, emits memory signal to concepts table, updates project.md (PSB-03)
- Atlas agent watches all active projects every 30 minutes, auto-repairs missing directories, flags missing system files and misplaced root files, logs to activity feed (PSB-04)
- TypeScript compiles clean with zero errors
- All 6 commits present in git history

---

_Verified: 2026-04-03T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
