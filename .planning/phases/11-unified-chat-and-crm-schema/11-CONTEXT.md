# Phase 11: Unified Chat and CRM Schema - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

All messages — agent, project, WhatsApp inbound, email inbound — flow through a single conversations/messages API. CRM contacts hold multiple emails, phones, and social links via relational tables. Files attach to any entity atomically via junction tables. Backend API only — zero frontend.

</domain>

<decisions>
## Implementation Decisions

### Conversation model
- **Fresh tables, no migration** — existing chat/CRM data in porter.py is test data, can be dropped entirely
- **Flexible scope with guardrails** — every conversation has a required `scope_type` (project, agent, contact, global) and `scope_id`, so scope is always unambiguous
- **Unlimited threading** — any message can be replied to (parent_message_id), creating arbitrarily deep trees
- **FTS5 indexes everything** — message content, sender name, channel type, attachment filenames all indexed for full-text search

### CRM schema
- **Relational multi-value fields** — separate `contact_emails`, `contact_phones`, `contact_social` tables with foreign keys (not JSON columns)
- **Companies table kept** — contacts belong to companies (name, industry, website). Matches existing porter.py model and ACT! CRM reference
- **Full linkage** — contact ↔ project AND contact ↔ conversation associations. CRM profile shows all conversations involving that contact
- **Start fresh** — no migration from porter.py CRM tables, clean Drizzle schema

### File association model
- **Disk storage + registry table** — files stored on disk (existing pattern), new `files` table tracks path, mime, size, uploader
- **Junction tables** — `file_projects`, `file_contacts`, `file_conversations` for associations. Clean FK enforcement, easy to extend
- **Keep orphaned files** — removing last association doesn't delete the file. Periodic cleanup optional

### External channel flow
- **Store raw + normalized** — normalized message in unified table, raw channel payload in `channel_metadata` JSON column for debugging and re-processing
- **Auto-create CRM contacts** — first message from unknown WhatsApp/email sender creates a contact record with their phone/email, links to conversation
- **Channel ID mapping** — conversations store `external_id` (WhatsApp group_id, email thread_id). Inbound messages look up by external_id to find/create conversation
- **All outbound through unified table** — Porter's outbound messages (agent replies to WhatsApp/email) created in unified table first, then dispatched. Full bidirectional history in one place

### Claude's Discretion
- Exact table column names and types
- Migration file structure (migrate-11.ts)
- FTS5 trigger implementation details
- Atomic upload transaction pattern
- Contact auto-creation thresholds or deduplication strategy
- Conversation metadata schema

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Chat unification
- `research/chat-unification-audit.md` — Audit of 3 existing chat systems, recommendation for unified transport + context adapters
- `backend/src/routes/v1/chat.ts` — Current chat API (sessions, load, delete, rename) — being replaced
- `backend/src/db/schema.ts` — Current Drizzle schema with chats/chatMessages/chatAttachments tables

### CRM design
- `research/crm-redesign-spec.md` — CRM redesign spec: Directory + Relationships views, project/agent linkage, chat-native creation

### File handling
- `backend/src/routes/v1/files.ts` — Current file serving with SERVE_DIRS and safeResolve() path protection

### External channels
- `backend/src/routes/v1/webhooks-whatsapp.ts` — WhatsApp webhook receiver (Meta Cloud API, signature verification)
- `backend/src/services/whatsapp.ts` — WhatsApp service with routeInboundWhatsApp() — currently queues jobs, doesn't archive
- `backend/src/services/email.ts` — Gmail OAuth2, IMAP listener, nodemailer outbound
- `backend/src/services/external-dispatcher.ts` — Routes external_call jobs to GitHub/email/calendar/WhatsApp

### Database patterns
- `backend/src/db/migrate-10.ts` — Phase 10 migration example (project_collaborators, collaboration_events)
- `backend/src/lib/envelope.ts` — ok()/err() response envelope helpers
- `backend/src/plugins/auth.ts` — Auth plugin with requireAuth preHandler

### Memory V2 FTS5 pattern
- `research/porter-memory-v2.md` — Memory V2 architecture with FTS5 (memories_fts virtual table) — replicable pattern for message search

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ok()`/`err()` envelope helpers: consistent response format for all new endpoints
- `requireAuth` preHandler: base for project-scoped access checks
- `requireProjectAccess(minRole)` from Phase 10: enforces collaborator roles on project-scoped endpoints
- Zod schemas: validation pattern for all new endpoint inputs
- `crypto.randomUUID()`: existing pattern for primary key generation
- `parseJsonField()`: helper for JSON-as-text columns

### Established Patterns
- Drizzle ORM + better-sqlite3 for all table definitions and queries
- Hybrid SQL: sqlite.prepare() for complex queries, Drizzle for simple CRUD
- Route registration: Fastify plugin pattern in routes/v1/ directory
- Migration files: migrate-NN.ts run on startup, tracked in schema_migrations
- Agent jobs: async queue via agent_jobs table for external actions
- Encrypted credentials: workspace_connections.meta_json for sensitive data

### Integration Points
- `webhooks-whatsapp.ts`: needs to archive messages in unified table before queuing agent job
- `email.ts`: needs to archive inbound emails in unified table
- `external-dispatcher.ts`: outbound messages need to create unified table record before dispatching
- `chat.ts`: current chat routes need to route to new unified conversations API
- `files.ts`: upload endpoint needs atomic association creation

</code_context>

<specifics>
## Specific Ideas

- Conversations scoped by (scope_type, scope_id) pair — always unambiguous, covers project/agent/contact/global
- WhatsApp group_id and email thread_id stored as external_id on conversation — automatic routing of inbound messages
- CRM grows organically: unknown WhatsApp/email senders auto-create contacts
- Files registry is separate from associations — one file, many links, no orphan cleanup pressure

</specifics>

<deferred>
## Deferred Ideas

- Frontend UI for unified chat, CRM, file management — frontend-v2 connects later
- Per-agent access control on conversations — Phase 10 deferred this
- Real-time WebSocket notifications for new messages — future enhancement
- Email thread parsing (In-Reply-To header chain) — complex, could be its own phase
- Contact deduplication/merge tool — future CRM enhancement
- File versioning (multiple versions of same document) — future file management phase

</deferred>

---

*Phase: 11-unified-chat-and-crm-schema*
*Context gathered: 2026-03-22*
