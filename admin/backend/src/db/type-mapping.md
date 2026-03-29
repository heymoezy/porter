# SQLite-to-PostgreSQL Type Mapping Reference

Authoritative reference for all SQLite-to-PG translations needed across the porter-admin migration (Phases 2-6). Every executor should consult this document when converting route files.

## 1. Column Type Mapping

| SQLite Type | PG Type | Notes |
|---|---|---|
| `text` | `text` | Direct mapping |
| `integer` | `integer` | Direct mapping |
| `real` | `double precision` | SQLite REAL = 8-byte IEEE float |
| `text` (JSON string) | `jsonb` | PG auto-parses JSONB to JS objects; remove JSON.parse() calls |
| `blob` | `bytea` | Only chat_attachments.data uses this |
| `integer` (boolean 0/1) | `integer` | PG uses integer 0/1, same as SQLite |
| `integer` (autoIncrement) | `serial` | PG uses sequences for auto-increment |

## 2. SQL Function Mapping

| SQLite | PostgreSQL |
|---|---|
| `?` placeholder | `$1, $2, $3...` numbered placeholders |
| `INSERT OR REPLACE INTO t` | `INSERT INTO t ... ON CONFLICT (...) DO UPDATE SET ...` |
| `INSERT OR IGNORE INTO t` | `INSERT INTO t ... ON CONFLICT (...) DO NOTHING` |
| `unixepoch('now')` | `EXTRACT(epoch FROM now())` |
| `strftime('%s','now')` | `EXTRACT(epoch FROM now())` |
| `substr(col, 1, N)` | `substring(col from 1 for N)` or `left(col, N)` |
| `LIKE` (case-sensitive by default) | `LIKE` (case-sensitive) or `ILIKE` (case-insensitive) |

## 3. API Result Mapping

| SQLite (better-sqlite3) | PostgreSQL (pg) | Helper |
|---|---|---|
| `.prepare(sql).get(...args)` | `queryOne(sql, [args])` | Returns row or null |
| `.prepare(sql).all(...args)` | `queryAll(sql, [args])` | Returns array of rows |
| `.prepare(sql).run(...args)` | `execute(sql, [args])` | Returns { rowCount } |
| `.run().changes` | `.rowCount` | Via execute() |
| `.run().lastInsertRowid` | `RETURNING id` clause | Use queryOne() with RETURNING |

## 4. JSONB Gotcha

The pg driver (v8.x) auto-parses JSONB columns to JS objects. Code that calls `JSON.parse(row.someJsonCol)` on data returned from PG will fail with `SyntaxError: Unexpected token o in JSON.parse` because the value is already a parsed object, not a string.

**Safe parser pattern** (handles both SQLite text and PG JSONB):

```typescript
typeof val === 'string' ? JSON.parse(val) : val
```

Or remove `JSON.parse()` entirely when the source is guaranteed to be PG. The existing `parseJson()` helper in `templates.ts` already handles this correctly by checking `typeof val !== 'string'` before parsing.

## 5. Missing PG Tables

Three tables exist in SQLite schema but not in PG:

- **`environment_tools`** -- used in `routes/tools.ts` (5 call sites). Must be created or queries removed during Phase 3 migration.
- **`orchestration_runs`** -- used in `routes/health.ts` dashboard (1 call site, try/catch guarded). Must be created or queries removed during Phase 5 migration.
- **`session_learnings`** -- used in `routes/activity.ts` + `routes/health.ts` (3 call sites, try/catch guarded). Must be created or queries removed during Phase 3/5 migration.

All code referencing these tables has try/catch guards, so they will not crash at runtime before their respective migration phases.
