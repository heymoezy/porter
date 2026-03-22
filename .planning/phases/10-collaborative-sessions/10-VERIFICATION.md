---
phase: 10-collaborative-sessions
verified: 2026-03-22T09:30:00+08:00
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 10: Collaborative Sessions Verification Report

**Phase Goal:** Project owners can invite people by email, assign roles, and every subsequent API call on that project enforces the caller's role — collaborators with chat access can direct agents, revocation is immediate

**Verified:** 2026-03-22T09:30:00 SGT
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `requireProjectAccess('view')` returns a preHandler function that enforces minimum project role | VERIFIED | `auth.ts:51-89` — factory returns async preHandler, enforces `PROJECT_ROLE_ORDER` comparison |
| 2 | platform_admin bypasses all project-level checks and gets `projectRole='owner'` | VERIFIED | `auth.ts:59-62` — `platform_admin` check executes before any sqlite query |
| 3 | User with no collaborator record on a project receives 403 | VERIFIED | `auth.ts:75-77` — `!collab` returns 403 FORBIDDEN |
| 4 | Role hierarchy is view < chat < edit < admin < owner — each level includes all below | VERIFIED | `roles.ts:1-6` — `PROJECT_ROLE_ORDER` array, `hasProjectRole` uses `indexOf` comparison |
| 5 | `project_collaborators` and `collaboration_events` tables exist with correct schema | VERIFIED | `migrate-10.ts:32-76` — all 16 columns, 4 indexes on collaborators, 2 indexes on events |
| 6 | Existing projects have owner collaborator records backfilled | VERIFIED | `migrate-10.ts:80-98` — `INSERT OR IGNORE` with LEFT JOIN from projects to users |
| 7 | POST invite creates pending collaborator records and sends invite emails | VERIFIED | `collaborators.ts:102-276` — transaction per invite, `sendInviteEmail` + `scheduleDripReminder` called |
| 8 | Batch invite returns `{succeeded, failed}` for partial failure handling | VERIFIED | `collaborators.ts:271` — 207 response with `{succeeded, failed, total}` |
| 9 | DELETE revoke soft-deletes (status='revoked') and blocks future requests | VERIFIED | `collaborators.ts:360-366` — sets `status='revoked'`, `revoked_at`, `revoked_by`; `auth.ts` filters `status='active'` |
| 10 | Agent receives `[Collaborator: displayName, Project Role: role]` prefix in stream context | VERIFIED | `chat.ts:231-238` — identity prefix built and prepended to `augmentedMessage`; original persisted to history |
| 11 | IDOR blocked: project-scoped routes require per-project role checks | VERIFIED | `projects.ts:119,135,206,229` — GET/:id (view), PUT/:id (edit), DELETE/:id (owner), GET/:id/activity (view) |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/lib/roles.ts` | Role hierarchy constants and helper | VERIFIED | 6 lines — exports `PROJECT_ROLE_ORDER`, `ProjectRole`, `hasProjectRole` |
| `backend/src/db/migrate-10.ts` | Phase 10 migration with both tables | VERIFIED | 102 lines — `migrate10Collaboration`, idempotent, legacy schema detection, owner backfill |
| `backend/src/db/schema.ts` | Drizzle schema for new tables | VERIFIED | Lines 266 + 285 — `projectCollaborators` and `collaborationEvents` appended |
| `backend/src/plugins/auth.ts` | `requireProjectAccess` factory on FastifyInstance | VERIFIED | 92 lines — factory at line 51, `decorateRequest('projectRole', null)` at line 23 |
| `backend/src/routes/v1/collaborators.ts` | Collaborator CRUD routes (5 endpoints) | VERIFIED | 483 lines — all 5 routes substantive, two plugin exports |
| `backend/src/services/transactional-email.ts` | `sendInviteEmail` and `sendDripReminder` | VERIFIED | 217 lines — both functions exported, use `config.publicUrl` |
| `backend/src/services/scheduler.ts` | `scheduleDripReminder` + `invite_drip` handler | VERIFIED | `scheduleDripReminder` exported, `invite_drip` branch in `executeJob`, `MAX_DRIP_COUNT=20` |
| `backend/src/routes/v1/projects.ts` | Project routes with `requireProjectAccess` | VERIFIED | 288 lines — 4 project-scoped routes protected, owner record auto-created on POST |
| `backend/src/routes/v1/chat.ts` | Chat routes with identity injection | VERIFIED | 289 lines — project access check, identity prefix, augmented message to stream |
| `backend/src/index.ts` | Migration wired into boot sequence | VERIFIED | Lines 29 + 141 — import and call of `migrate10Collaboration` |
| `backend/src/routes/v1/index.ts` | Both collaborator plugins registered | VERIFIED | Lines 24-25 — `collaboratorV1Routes` at `/projects`, `collaboratorAcceptRoutes` at `/collaborators` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth.ts` | `project_collaborators` table | `sqlite.prepare` query with `status='active'` filter | WIRED | Line 71-73 — exact query pattern present |
| `index.ts` | `migrate-10.ts` | `import` + call of `migrate10Collaboration()` | WIRED | Lines 29, 141 |
| `collaborators.ts` | `auth.ts` | `preHandler: [requireAuth, requireProjectAccess('edit')]` on invite | WIRED | Lines 83, 104, 280, 337 |
| `collaborators.ts` | `transactional-email.ts` | `sendInviteEmail()` call on invite | WIRED | Line 246-254 |
| `collaborators.ts` | `scheduler.ts` | `scheduleDripReminder()` call on invite | WIRED | Line 256 |
| `routes/v1/index.ts` | `collaborators.ts` | `fastify.register(collaboratorV1Routes)` | WIRED | Lines 24-25 |
| `projects.ts` | `auth.ts` | `requireProjectAccess` in preHandler of all `:id` routes | WIRED | Lines 119, 135, 206, 229 |
| `projects.ts` | `project_collaborators` INSERT | Owner record created on `POST /` | WIRED | Lines 96-109 |
| `chat.ts` | `project_collaborators` | SELECT with `status='active'` in `/stream` | WIRED | Lines 198-201 |
| `chat.ts` | `request.projectRole` | Identity prefix uses `request.projectRole` in string | WIRED | Lines 232-234 |
| `chat.ts` | `backend.stream()` | `augmentedMessage` (with prefix) passed to stream | WIRED | Line 245 |
| `scheduler.ts` | `transactional-email.ts` | Dynamic `import('./transactional-email.js')` for drip send | WIRED | Line 201 |
| `scheduler.ts` | `collaboration_events` | INSERT on drip sent | WIRED | Lines 218-229 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| COLLAB-01 | 10-02 | User can invite people to a project by email with an assigned role | SATISFIED | `POST /api/v1/projects/:id/collaborators` batch invite — `collaborators.ts:102-276` |
| COLLAB-02 | 10-01, 10-03 | Per-person roles (view, chat, edit, admin) with granular permission checks on every API call | SATISFIED | `requireProjectAccess` factory in `auth.ts`; applied to all `:id` routes in `projects.ts` |
| COLLAB-03 | 10-03 | Collaborators can chat with and direct project agents | SATISFIED | `chat.ts` enforces 'chat' minimum role; identity prefix injected into `backend.stream()` |
| COLLAB-04 | 10-02 | Project owner can revoke collaborator access | SATISFIED | `DELETE /:id/collaborators/:collab_id` soft-revokes; `CANNOT_REVOKE_OWNER` guard; revoked users get 403 via `status='active'` filter |

No orphaned requirements — all 4 COLLAB IDs declared in plan frontmatter and all 4 verified.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `migrate-10.ts` | 88 | `'@placeholder.porter'` string | Info | Legitimate fallback email for owners with no email set. Not a stub — used in both migration backfill and project creation. Expected behavior. |
| `GET /api/v1/projects` | `projects.ts:55-66` | No per-project filtering on list all | Info | Any authenticated user can list all active project names. Plan explicitly excludes this route from `requireProjectAccess`. Product decision, not a gap against stated truths. |

No blocker anti-patterns found. No TODO/FIXME/placeholder stub comments. No empty return handlers. No console.log-only implementations.

---

### Commits Verified

All 6 task commits confirmed to exist in git history:

| Hash | Plan | Description |
|------|------|-------------|
| `231bf50` | 10-01 Task 1 | feat: collaboration schema, migration, and role types |
| `da94816` | 10-01 Task 2 | feat: requireProjectAccess preHandler factory in auth plugin |
| `b3c29c4` | 10-02 Task 1 | feat: collaborator CRUD routes |
| `9d24b11` | 10-02 Task 2 | feat: invite email templates, drip scheduling, scheduler handler |
| `ea0acb1` | 10-03 Task 1 | feat: apply requireProjectAccess to all project-scoped routes |
| `d977461` | 10-03 Task 2 | feat: inject collaborator identity into agent context |

---

### Human Verification Required

#### 1. Invite Email Delivery

**Test:** Create a project, invite an email address, check whether an email is received with correct project name, inviter, role, and accept link.
**Expected:** Email arrives with accept link pointing to `{publicUrl}/accept-invite?token={64-char-hex}`
**Why human:** SMTP is optional — if unconfigured, emails fall back to console log. Cannot verify delivery programmatically without a live SMTP server.

#### 2. Accept Flow — New User Account Creation

**Test:** Use a valid invite token via `POST /api/v1/collaborators/accept` with `{token, password, display_name}` for an email with no existing Porter account.
**Expected:** New user created, collaborator activated, drip jobs cancelled, `ok({project_id, role, username})` returned.
**Why human:** End-to-end user creation requires a real token in the database and verifying the resulting login works.

#### 3. Revocation Immediacy

**Test:** Revoke a collaborator's access while they have an active session, then immediately call `GET /api/v1/projects/:id`.
**Expected:** 403 FORBIDDEN — no grace period, no session caching of project role.
**Why human:** Requires two concurrent sessions and real-time verification of the revocation effect.

#### 4. Agent Identity Awareness

**Test:** Send `POST /api/v1/chat/stream` with `project_id` as a `chat`-role collaborator; verify the agent's response reflects awareness of the collaborator role (e.g., refuses write operations or acknowledges limited permissions when asked).
**Expected:** Agent response should reflect the identity prefix: "You have chat-role access to this project."
**Why human:** Agent behavioral response depends on model interpretation of the identity prefix, which cannot be verified by code inspection alone.

---

### Notable Implementation Decisions

1. **Legacy schema migration handled:** The pre-existing `project_collaborators` table (6 columns from `porter.py`) was renamed to `project_collaborators_v1_legacy` before the new 16-column schema was created. Migration is idempotent.

2. **Accept route has no auth:** `POST /api/v1/collaborators/accept` intentionally uses the invite token as the credential — no `requireAuth` preHandler. This is correct.

3. **Email outside transaction:** `sendInviteEmail()` and `scheduleDripReminder()` are called after each invite transaction commits. Invite record exists even if email fails — the invited user can still be resent an invite.

4. **agents.ts and files.ts unchanged:** Agents are global entities (`:id` in agent routes is agent ID, not project ID). Files are filesystem-based with no `project_id` concept. Plan 03 correctly determined no changes needed.

5. **Identity prefix is runtime-only:** The `[Collaborator: displayName, Project Role: role]` prefix is prepended to `augmentedMessage` for `backend.stream()` but the original `message` is persisted to `chat_messages`. Chat history stays clean.

6. **claimNextJob LEFT JOIN fix:** The scheduler's `claimNextJob` was fixed from INNER JOIN to LEFT JOIN on `personas` to allow `agent_id='system'` drip jobs to be claimed without a persona record.

---

_Verified: 2026-03-22T09:30:00 SGT_
_Verifier: Claude (gsd-verifier)_
