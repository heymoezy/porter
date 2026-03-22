---
phase: 11-unified-chat-and-crm-schema
plan: "02"
subsystem: backend/conversations-api
tags: [conversations, messaging, threading, fts5, search, api]
dependency_graph:
  requires: [11-01]
  provides: [CHAT-01, CHAT-02, CHAT-03]
  affects: [backend/src/routes/v1/conversations.ts, backend/src/routes/v1/index.ts]
tech_stack:
  added: []
  patterns: [fastify-plugin, better-sqlite3-raw, zod-v4, fts5-fulltext-search, tree-building]
key_files:
  created:
    - backend/src/routes/v1/conversations.ts
  modified:
    - backend/src/routes/v1/index.ts
decisions:
  - "GET /search registered BEFORE /:id param route to avoid route conflict in Fastify"
  - "z.record() requires two args in Zod v4 (z.record(z.string(), z.unknown())) — Plan 01 interface showed single-arg which is Zod v3 syntax"
  - "Orphaned replies (parent outside current page) surface as root messages to avoid silent data loss on paginated responses"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-22"
  tasks_completed: 2
  files_changed: 2
---

# Phase 11 Plan 02: Unified Conversations API Summary

**One-liner:** Fastify plugin for unified conversation and message CRUD with parent_id threading and FTS5 full-text search, registered at /api/v1/conversations alongside preserved /chat routes.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create conversations.ts with CRUD, threading, FTS5 | b84a1a0 | backend/src/routes/v1/conversations.ts (created) |
| 2 | Register in v1/index.ts, verify backward compat | 62de924 | backend/src/routes/v1/index.ts (modified) |

## What Was Built

### conversations.ts — 8 route handlers

| Route | Handler | Description |
|-------|---------|-------------|
| GET /search | FTS5 search | Full-text search across all messages, ranked by relevance |
| GET / | List conversations | Scope-filtered list, supports ?q= FTS search |
| POST / | Create conversation | scope_type validation against projects/personas/contacts tables |
| GET /:id | Get conversation | Single conversation with parsed metadata |
| PATCH /:id | Update conversation | Title and/or metadata updates |
| DELETE /:id | Delete conversation | Transactional delete of conversation + all its messages |
| GET /:id/messages | Get messages | Tree-structured (default) or flat array, paginated |
| POST /:id/messages | Create message | Threading via parent_id, auto-populates user sender info |

### Key capabilities implemented

- **CHAT-01 (unified API):** All conversation/message ops through single route prefix `/api/v1/conversations`
- **CHAT-02 (threading):** `parent_id` on POST creates a reply; GET returns `children: []` tree built in application code
- **CHAT-03 (FTS5 search):** `GET /search?q=` and `GET /?q=` both use `messages_fts MATCH` against the FTS5 virtual table created in Plan 01 migration
- **Backward compatibility:** `/api/v1/chat/sessions` and all legacy chat routes remain untouched

### Tree building algorithm

Messages are fetched in `ORDER BY created_at ASC`. A Map<id, MessageNode> is built in one pass. A second pass attaches children to parents. Root messages (null parent_message_id) form the top-level array. Orphaned replies (parent outside current page window) are surfaced as roots to prevent data loss on paginated responses.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 z.record() requires two arguments**
- **Found during:** TypeScript compilation after Task 1
- **Issue:** Plan interface showed `z.record(z.unknown())` (Zod v3 syntax). Zod v4 requires `z.record(z.string(), z.unknown())`
- **Fix:** Changed all three `z.record(z.unknown())` calls to `z.record(z.string(), z.unknown())`
- **Files modified:** backend/src/routes/v1/conversations.ts
- **Commit:** b84a1a0 (included in same commit after fix)

**2. [Rule 2 - Missing Critical] GET /search placed before /:id param route**
- **Found during:** Task 1 design
- **Issue:** Fastify evaluates routes in registration order; `/search` must be registered before `/:id` or Fastify would match "search" as the `id` parameter
- **Fix:** Registered GET /search as the first route handler in the plugin
- **Files modified:** backend/src/routes/v1/conversations.ts

## Self-Check: PASSED
