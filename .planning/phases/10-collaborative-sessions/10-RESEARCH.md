# Phase 10: Collaborative Sessions - Research

**Researched:** 2026-03-22
**Domain:** Project-scoped RBAC, invitation flows, multi-user agent interaction, Fastify middleware patterns
**Confidence:** HIGH

## Summary

This phase adds per-project collaborator management on top of Porter Brain's existing Fastify/Drizzle/SQLite stack. The core work is three layers: (1) a new `project_collaborators` table with soft-delete semantics and invite tokens, (2) a `requireProjectAccess(minRole)` preHandler that wraps every project-scoped route, and (3) identity injection into agent context for chat routes.

The existing codebase gives a very clear extension path. The `auth.ts` plugin already decorates `request.sessionUser` and provides `requireAuth` as a Fastify-decorated preHandler — `requireProjectAccess` is a direct parallel. The `transactional-email.ts` service (nodemailer, SMTP from `workspace_settings`) already handles code-based flows; invite emails reuse that sendEmail primitive. The `auth_tokens` table already holds time-bounded tokens with email+purpose indexing — invite tokens are the same shape with a different purpose string (`project_invite`).

The drip reminder schedule (daily → weekly → monthly) must be driven by the existing scheduler polling loop (`scheduler.ts`, 2-second tick, `agent_jobs` queue). Drip jobs are regular `agent_jobs` records with a future `scheduled_for`, regenerated on completion. No new cron infrastructure is needed.

**Primary recommendation:** Build `requireProjectAccess` as a Fastify-decorated factory (not a plugin), new `project_collaborators` + `collaboration_events` tables in a `migrate-10.ts`, and a `/collaborators` sub-resource under `/api/v1/projects/:id`. Drip reminders run as `agent_jobs` with `trigger_type: 'invite_drip'`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Invitation flow**
- Auto-create pending account when invitee email has no Porter account — invitee clicks link to set password and lands in the project
- Invites never expire — drip reminder cadence: daily (first few days), weekly (next few weeks), monthly (ongoing until unsubscribe)
- Batch invite API: accepts list of emails + role in single call, sends one email per invitation
- Invite flow is agent-managed — agents trigger and manage invitations, not manual user action
- Anyone with edit+ project role can send invites (owner, project admins, and edit users)

**Role model**
- platform_admin = god access — bypasses all project-level checks, sees/does everything
- Project roles are independent from account roles — a viewer-account CAN be a project admin (separate axes)
- Strict hierarchy: owner > admin > edit > chat > view (each level inherits all capabilities below)
- Owner is a special immutable role — distinct from admin, cannot be removed, can transfer ownership, only role that can delete the project
- Owner stored as `ownerId` on project + as a collaborator record with `role: 'owner'`

**Agent interaction**
- Identity-aware: agent receives collaborator's name and project role in context
- Shared threads: all collaborators see the same conversation with an agent, agent remembers everything from everyone
- Chat role = read + converse only — agent refuses write operations (task creation, file changes, milestone updates) for chat-role users
- Edit+ role users can trigger agent write actions — agent checks caller's project role before executing
- All project agents accessible to all collaborators with chat+ role — no per-agent permission assignment

**Revocation behavior**
- Enforced at next API request — no mid-stream interruption of active connections
- Messages from revoked collaborators preserved in shared threads with original author attribution
- Full audit log: invite sent, accepted, role changed, revoked — all recorded with who/when
- Re-invite restores previous role with one click — soft-delete pattern for collaborator records

### Claude's Discretion
- Database schema design for `project_collaborators` table
- Invite token generation and validation approach
- Email delivery mechanism (queue, direct send, provider choice)
- Drip reminder scheduling implementation (cron, job queue, agent heartbeat)
- Middleware pattern for `requireProjectAccess` (decorator vs preHandler)
- Audit log storage (extend `agent_activity` vs dedicated `collaboration_events` table)

### Deferred Ideas (OUT OF SCOPE)
- Frontend UI for collaboration management — separate phase (v2.0 is API-only)
- Per-agent access control (limit which agents a collaborator can talk to) — future phase if needed
- Real-time disconnect on revocation (WebSocket termination) — future enhancement
- Collaboration analytics (who's most active, response times) — admin feature phase
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COLLAB-01 | User can invite people to a project by email with an assigned role | Invite token flow using existing `auth_tokens` pattern + `sendEmail` primitive + pending user creation |
| COLLAB-02 | Per-person roles (view/chat/edit/admin) with granular permission checks on every API call | `requireProjectAccess(minRole)` preHandler factory added to auth plugin, applied to all project-scoped routes |
| COLLAB-03 | Collaborators can chat with and direct project agents | `request.sessionUser` extended with `projectRole`; agent context injection in chat route; role-gated write operations |
| COLLAB-04 | Project owner can revoke collaborator access | Soft-delete on `project_collaborators`, immediate enforcement at next request via `requireProjectAccess` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | already installed | Synchronous SQLite for collaborator/invite tables | Already used for all DB access |
| drizzle-orm | already installed | ORM for new table definitions | All existing tables use Drizzle |
| nodemailer | already installed | SMTP invite email delivery | Already wired in `transactional-email.ts` |
| zod | already installed | Input validation for invite/role schemas | Used on every existing route |
| fastify-plugin | already installed | Wrapping `requireProjectAccess` as a decorated method | Same pattern as `auth.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (stdlib) | Node built-in | `randomUUID()` for invite tokens, `randomBytes` for token secrets | Invite token generation |
| node:test + tsx | already available | Unit-testing the role hierarchy helper | Stream service tests already use this pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| agent_jobs for drip reminders | node-cron / setInterval | agent_jobs gives persistence across restarts, survives crashes, plays nicely with the existing scheduler tick — use it |
| dedicated collaboration_events table | extending agent_activity | Dedicated table keeps collaboration audit cleanly queryable; agent_activity mixes unrelated event types — use dedicated table |
| URL token in invite link | 6-digit code (existing pattern) | URL token is better UX for email invites — one-click accept. 6-digit codes require a separate UI step. Use URL token. |

**Installation:** No new packages needed. All dependencies are already present.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   ├── schema.ts              # Add project_collaborators + collaboration_events tables
│   └── migrate-10.ts          # Phase 10 migration (idempotent, follows migrate-09 pattern)
├── plugins/
│   └── auth.ts                # Add requireProjectAccess factory + extend FastifyRequest type
├── routes/v1/
│   ├── index.ts               # Register collaborators sub-route
│   ├── projects.ts            # Add requireProjectAccess to all project-scoped handlers
│   ├── agents.ts              # Add project role check before agent dispatch
│   ├── chat.ts                # Inject collaborator identity into agent context
│   └── collaborators.ts       # NEW: invite/list/role-change/revoke endpoints
└── services/
    └── transactional-email.ts # Add sendInviteEmail() + sendDripReminder()
```

### Pattern 1: requireProjectAccess Factory

**What:** A Fastify-decorated method that returns a preHandler function. The returned preHandler checks `request.sessionUser` exists, looks up the caller's role in `project_collaborators` for the `:id` param project, and enforces the minimum role. `platform_admin` bypasses all checks.

**When to use:** Every route handler that is scoped to a specific project (any URL containing `:id` under `/api/v1/projects`).

**Example:**
```typescript
// In auth.ts — extend the declaration
declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireProjectAccess: (minRole: ProjectRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    sessionUser: { username: string; role: string; displayName: string | null } | null;
    projectRole: ProjectRole | null;  // populated by requireProjectAccess
  }
}

// Role ordering — higher index = more access
const ROLE_ORDER: ProjectRole[] = ['view', 'chat', 'edit', 'admin', 'owner'];

fastify.decorate('requireProjectAccess', (minRole: ProjectRole) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Must be authenticated
    if (!request.sessionUser) {
      return reply.code(401).send(err('UNAUTHORIZED', 'Authentication required', request.id));
    }

    // 2. platform_admin bypasses all project checks
    if (request.sessionUser.role === 'platform_admin') {
      request.projectRole = 'owner';
      return;
    }

    // 3. Extract project id from params
    const projectId = (request.params as Record<string, string>).id;
    if (!projectId) {
      return reply.code(400).send(err('BAD_REQUEST', 'Missing project id', request.id));
    }

    // 4. Look up collaborator record (active, not soft-deleted)
    const collab = sqlite.prepare(`
      SELECT role FROM project_collaborators
      WHERE project_id = ? AND username = ? AND status = 'active'
    `).get(projectId, request.sessionUser.username) as { role: ProjectRole } | undefined;

    if (!collab) {
      return reply.code(403).send(err('FORBIDDEN', 'Access denied', request.id));
    }

    // 5. Enforce minimum role
    const callerIdx = ROLE_ORDER.indexOf(collab.role);
    const minIdx = ROLE_ORDER.indexOf(minRole);
    if (callerIdx < minIdx) {
      return reply.code(403).send(err('FORBIDDEN', 'Insufficient project role', request.id));
    }

    // 6. Expose project role to handler
    request.projectRole = collab.role;
  };
});
```

### Pattern 2: Invite Token Flow

**What:** URL-token-based invitation. On invite creation, generate a `crypto.randomBytes(32).toString('hex')` token, store in `project_collaborators.invite_token`, send email with link `{publicUrl}/accept-invite?token={token}`. Accept endpoint looks up token, creates/activates user account, marks collaborator `status: 'active'`.

**When to use:** All invite creation — both individual and batch.

**Schema:**
```typescript
// In schema.ts
export const projectCollaborators = sqliteTable('project_collaborators', {
  id: text('id').primaryKey(),                   // crypto.randomUUID()
  projectId: text('project_id').notNull(),
  username: text('username'),                     // null until accepted
  email: text('email').notNull(),
  role: text('role').notNull(),                   // 'view'|'chat'|'edit'|'admin'|'owner'
  status: text('status').notNull().default('pending'), // 'pending'|'active'|'revoked'
  inviteToken: text('invite_token'),              // hex string, cleared on accept
  invitedBy: text('invited_by').notNull(),        // username of inviter
  invitedAt: real('invited_at').default(sql`(unixepoch('now'))`),
  acceptedAt: real('accepted_at'),
  revokedAt: real('revoked_at'),
  revokedBy: text('revoked_by'),
  lastDripAt: real('last_drip_at'),              // for drip cadence tracking
  dripCount: integer('drip_count').default(0),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const collaborationEvents = sqliteTable('collaboration_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull(),
  collaboratorId: text('collaborator_id').notNull(), // FK to project_collaborators.id
  actorUsername: text('actor_username').notNull(),   // who performed the action
  eventType: text('event_type').notNull(),           // 'invited'|'accepted'|'role_changed'|'revoked'|'reinstated'|'drip_sent'
  previousRole: text('previous_role'),
  newRole: text('new_role'),
  detail: text('detail'),                            // JSON blob for extra context
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
```

### Pattern 3: Drip Reminder via agent_jobs

**What:** When an invite is sent (pending, not yet accepted), schedule the next drip reminder as an `agent_jobs` record with `trigger_type: 'invite_drip'`, `trigger_data: JSON.stringify({ collaborator_id })`, and `scheduled_for` set to the appropriate offset (day 1, day 2, day 3, week 2, week 3…, then monthly).

**When to use:** On every invite send (initial + on each completed drip).

**Example:**
```typescript
function scheduleDripReminder(collaboratorId: string, dripCount: number): void {
  // Cadence: days 1-3, then weeks 1-4, then monthly
  const offsetDays = dripCount < 3 ? 1 : dripCount < 7 ? 7 : 30;
  const scheduledFor = Date.now() / 1000 + offsetDays * 86400;

  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
    VALUES (?, 'system', 'invite_drip', ?, 'pending', ?, unixepoch('now'))
  `).run(crypto.randomUUID(), JSON.stringify({ collaborator_id: collaboratorId }), scheduledFor);
}
```

The scheduler's `executeJob` function needs a branch for `trigger_type === 'invite_drip'` that: loads the collaborator record, sends the drip email if still pending, increments `drip_count`, updates `last_drip_at`, and schedules the next drip if `dripCount < unsubscribe threshold`.

### Pattern 4: Identity Injection into Agent Context

**What:** In chat/agent dispatch routes, after `requireProjectAccess` has populated `request.projectRole`, prepend a system message fragment identifying the caller before sending to the AI backend.

**When to use:** Any route that dispatches a prompt to an agent in a project context.

**Example:**
```typescript
// In chat.ts route handler, before dispatch:
const identityContext = request.projectRole
  ? `\n[Collaborator: ${request.sessionUser!.displayName ?? request.sessionUser!.username}, Project Role: ${request.projectRole}]\n`
  : '';

// Prepend to system prompt or first user message
const augmentedPrompt = identityContext + userPrompt;
```

### Pattern 5: Soft-Delete Revocation

**What:** `DELETE /api/v1/projects/:id/collaborators/:user_id` sets `status: 'revoked'`, `revokedAt`, `revokedBy`. The `requireProjectAccess` query filters `WHERE status = 'active'`, so the revoked collaborator gets 403 on their next request. Re-invite is a single `UPDATE ... SET status = 'active', role = ?, invite_token = NULL` + `collaboration_events` insert.

**When to use:** All revocation and reinstatement flows.

### Anti-Patterns to Avoid

- **Checking roles in individual handlers:** All role enforcement must go through `requireProjectAccess` in the `preHandler` array. Never add `if (user.role !== 'edit')` checks inside handler bodies — that's the IDOR/duplication trap the success criteria explicitly call out.
- **Deleting collaborator records on revocation:** Soft-delete keeps audit trail and enables one-click re-invite. Hard deletes violate the stated revocation behavior spec.
- **Sharing invite token secrets across invites:** Each invite gets its own `randomBytes(32)` token. Never reuse tokens.
- **Using `authTokens` table for invite tokens:** `auth_tokens` is for verification codes. Project invites are a different domain — they live in `project_collaborators.invite_token` and never expire.
- **Placing owner record only in `projects.ownerId`:** Owner must also exist as a `project_collaborators` record with `role: 'owner'` and `status: 'active'` — so `requireProjectAccess` finds them without special-casing project ownership in the middleware.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMTP delivery | Custom HTTP mailer | `transactional-email.ts` `sendEmail()` | Already handles config, fallback, dev logging |
| Token generation | Predictable token patterns | `crypto.randomBytes(32).toString('hex')` | Cryptographically random, 256-bit entropy |
| Job scheduling for drips | New cron daemon / setInterval | `agent_jobs` + existing scheduler tick | Persistent across restarts, already clamp-safe |
| Password for pending users | Store plaintext temp password | Create user with `status: 'pending'`, empty password hash + random salt | Forces password set on accept — no leaked credentials |
| Role hierarchy comparison | String equality chains | Ordered `ROLE_ORDER` array + indexOf | Single source of truth, O(1), no drift |
| Audit log | Appending to agent_activity | Dedicated `collaboration_events` table | Queryable by event type, collaborator, project — no mixing with agent events |

**Key insight:** The invite-to-collaborate flow is nearly identical to the verify-email flow already in `auth.ts`. Reuse the same primitives: generate token, store it, send email, validate on accept, mark used. The only difference is the token lives on the collaborator record rather than `auth_tokens`.

---

## Common Pitfalls

### Pitfall 1: IDOR via Collaborator Cross-Project Access

**What goes wrong:** A collaborator for project A who knows project B's ID sends requests to `/api/v1/projects/B/...` and gets data.
**Why it happens:** `requireAuth` alone only checks "is the user logged in" — it does not check project membership.
**How to avoid:** Apply `requireProjectAccess('view')` (or higher) to every route that has a project `:id` param — including GET endpoints. The success criteria explicitly test for 403 on project B.
**Warning signs:** Any project-scoped route that only has `[fastify.requireAuth]` in its `preHandler` array after this phase is a bug.

### Pitfall 2: Owner Not in Collaborators Table

**What goes wrong:** `requireProjectAccess` queries `project_collaborators` and finds nothing for the project owner — owner gets 403 on their own project.
**Why it happens:** The `projects.ownerId` field exists but `requireProjectAccess` only looks at `project_collaborators`.
**How to avoid:** When a project is created, immediately insert an `owner` collaborator record in `project_collaborators`. In the migration, backfill existing projects. The `requireProjectAccess` code should never special-case ownership — the collaborator record is the source of truth.
**Warning signs:** Project creator gets 403 on first request after the migration runs.

### Pitfall 3: Drip Reminders Fire for Accepted Invites

**What goes wrong:** A collaborator accepts an invite, but pending drip jobs still in `agent_jobs` fire and send "reminder" emails to someone who already joined.
**Why it happens:** `agent_jobs` records are not automatically cancelled when invite is accepted.
**How to avoid:** On invite acceptance, run: `UPDATE agent_jobs SET status = 'cancelled' WHERE trigger_type = 'invite_drip' AND trigger_data LIKE '%{collaboratorId}%' AND status = 'pending'`. Or store `collaborator_id` in `trigger_data` JSON and cancel by exact JSON match.
**Warning signs:** Accepted collaborators report receiving reminder emails.

### Pitfall 4: platform_admin Bypass Must Be First Check

**What goes wrong:** `requireProjectAccess` tries to load the collaborator record for `platform_admin` before checking their account role, fails to find a record, and returns 403.
**Why it happens:** Collaborator lookup runs before the bypass check.
**How to avoid:** Check `request.sessionUser.role === 'platform_admin'` as the very first branch in `requireProjectAccess` — before any DB query.
**Warning signs:** platform_admin user gets 403 on project routes.

### Pitfall 5: Batch Invite Race for Existing Email

**What goes wrong:** Batch invite checks "does this user exist?" then creates an account — a concurrent request creates the account between the check and insert, causing a UNIQUE constraint violation on `email`.
**Why it happens:** SQLite `INSERT` without conflict handling.
**How to avoid:** Use `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` for the user row creation step, then re-fetch. Or use `db.transaction()` to wrap the check+insert atomically.
**Warning signs:** 500 errors on batch invite when email already exists.

### Pitfall 6: Invite Token Timing Attack

**What goes wrong:** Predictable tokens allow enumeration.
**Why it happens:** Using short numeric codes (6-digit) or UUID v4 for invite tokens.
**How to avoid:** Use `crypto.randomBytes(32).toString('hex')` — 64-character hex string. Never use 6-digit codes for invites (those are for verification codes that expire in 15 min; invites are long-lived).
**Warning signs:** Short or numerically sequential tokens in the DB.

---

## Code Examples

### Migration (migrate-10.ts)
```typescript
// Source: internal — follows pattern from backend/src/db/migrate-09.ts
import { sqlite } from './client.js';

export function migrate10Collaboration(): void {
  const migrationId = 'phase10_collaboration';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_collaborators (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      invite_token TEXT,
      invited_by TEXT NOT NULL,
      invited_at REAL DEFAULT (unixepoch('now')),
      accepted_at REAL,
      revoked_at REAL,
      revoked_by TEXT,
      last_drip_at REAL,
      drip_count INTEGER DEFAULT 0,
      created_at REAL DEFAULT (unixepoch('now')),
      updated_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pc_project_status
      ON project_collaborators(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_pc_username_status
      ON project_collaborators(username, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_token
      ON project_collaborators(invite_token)
      WHERE invite_token IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_project_email
      ON project_collaborators(project_id, email);

    CREATE TABLE IF NOT EXISTS collaboration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      collaborator_id TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      event_type TEXT NOT NULL,
      previous_role TEXT,
      new_role TEXT,
      detail TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ce_project
      ON collaboration_events(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ce_collaborator
      ON collaboration_events(collaborator_id, created_at DESC);
  `);

  // Backfill: existing projects get owner collaborator records
  sqlite.exec(`
    INSERT OR IGNORE INTO project_collaborators
      (id, project_id, username, email, role, status, invited_by, accepted_at)
    SELECT
      lower(hex(randomblob(16))),
      p.id,
      p.owner_id,
      COALESCE(u.email, p.owner_id || '@placeholder.porter'),
      'owner',
      'active',
      p.owner_id,
      p.created_at
    FROM projects p
    LEFT JOIN users u ON u.username = p.owner_id
  `);

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
  console.log('[migrate-10] Collaboration: project_collaborators, collaboration_events, owner backfill');
}
```

### API Surface (collaborators.ts routes)
```typescript
// POST /api/v1/projects/:id/collaborators — batch invite
// preHandler: [fastify.requireAuth, fastify.requireProjectAccess('edit')]
// Body: { invitations: [{ email: string, role: ProjectRole }] }

// GET /api/v1/projects/:id/collaborators — list all (pending + active + revoked)
// preHandler: [fastify.requireAuth, fastify.requireProjectAccess('view')]

// PATCH /api/v1/projects/:id/collaborators/:collab_id — change role
// preHandler: [fastify.requireAuth, fastify.requireProjectAccess('admin')]

// DELETE /api/v1/projects/:id/collaborators/:collab_id — revoke
// preHandler: [fastify.requireAuth, fastify.requireProjectAccess('admin')]
// (owner-only for admin-role collaborators; admin can revoke edit/chat/view)

// POST /api/v1/collaborators/accept — accept invite (no auth required — token in body)
// Body: { token: string, password?: string }
```

### Role Hierarchy Helper
```typescript
// Reusable constant — single source of truth
export const PROJECT_ROLE_ORDER = ['view', 'chat', 'edit', 'admin', 'owner'] as const;
export type ProjectRole = typeof PROJECT_ROLE_ORDER[number];

export function hasProjectRole(actual: ProjectRole, minimum: ProjectRole): boolean {
  return PROJECT_ROLE_ORDER.indexOf(actual) >= PROJECT_ROLE_ORDER.indexOf(minimum);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-handler role checks | Centralized preHandler middleware | This phase | IDOR eliminated by design |
| Single account-level role | Two-axis model (account role + project role) | This phase | Viewer account can be project admin |
| Hard-delete revocation | Soft-delete + re-invite | This phase | One-click restore, full audit trail |

**Decisions from CONTEXT.md that are already settled:**
- Invite tokens never expire (no TTL logic needed — unlike `auth_tokens` which have 15-min TTL)
- `owner` role is immutable — no endpoint can downgrade it; transfer requires a separate ownership-transfer action (out of scope for this phase beyond blocking the endpoint)
- Agents receive caller's `displayName` + `projectRole` in context — not a JWT claim, injected at dispatch time

---

## Open Questions

1. **Owner role revocation guard**
   - What we know: Owner cannot be removed. CONTEXT.md is explicit.
   - What's unclear: Should `DELETE /collaborators/:collab_id` return 403 or 400 when the target is the owner? Does the endpoint exist for owner records at all?
   - Recommendation: Return `400 CANNOT_REVOKE_OWNER`. Skip creating the endpoint path for owner-role records.

2. **Invite accept endpoint auth requirement**
   - What we know: The accept flow must work for users who don't yet have an account (pending users).
   - What's unclear: Accept endpoint cannot use `requireAuth` since the invitee has no session.
   - Recommendation: `POST /api/v1/collaborators/accept` is an unauthenticated endpoint. Token in body is the only auth. If no account exists, create it with a temporary pending state and require password set. This follows the same pattern as the existing registration flow.

3. **Batch invite partial failure handling**
   - What we know: Batch accepts a list of emails. Some may fail (invalid email, already a member, DB error).
   - What's unclear: Should batch fail atomically (all-or-nothing) or return partial success?
   - Recommendation: Partial success — return `{ succeeded: [...], failed: [...] }`. Use `db.transaction()` per individual invite, not wrapping the whole batch. Callers can retry specific failures.

4. **Drip unsubscribe mechanism**
   - What we know: Drip runs "until unsubscribe". No unsubscribe mechanism is defined.
   - What's unclear: Is a max drip count sufficient as a proxy? Or does the invite email need a one-click unsubscribe link?
   - Recommendation: Set a hard `MAX_DRIP_COUNT = 20` (roughly 6 months of reminders). After that, stop scheduling. A proper unsubscribe link is a future enhancement.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) + `tsx` for TypeScript |
| Config file | None — run via npx tsx --test |
| Quick run command | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` |
| Full suite command | `cd tests && npx playwright test` (35 existing E2E tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COLLAB-01 | POST invite creates pending collaborator + sends email | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ Wave 0 |
| COLLAB-01 | Accept token creates/activates user account | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ Wave 0 |
| COLLAB-02 | view-role user gets 403 on mutation endpoints | unit | `npx tsx --test backend/src/plugins/auth.test.ts` | ❌ Wave 0 |
| COLLAB-02 | platform_admin bypasses all project-level checks | unit | `npx tsx --test backend/src/plugins/auth.test.ts` | ❌ Wave 0 |
| COLLAB-02 | requireProjectAccess used in preHandler, not in handler body | code review | manual | N/A |
| COLLAB-03 | chat-role user can POST message, receives agent response | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ Wave 0 |
| COLLAB-03 | agent receives collaborator name + role in context | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ Wave 0 |
| COLLAB-04 | DELETE collaborator returns 200, next request is 403 | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ Wave 0 |
| COLLAB-04 | Cross-project IDOR blocked at middleware layer | unit | `npx tsx --test backend/src/plugins/auth.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx --test backend/src/routes/v1/collaborators.test.ts backend/src/plugins/auth.test.ts`
- **Per wave merge:** `cd tests && npx playwright test`
- **Phase gate:** Full playwright suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/routes/v1/collaborators.test.ts` — covers COLLAB-01, COLLAB-03, COLLAB-04
- [ ] `backend/src/plugins/auth.test.ts` — covers COLLAB-02 (requireProjectAccess role hierarchy + platform_admin bypass + IDOR)
- [ ] `backend/src/db/migrate-10.ts` — the migration file itself (needed before any tests can run)

---

## Sources

### Primary (HIGH confidence)
- `/home/lobster/documents/porter/backend/src/plugins/auth.ts` — existing requireAuth pattern, FastifyRequest decoration
- `/home/lobster/documents/porter/backend/src/db/schema.ts` — full schema, existing table patterns
- `/home/lobster/documents/porter/backend/src/db/migrate-09.ts` — idempotent migration pattern
- `/home/lobster/documents/porter/backend/src/services/transactional-email.ts` — sendEmail, createAuthToken, verifyAuthToken
- `/home/lobster/documents/porter/backend/src/routes/v1/projects.ts` — project route patterns, preHandler usage
- `/home/lobster/documents/porter/backend/src/services/scheduler.ts` — agent_jobs scheduling pattern
- `/home/lobster/documents/porter/backend/src/routes/v1/index.ts` — plugin registration pattern
- `/home/lobster/documents/porter/backend/src/config.ts` — featureFlags pattern
- `/home/lobster/documents/porter/.planning/phases/10-collaborative-sessions/10-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- Fastify preHandler factory pattern (decorator returning a function) — well-established Fastify RBAC pattern, consistent with existing auth plugin structure

### Tertiary (LOW confidence)
- None — all findings are grounded in the actual codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already installed and in active use
- Architecture: HIGH — all patterns are direct extensions of existing code; migration, preHandler, and email patterns are verbatim from the codebase
- Pitfalls: HIGH — derived from reading actual code (e.g., owner-not-in-collaborators is observable from schema, IDOR from current requireAuth-only preHandlers)
- Drip scheduler: HIGH — scheduler.ts pattern is directly readable; drip as agent_jobs is a concrete recommendation

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable stack — SQLite, Drizzle, Fastify patterns unlikely to change)
