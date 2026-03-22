# Phase 11: Unified Chat and CRM Schema - Research

**Researched:** 2026-03-22
**Domain:** SQLite schema design (FTS5, polymorphic messaging, relational CRM), Fastify route patterns, atomic file upload with DB registration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Conversation model**
- Fresh tables, no migration — existing chat/CRM data in porter.py is test data, can be dropped entirely
- Flexible scope with guardrails — every conversation has a required `scope_type` (project, agent, contact, global) and `scope_id`, so scope is always unambiguous
- Unlimited threading — any message can be replied to (parent_message_id), creating arbitrarily deep trees
- FTS5 indexes everything — message content, sender name, channel type, attachment filenames all indexed for full-text search

**CRM schema**
- Relational multi-value fields — separate `contact_emails`, `contact_phones`, `contact_social` tables with foreign keys (not JSON columns)
- Companies table kept — contacts belong to companies (name, industry, website). Matches existing porter.py model and ACT! CRM reference
- Full linkage — contact ↔ project AND contact ↔ conversation associations. CRM profile shows all conversations involving that contact
- Start fresh — no migration from porter.py CRM tables, clean Drizzle schema

**File association model**
- Disk storage + registry table — files stored on disk (existing pattern), new `files` table tracks path, mime, size, uploader
- Junction tables — `file_projects`, `file_contacts`, `file_conversations` for associations. Clean FK enforcement, easy to extend
- Keep orphaned files — removing last association doesn't delete the file. Periodic cleanup optional

**External channel flow**
- Store raw + normalized — normalized message in unified table, raw channel payload in `channel_metadata` JSON column for debugging and re-processing
- Auto-create CRM contacts — first message from unknown WhatsApp/email sender creates a contact record with their phone/email, links to conversation
- Channel ID mapping — conversations store `external_id` (WhatsApp group_id, email thread_id). Inbound messages look up by external_id to find/create conversation
- All outbound through unified table — Porter's outbound messages (agent replies to WhatsApp/email) created in unified table first, then dispatched. Full bidirectional history in one place

### Claude's Discretion
- Exact table column names and types
- Migration file structure (migrate-11.ts)
- FTS5 trigger implementation details
- Atomic upload transaction pattern
- Contact auto-creation thresholds or deduplication strategy
- Conversation metadata schema

### Deferred Ideas (OUT OF SCOPE)
- Frontend UI for unified chat, CRM, file management — frontend-v2 connects later
- Per-agent access control on conversations — Phase 10 deferred this
- Real-time WebSocket notifications for new messages — future enhancement
- Email thread parsing (In-Reply-To header chain) — complex, could be its own phase
- Contact deduplication/merge tool — future CRM enhancement
- File versioning (multiple versions of same document) — future file management phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | Single conversation API covering agent, project, and external channel messages | Unified `conversations` + `messages` tables with `scope_type`/`scope_id` replace fragmented `chats`/`chat_messages` |
| CHAT-02 | Threaded messages with parent/child relationships | `parent_message_id` FK on `messages` table; GET endpoint assembles `children` arrays via recursive CTE or app-layer grouping |
| CHAT-03 | Chat history persists across sessions with full-text search | FTS5 virtual table `messages_fts` with triggers on insert/update/delete; Memory V2 pattern is directly replicable |
| CHAT-04 | External channel messages (WhatsApp, email) surface in unified conversation stream | `channel_type` column + `channel_metadata` JSON on `messages`; webhooks-whatsapp.ts writes to `messages` before queuing agent job |
| CRM-01 | Contact model supports multiple emails and phone numbers with country codes | `contact_emails` + `contact_phones` relational tables with `label` and `country_code` columns |
| CRM-02 | Social links (LinkedIn, X, GitHub) stored on contact records | `contact_social` table keyed by `(contact_id, platform)` — extensible, no hardcoded columns |
| FILE-01 | Files can be associated with projects, contacts, and conversations via API | Junction tables `file_projects`, `file_contacts`, `file_conversations`; `files` registry table |
| FILE-02 | Upload endpoint accepts files with target context (project_id, contact_id, conversation_id) | Atomic SQLite transaction: write file to disk, INSERT into `files`, INSERT into junction table — rollback deletes file if insert fails |
| FILE-03 | File metadata searchable and filterable by association, type, and date | `GET /api/v1/files` with query params `project_id`, `contact_id`, `conversation_id`, `mime_type`, `after`/`before` — simple indexed queries |
</phase_requirements>

---

## Summary

Phase 11 replaces three fragmented chat systems (legacy main chat, popup chat, project chat — documented in `research/chat-unification-audit.md`) with a single `conversations`/`messages` table pair. Every message — AI-generated, WhatsApp inbound, email inbound, agent reply — lands in the same table. The schema design is the hard part; the API surface follows naturally.

The CRM work adds proper relational multi-value fields. The existing `contacts` table in porter.py uses single-value email/phone columns. Phase 11 replaces this with `contact_emails`, `contact_phones`, and `contact_social` relational tables, aligning with the ACT! CRM reference in `feedback_act_crm.md`.

The file work adds a `files` registry table and three junction tables. The existing `files.ts` route handles filesystem operations only — no DB tracking. Phase 11 adds the registry layer and makes upload atomic: disk write + DB insert in a single transaction, with a file-cleanup rollback if the DB insert fails.

**Primary recommendation:** Build migrate-11.ts as one file covering all three domains (conversations, CRM, files) in dependency order. The FTS5 virtual table for messages is a proven pattern from Memory V2 — copy it directly.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | project-locked | SQLite driver with synchronous API | Used throughout — `sqlite.prepare()`, `sqlite.exec()`, transaction support |
| drizzle-orm | project-locked | ORM for simple CRUD operations | All new tables defined in `schema.ts`; Drizzle used for inserts/selects |
| zod | project-locked | Input validation | Every new endpoint's body validated with Zod schema before DB access |
| fastify-multipart | project-locked | Multipart file upload | Already in use in `files.ts` via `request.file()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `fs/promises` | stdlib | Disk I/O for file storage | `writeFile` inside the atomic upload transaction |
| Node.js `crypto` | stdlib | UUID generation | `crypto.randomUUID()` for all new primary keys (matches existing pattern) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FTS5 triggers | Application-layer FTS sync | Triggers are atomic with the write; app-layer sync can miss rows on crash |
| Junction tables for file associations | `entity_type`/`entity_id` polymorphic column | Junction tables allow FK enforcement; polymorphic columns can't be foreign-keyed |
| Relational contact_emails table | JSON column on contacts | Relational: indexable, queryable, type-safe; JSON: harder to filter on specific value |

**Installation:** No new packages. All dependencies are project-locked.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   ├── schema.ts          # Add new table exports here
│   └── migrate-11.ts      # New: all Phase 11 DDL + FTS5 triggers
├── routes/v1/
│   ├── conversations.ts   # New: GET/POST /conversations, /conversations/:id/messages
│   ├── contacts.ts        # New: CRUD contacts + sub-resources (emails, phones, social)
│   └── files.ts           # Extend: add /upload with registry + atomic association
├── index.ts               # Register new routes (migrate-11 call in boot sequence)
```

### Pattern 1: Migration File Structure (migrate-11.ts)
**What:** Single migration file with idempotency guard, runs all Phase 11 DDL in dependency order.
**When to use:** Phase 11 introduces tables that reference each other (messages FK to conversations, file junctions FK to files). Create all tables in one migration file to guarantee correct creation order.
**Example:**
```typescript
// Source: backend/src/db/migrate-10.ts (established pattern)
import { sqlite } from './client.js';

export function migrate11UnifiedChat(): void {
  const migrationId = 'phase11_unified_chat';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  // 1. companies (CRM parent — no deps)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS companies ( ... )`);

  // 2. contacts (FK to companies)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS contacts ( ... )`);

  // 3. contact multi-value tables (FK to contacts)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS contact_emails ( ... )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS contact_phones ( ... )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS contact_social ( ... )`);

  // 4. conversations (no hard deps)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS conversations ( ... )`);

  // 5. messages (FK to conversations)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS messages ( ... )`);

  // 6. FTS5 virtual table (depends on messages existing)
  sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(content, sender_name, channel_type, tokenize='porter unicode61')`);

  // 7. FTS5 sync triggers
  sqlite.exec(`CREATE TRIGGER IF NOT EXISTS messages_fts_insert
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, sender_name, channel_type)
      VALUES (new.id, new.content, new.sender_name, new.channel_type);
    END`);

  // 8. files registry
  sqlite.exec(`CREATE TABLE IF NOT EXISTS files ( ... )`);

  // 9. file junction tables
  sqlite.exec(`CREATE TABLE IF NOT EXISTS file_projects ( ... )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS file_contacts ( ... )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS file_conversations ( ... )`);

  // 10. contact-conversation link table
  sqlite.exec(`CREATE TABLE IF NOT EXISTS contact_conversations ( ... )`);

  // 11. contact-project link table
  sqlite.exec(`CREATE TABLE IF NOT EXISTS contact_projects ( ... )`);

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
}
```

### Pattern 2: Atomic File Upload Transaction
**What:** Wrap disk write + DB insert in a SQLite transaction. If the DB insert throws, delete the written file.
**When to use:** FILE-02 requirement: "if the insert fails, the file is not stored."
**Example:**
```typescript
// Source: derived from better-sqlite3 transaction API
const uploadAndRegister = sqlite.transaction(
  (fileId: string, diskPath: string, buffer: Buffer, meta: FileMeta) => {
    // Write to disk FIRST (inside transaction scope — but disk is not SQLite)
    // Use try/finally pattern: write disk, then insert DB, catch to delete disk file
    return sqlite.prepare(
      `INSERT INTO files (id, filename, disk_path, mime_type, size_bytes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, unixepoch('now'))`
    ).run(fileId, meta.filename, diskPath, meta.mimeType, buffer.length, meta.uploadedBy);
  }
);
// In the route handler:
try {
  await fs.writeFile(diskPath, buffer);
  uploadAndRegister(fileId, diskPath, buffer, meta);
  // Insert junction row in same transaction or immediate follow-up
} catch (e) {
  await fs.unlink(diskPath).catch(() => {});  // best-effort cleanup
  throw e;
}
```

**Note:** SQLite transactions don't wrap filesystem operations. The correct atomicity pattern is: write disk, then DB insert. On DB failure, delete the disk file. This matches the success criteria: "if the insert fails, the file is not stored."

### Pattern 3: FTS5 Virtual Table (from Memory V2)
**What:** SQLite FTS5 virtual table with AFTER INSERT/UPDATE/DELETE triggers that keep the FTS index in sync with the base table.
**When to use:** CHAT-03 — full-text search across message content, sender name, channel type.
**Key insight from Memory V2 audit:** FTS5 `content=''` (contentless) is lighter but can't return column values; use explicit column list so ranked queries return message IDs efficiently.

```typescript
// Source: Memory V2 pattern from research/porter-memory-v2.md
// FTS5 delete trigger (critical — prevents stale entries)
sqlite.exec(`CREATE TRIGGER IF NOT EXISTS messages_fts_delete
  BEFORE DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, sender_name, channel_type)
    VALUES ('delete', old.id, old.content, old.sender_name, old.channel_type);
  END`);

// FTS5 update trigger
sqlite.exec(`CREATE TRIGGER IF NOT EXISTS messages_fts_update
  AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, sender_name, channel_type)
    VALUES ('delete', old.id, old.content, old.sender_name, old.channel_type);
    INSERT INTO messages_fts(rowid, content, sender_name, channel_type)
    VALUES (new.id, new.content, new.sender_name, new.channel_type);
  END`);
```

### Pattern 4: Threaded Message Assembly
**What:** `messages` table has `parent_message_id` nullable FK. GET endpoint fetches all messages for a conversation, then assembles the tree in application code.
**When to use:** CHAT-02 — returning `children` arrays in the response.
**Example:**
```typescript
// Source: application-layer tree assembly
const rows = sqlite.prepare(
  `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
).all(conversationId) as MessageRow[];

// Build children map
const byId = new Map(rows.map(r => [r.id, { ...r, children: [] as any[] }]));
const roots: any[] = [];
for (const msg of byId.values()) {
  if (msg.parent_message_id && byId.has(msg.parent_message_id)) {
    byId.get(msg.parent_message_id)!.children.push(msg);
  } else {
    roots.push(msg);
  }
}
return roots;
```

**Why app-layer, not SQL:** SQLite recursive CTEs work but produce flat rows requiring re-assembly anyway. App-layer is simpler and avoids CTE query complexity. For arbitrarily deep trees this is correct.

### Pattern 5: Scope-Typed Conversations
**What:** `conversations` table has `scope_type TEXT NOT NULL CHECK(scope_type IN ('project','agent','contact','global'))` and `scope_id TEXT` (nullable for global scope).
**When to use:** CHAT-01 — every conversation is unambiguously scoped.

```typescript
// Index for efficient scope lookups
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_conv_scope
  ON conversations(scope_type, scope_id, updated_at DESC)`);

// External channel lookup by external_id (WhatsApp group/email thread)
sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_external
  ON conversations(external_id) WHERE external_id IS NOT NULL`);
```

### Pattern 6: WhatsApp Inbound Integration (CHAT-04)
**What:** Modify `webhooks-whatsapp.ts` to archive the inbound message in `messages` before queuing the agent job.
**When to use:** Every inbound WhatsApp message must appear in the unified conversation stream.

```typescript
// Source: backend/src/routes/v1/webhooks-whatsapp.ts (integration point)
// After signature verification, before routeInboundWhatsApp():

// 1. Find or create conversation by external_id (WhatsApp 'from' number or group_id)
let conv = sqlite.prepare(
  `SELECT id FROM conversations WHERE external_id = ?`
).get(from) as { id: string } | undefined;

if (!conv) {
  const convId = crypto.randomUUID();
  // Auto-create contact for unknown sender
  const contactId = findOrCreateContact({ phone: from });
  sqlite.prepare(
    `INSERT INTO conversations (id, scope_type, scope_id, external_id, channel_type, created_at, updated_at)
     VALUES (?, 'contact', ?, ?, 'whatsapp', unixepoch('now'), unixepoch('now'))`
  ).run(convId, contactId, from);
  conv = { id: convId };
}

// 2. Archive normalized message + raw payload
sqlite.prepare(
  `INSERT INTO messages (id, conversation_id, sender_type, sender_name, content, channel_type, channel_metadata, created_at)
   VALUES (?, ?, 'external', ?, ?, 'whatsapp', ?, unixepoch('now'))`
).run(crypto.randomUUID(), conv.id, from, messageText, JSON.stringify(value));
```

### Anti-Patterns to Avoid
- **JSON columns for multi-value CRM fields:** Decided against. Relational tables only for `contact_emails`, `contact_phones`, `contact_social`.
- **Separate chat endpoints per channel:** The whole point of CHAT-01 is one endpoint. Never add `/whatsapp-messages` or `/email-messages`.
- **FTS5 without delete trigger:** FTS5 index becomes stale and returns ghost matches. Always create all three triggers (insert, update, delete).
- **Disk write outside transaction:** Don't write the file inside a SQLite transaction (SQLite can't roll back disk writes). Use try/catch with cleanup.
- **Autoincrement integer IDs for new tables:** Existing pattern uses `TEXT PRIMARY KEY` with `crypto.randomUUID()`. Keep consistent.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search across messages | Custom trigram index or LIKE queries | FTS5 virtual table | FTS5 handles tokenization, ranking (BM25), phrase matching. LIKE `%query%` is O(n) and can't rank results |
| Threaded message tree | Recursive SQL CTE with complex reshaping | App-layer grouping after flat SELECT | Simpler, already have all rows, recursive CTEs in SQLite are verbose |
| File atomicity | Application-level retry/compensation logic | try/catch + disk cleanup after DB failure | DB transaction + disk cleanup is the correct pattern for SQLite + filesystem |
| Contact deduplication | Fuzzy matching engine | Exact phone/email lookup at ingest time | Deduplication merge tool is explicitly deferred — simple exact match for Phase 11 |

**Key insight:** FTS5 is built into SQLite. Every SQLite instance Porter uses already has it. Zero setup cost.

---

## Common Pitfalls

### Pitfall 1: FTS5 rowid Must Match messages.id
**What goes wrong:** FTS5 virtual table uses `rowid` internally. If `messages.id` is a TEXT UUID, the FTS rowid (integer) doesn't map to it automatically. You lose the ability to JOIN back to the messages table via rowid.
**Why it happens:** FTS5 documentation shows rowid usage assuming integer PKs.
**How to avoid:** Use `INTEGER PRIMARY KEY AUTOINCREMENT` for messages (not UUID TEXT), so the FTS rowid directly maps to the message PK. OR use a content table (`content="messages"`) which handles the mapping automatically. The content table approach is cleaner given existing UUID patterns.
**Alternative:** Add an `INTEGER PRIMARY KEY AUTOINCREMENT` alias column (`rowid alias`) while keeping a separate UUID column for external references. Simplest: use `INTEGER PRIMARY KEY AUTOINCREMENT` as the PK for `messages` (matching existing `chat_messages` which uses `integer('id').primaryKey({ autoIncrement: true })`).

### Pitfall 2: Scope Validation for conversation.scope_id
**What goes wrong:** `scope_id` is TEXT but has no FK — it references `projects.id`, `personas.id`, or `contacts.id` depending on `scope_type`. SQLite can't enforce this polymorphic FK.
**Why it happens:** Polymorphic FK is not supported by SQLite.
**How to avoid:** Validate scope_id existence in the route handler before INSERT. Check projects table if scope_type='project', personas table if scope_type='agent', contacts table if scope_type='contact'. Reject if not found.

### Pitfall 3: WhatsApp 'from' Is Phone Number, Not Contact ID
**What goes wrong:** Treating the WhatsApp `from` field as a stable user identity. It's a phone number string like "6591234567" with no country code prefix guaranteed.
**Why it happens:** Meta Cloud API payload sends raw phone number without `+` prefix.
**How to avoid:** Normalize phone at ingest: strip leading zeros, add `+` if needed. Store normalized form in `contact_phones`. Always look up by normalized phone when auto-creating or finding contacts.

### Pitfall 4: FTS5 Search Returns Row Count Mismatch on UPDATE
**What goes wrong:** UPDATE trigger must DELETE old FTS entry before INSERTing new one. Missing the delete step means one UPDATE creates two FTS entries for the same message — search returns duplicates.
**Why it happens:** FTS5 doesn't auto-detect that a rowid was updated. Both the old content and new content will match.
**How to avoid:** The delete trigger shown in Pattern 3 above is mandatory for UPDATE. Test with `UPDATE messages SET content = ? WHERE id = ?` and verify only one search result returns.

### Pitfall 5: Atomic Upload Requires Explicit File Cleanup Path
**What goes wrong:** File written to disk, then DB insert fails (e.g., invalid `project_id`). File sits on disk as orphan. Success criteria says: "if the insert fails, the file is not stored."
**Why it happens:** Async control flow — `writeFile` succeeds, `sqlite.prepare().run()` throws, `catch` block doesn't call `fs.unlink`.
**How to avoid:** Always wrap with try/catch and call `fs.unlink(diskPath).catch(() => {})` in the catch block. Test with an invalid project_id to verify the file is removed.

### Pitfall 6: Conversation External_id Unique Constraint Race
**What goes wrong:** Two concurrent WhatsApp messages from the same sender hit the webhook simultaneously. Both try to INSERT a new conversation with the same `external_id`. Second insert fails with UNIQUE constraint violation.
**Why it happens:** better-sqlite3 is synchronous but Fastify handles concurrent requests.
**How to avoid:** Use `INSERT OR IGNORE INTO conversations` and then `SELECT` to get the ID. Or use `INSERT INTO conversations ... ON CONFLICT(external_id) DO NOTHING` and check whether a row was created.

### Pitfall 7: Migration Boot Registration
**What goes wrong:** `migrate11UnifiedChat()` not called during Fastify startup, so tables never exist.
**Why it happens:** Each migration must be explicitly imported and called in the server boot sequence.
**How to avoid:** Add `migrate11UnifiedChat()` call to the same boot sequence file that calls `migrate10Collaboration()`. Check how migrate-10 is registered.

---

## Code Examples

Verified patterns from existing codebase:

### Proposed Schema: conversations Table
```typescript
// Source: schema.ts pattern — following existing table conventions
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),                          // crypto.randomUUID()
  scopeType: text('scope_type').notNull(),              // 'project'|'agent'|'contact'|'global'
  scopeId: text('scope_id'),                            // nullable for 'global'
  title: text('title'),
  channelType: text('channel_type').default('internal'), // 'internal'|'whatsapp'|'email'
  externalId: text('external_id'),                      // WhatsApp group_id or email thread_id
  metadata: text('metadata').default('{}'),              // JSON for extensibility
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});
```

### Proposed Schema: messages Table
```typescript
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }), // INTEGER PK for FTS5 rowid alignment
  conversationId: text('conversation_id').notNull(),
  parentMessageId: integer('parent_message_id'),          // self-ref for threading
  senderType: text('sender_type').notNull(),              // 'user'|'agent'|'external'|'system'
  senderId: text('sender_id'),                            // username, persona.id, or null
  senderName: text('sender_name'),                        // display name for FTS
  content: text('content').notNull(),
  channelType: text('channel_type').default('internal'),  // 'internal'|'whatsapp'|'email'
  channelMetadata: text('channel_metadata').default('{}'),// raw channel payload (JSON)
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
```

### Proposed Schema: contacts Table
```typescript
export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  companyId: text('company_id'),        // FK to companies.id (nullable)
  jobTitle: text('job_title'),
  notes: text('notes'),
  createdBy: text('created_by'),        // username
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const contactEmails = sqliteTable('contact_emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  value: text('value').notNull(),
  label: text('label').default('work'),  // 'work'|'personal'|'other'
  isPrimary: integer('is_primary').default(0),
});

export const contactPhones = sqliteTable('contact_phones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  value: text('value').notNull(),        // normalized E.164 preferred
  countryCode: text('country_code'),     // 'SG'|'US' etc.
  label: text('label').default('mobile'),
  isPrimary: integer('is_primary').default(0),
});

export const contactSocial = sqliteTable('contact_social', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  platform: text('platform').notNull(),  // 'linkedin'|'x'|'github'|'instagram'
  handle: text('handle').notNull(),
});
```

### Proposed Schema: files + Junction Tables
```typescript
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  diskPath: text('disk_path').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  uploadedBy: text('uploaded_by').notNull(),  // username
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

// Example junction — file_projects, file_contacts, file_conversations follow same pattern
export const fileProjects = sqliteTable('file_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: text('file_id').notNull(),
  projectId: text('project_id').notNull(),
  attachedBy: text('attached_by').notNull(),
  attachedAt: real('attached_at').default(sql`(unixepoch('now'))`),
});
```

### FTS5 Search Query Pattern
```typescript
// Source: Memory V2 + SQLite FTS5 docs
// Ranked search across messages
const searchResults = sqlite.prepare(`
  SELECT m.id, m.conversation_id, m.content, m.sender_name, m.created_at,
         rank
  FROM messages m
  JOIN messages_fts ON messages_fts.rowid = m.id
  WHERE messages_fts MATCH ?
  ORDER BY rank
  LIMIT 20
`).all(query) as MessageRow[];
```

### Envelope Pattern (from envelope.ts)
```typescript
// Source: backend/src/lib/envelope.ts
import { ok, err } from '../../lib/envelope.js';

// Success
return reply.send(ok({ conversation, messages }));

// Error
return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate chat sessions table per context | Single conversations table with scope_type/scope_id | Phase 11 | Unified history; no JOIN across tables to find all chats for a user |
| chat_messages with autoincrement int id | messages with autoincrement int id + parent_message_id | Phase 11 | Threading support; FTS5 rowid alignment preserved |
| Single email/phone on contact | Relational contact_emails, contact_phones tables | Phase 11 | Multi-value, filterable, country-code aware |
| Files stored on disk only (no DB registry) | files registry table + junction tables | Phase 11 | Associations queryable; atomic upload enforced |
| WhatsApp inbound only queues agent job | WhatsApp inbound archives in messages + queues job | Phase 11 | Full bidirectional history in unified table |

**Deprecated/outdated:**
- `chats` table: still exists but new conversations go to `conversations`. Old `chats` remain for backward compat with existing porter.py UI until frontend-v2.
- `chat_messages` table: same — kept for porter.py UI, new messages go to `messages`.
- `chat_attachments` table: replaced by `files` registry + `file_conversations` junction.

---

## Open Questions

1. **Boot sequence: where does migrate11UnifiedChat() get called?**
   - What we know: migrate-10 is called somewhere in the Fastify boot sequence
   - What's unclear: the exact file (likely `backend/src/server.ts` or `backend/src/index.ts`) — need to verify
   - Recommendation: Grep for `migrate10Collaboration` call to find the boot file; add `migrate11UnifiedChat` in same place

2. **Conversations route prefix conflict: /chat vs /conversations**
   - What we know: existing route is `chatV1Routes` at `/chat` prefix; new API is `/conversations`
   - What's unclear: should old `/chat/sessions` and `/chat/stream` remain unchanged?
   - Recommendation: Yes — leave `chat.ts` routes untouched. Register new `conversations.ts` at `/conversations` prefix. The success criteria specifies `/api/v1/conversations/:id/messages`, not replacement of `/chat`.

3. **File upload storage location**
   - What we know: existing `files.ts` uses `getServeDirs()` to resolve paths from porter_config.json
   - What's unclear: should the new upload endpoint use the same SERVE_DIRS mechanism, or a dedicated uploads directory?
   - Recommendation: Use a dedicated `uploads/` directory under `config.dataDir` — avoids SERVE_DIRS complexity and keeps uploaded files separate from filesystem browsing roots

4. **Contacts route: new file or extend existing?**
   - What we know: no `contacts.ts` exists in `routes/v1/`
   - What's unclear: none — it's new
   - Recommendation: New `contacts.ts` registered at `/contacts` prefix in `index.ts`

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (Node.js) |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "health"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

**Note:** The Playwright test suite is UI-level (browser tests against porter.py UI at port 8877). Phase 11 is pure backend API with zero frontend. The 35 existing tests test UI elements that Phase 11 doesn't touch. The validation approach for Phase 11 is curl-based API smoke tests, not Playwright.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | GET /conversations/:id/messages returns unified array | smoke | `curl -s http://127.0.0.1:8877/api/v1/conversations/:id/messages` | ❌ Wave 0 |
| CHAT-02 | POST with parent_id creates threaded reply; GET returns children arrays | smoke | `curl -s -X POST .../messages -d '{"parent_id":1,"content":"reply"}'` | ❌ Wave 0 |
| CHAT-03 | GET /conversations?q=... returns FTS5 ranked results | smoke | `curl -s 'http://127.0.0.1:8877/api/v1/conversations?q=test'` | ❌ Wave 0 |
| CHAT-04 | WhatsApp webhook POST archives message; appears in conversation GET | smoke | Manual trigger via webhook POST + conversation GET | ❌ Wave 0 |
| CRM-01 | PATCH /contacts/:id with emails array stores relational rows | smoke | `curl -s -X PATCH .../contacts/:id -d '{"emails":[...]}'` | ❌ Wave 0 |
| CRM-02 | PATCH /contacts/:id with social stores contact_social rows | smoke | `curl -s -X PATCH .../contacts/:id -d '{"social":{"linkedin":"..."}}' ` | ❌ Wave 0 |
| FILE-01 | GET /files?project_id=X returns associated files | smoke | `curl -s 'http://127.0.0.1:8877/api/v1/files?project_id=X'` | ❌ Wave 0 |
| FILE-02 | POST /files/upload with project_id=X is atomic | smoke | Upload + verify DB row; upload with invalid project_id + verify file deleted | ❌ Wave 0 |
| FILE-03 | GET /files with filters returns correct subset | smoke | `curl -s 'http://127.0.0.1:8877/api/v1/files?mime_type=image/png'` | ❌ Wave 0 |

**Note:** All Phase 11 tests are curl/HTTP smoke tests. No new Playwright tests needed — Playwright tests UI elements and Phase 11 adds no UI. The curl commands above validate the API contracts specified in the success criteria.

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/tests && npx playwright test` (35 existing tests — verify Phase 11 didn't break anything)
- **Per wave merge:** Full 35 tests + curl smoke tests for each completed requirement
- **Phase gate:** All 35 Playwright tests green + all 9 curl smoke tests manually verified before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/smoke-phase11.sh` — bash script with curl commands for all 9 requirements above
- [ ] `backend/src/db/migrate-11.ts` — must exist before any route work (all tables depend on it)
- [ ] `backend/src/routes/v1/conversations.ts` — new route file
- [ ] `backend/src/routes/v1/contacts.ts` — new route file

---

## Sources

### Primary (HIGH confidence)
- `backend/src/db/schema.ts` — exact existing table structure; all new tables follow same patterns
- `backend/src/db/migrate-10.ts` — exact migration file pattern replicated for migrate-11.ts
- `backend/src/routes/v1/chat.ts` — existing chat route patterns (sessions, stream, auth checks)
- `backend/src/routes/v1/files.ts` — existing file route patterns (safeResolve, MIME map, upload)
- `backend/src/routes/v1/webhooks-whatsapp.ts` — exact payload structure for WhatsApp integration
- `backend/src/lib/envelope.ts` — ok()/err() response helpers
- `backend/src/plugins/auth.ts` — requireAuth, requireProjectAccess patterns
- `research/chat-unification-audit.md` — problem analysis driving unified conversation design
- `research/crm-redesign-spec.md` — CRM entity model and relationship rules
- `research/porter-memory-v2.md` — FTS5 virtual table + trigger pattern (directly replicable)

### Secondary (MEDIUM confidence)
- SQLite FTS5 documentation — trigger patterns for insert/update/delete sync verified against existing Memory V2 implementation in porter.db

### Tertiary (LOW confidence)
- None — all findings based on existing codebase inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — migration pattern, envelope pattern, auth pattern all verified from existing code
- Pitfalls: HIGH — FTS5 rowid, trigger completeness, WhatsApp phone normalization verified against existing code and SQLite docs
- Schema design: HIGH — follows established Drizzle + better-sqlite3 patterns from schema.ts

**Research date:** 2026-03-22
**Valid until:** 2026-06-22 (stable tech stack, no third-party APIs changing)
