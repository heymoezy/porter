# Phase 10: Collaborative Sessions - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Project owners can invite people by email, assign per-project roles, and every subsequent API call on that project enforces the caller's role. Collaborators with chat access can direct agents. Revocation is immediate. This phase delivers the backend API only — zero frontend.

</domain>

<decisions>
## Implementation Decisions

### Invitation flow
- Auto-create pending account when invitee email doesn't have a Porter account — invitee clicks link to set password and lands in the project
- Invites never expire — drip reminder cadence: daily (first few days), weekly (next few weeks), monthly (ongoing until unsubscribe)
- Batch invite API: accepts list of emails + role in single call, sends one email per invitation
- Invite flow is agent-managed — agents trigger and manage invitations, not manual user action
- Anyone with edit+ project role can send invites (owner, project admins, and edit users)

### Role model
- platform_admin = god access — bypasses all project-level checks, sees/does everything
- Project roles are independent from account roles — a viewer-account CAN be a project admin (separate axes)
- Strict hierarchy: owner > admin > edit > chat > view (each level inherits all capabilities below)
- Owner is a special immutable role — distinct from admin, cannot be removed, can transfer ownership, only role that can delete the project
- Owner stored as `ownerId` on project + as a collaborator record with `role: 'owner'`

### Agent interaction
- Identity-aware: agent receives collaborator's name and project role in context
- Shared threads: all collaborators see the same conversation with an agent, agent remembers everything from everyone
- Chat role = read + converse only — agent refuses write operations (task creation, file changes, milestone updates) for chat-role users
- Edit+ role users can trigger agent write actions — agent checks caller's project role before executing
- All project agents accessible to all collaborators with chat+ role — no per-agent permission assignment

### Revocation behavior
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authentication & authorization
- `backend/src/plugins/auth.ts` — Current auth plugin with `requireAuth` preHandler and session user decoration
- `backend/src/db/schema.ts` — Full database schema including users, sessions, projects, personas tables

### Project routes
- `backend/src/routes/v1/projects.ts` — Current project CRUD routes, ephemeral agent retirement on project completion

### Existing role system
- `backend/src/db/schema.ts` lines 4-13 — `users` table with account-level `role` field (platform_admin/admin/operator/viewer)
- `backend/src/routes/v1/chat.ts` lines 27, 70 — Current admin role checks in chat routes

### Agent dispatch
- `backend/src/routes/v1/agents.ts` — Agent routes with `requireAuth` — will need project access checks added
- `backend/src/db/schema.ts` lines 93-122 — `personas` table (agents) with owner and config fields

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auth.ts` plugin pattern: decorates `request.sessionUser` with username/role/displayName — extend to include project role
- `requireAuth` preHandler: existing pattern to build `requireProjectAccess(minRole)` on top of
- `agent_activity` table: existing audit infrastructure with event_type/summary/detail/created_at
- `ok()`/`err()` envelope helpers in `lib/envelope.ts`: consistent API response format
- Zod schemas for input validation (used in projects.ts): reuse pattern for invite/role endpoints

### Established Patterns
- Drizzle ORM with better-sqlite3: all DB access uses this, new tables follow same pattern
- Route registration: Fastify plugin pattern in `routes/v1/` directory
- UUID generation: `crypto.randomUUID()` for primary keys
- JSON fields stored as text with `parseJsonField()` helper

### Integration Points
- `projects.ts` routes: need `requireProjectAccess` added to all project-scoped endpoints
- `agents.ts` routes: need project-role check before agent interactions
- `chat.ts` routes: need identity injection (collaborator name/role) into agent context
- `files.ts` routes: need project-role enforcement for file operations
- Auth plugin: extend `sessionUser` type to optionally include project context

</code_context>

<specifics>
## Specific Ideas

- Invite flow should feel agent-managed — Porter (or assigned agent) handles the invitations, not a manual admin form
- Drip reminder cadence is a retention strategy: daily → weekly → monthly prevents invites from going cold
- Re-invite restoring previous role is a soft-delete pattern — collaborator records are deactivated, not deleted

</specifics>

<deferred>
## Deferred Ideas

- Frontend UI for collaboration management — separate phase (v2.0 is API-only)
- Per-agent access control (limit which agents a collaborator can talk to) — future phase if needed
- Real-time disconnect on revocation (WebSocket termination) — future enhancement
- Collaboration analytics (who's most active, response times) — admin feature phase

</deferred>

---

*Phase: 10-collaborative-sessions*
*Context gathered: 2026-03-22*
