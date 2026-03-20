# Codebase Concerns

**Analysis Date:** 2026-03-20

## Tech Debt

**Deprecated Features Still Active:**
- Issue: Cortex (auto-memory extraction) disabled but code remains active. Preferences still expose `cortex_enabled`, `cortex_min_response_len`, `cortex_max_facts`, etc. (DEFAULT_PREFERENCES lines 100-104)
- Files: `porter.py:100-104, 259-260, 1551, 1744, 1860-1908`
- Impact: Configuration UI shows inactive features. Code maintenance burden for unused system. Memory V2 overlaps with deprecated Cortex logic.
- Fix approach: Remove all cortex preference fields, disable memory extraction workflow (`_wf_register("memory_extraction"...)`), clean up Cortex consolidation functions, or fully migrate to Memory V2.

**Projects MEMORY.md Still Generated Despite Deprecation:**
- Issue: Projects V2 plan notes MEMORY.md is deprecated for STATE.md but code still creates empty MEMORY.md files (line 1004)
- Files: `porter.py:998-1004`
- Impact: Creates obsolete files in every new project workspace. Confusing to users who see both MEMORY.md and STATE.md.
- Fix approach: Remove MEMORY.md creation from `_create_agent_project` function. Update project structure generator to only create STATE.md.

**Duplicate Function Definitions:**
- Issue: Three functions defined twice due to copy-paste: `_normalize_project_name`, `_migrate_project_workspace_root`, `_normalize_project_registry_names`
- Files: `porter.py` (search needed for exact line numbers)
- Impact: Code maintenance confusion, one definition will be masked by the other, hard to know which version is active
- Fix approach: Identify exact locations, delete all duplicates, keep single authoritative version, verify all call sites reference the correct one.

**Projects V2 Incomplete:**
- Issue: Giant hero panel with marketing copy still in project list view. YMC Capital hardcoded as example in creation prompts. Governance scaffolds (PROJECT_BRIEF, SUCCESS_CRITERIA, etc.) still generated but unused.
- Files: `porter.py` (creation UI), `backend/src/` (project routes), projects V2 research doc shows full redesign spec
- Impact: UI clutter, confusing onboarding, unused file scaffolds waste storage and create dead-end templates
- Fix approach: Implement Projects V2 redesign (phase out giant hero panel, remove governance scaffolds, remove YMC Capital hardcoding, implement project types, add milestone progress, implement linked projects feature)

**Deprecated Checkpoint.md Still Created and Maintained:**
- Issue: checkpoint.md migrated to task-registry/*.json but is still marked as deprecated with a header (lines 3134-3142). Migration happens but old file not deleted.
- Files: `porter.py:3134-3142`
- Impact: Users see "DEPRECATED" warnings in legacy files. Task state tracked in two places during transition.
- Fix approach: Remove checkpoint.md file after migration to task-registry, delete migration code once transition complete.

---

## Exception Handling Issues

**Overly Broad Exception Catching (683 instances):**
- Issue: Extensive use of bare `except Exception:` (91 instances) and `except: pass` (4 instances) throughout codebase. Masks actual errors and makes debugging difficult.
- Files: `porter.py` (distributed throughout)
- Impact: Silent failures, hard-to-diagnose bugs, errors go unlogged in ~690 locations
- Fix approach: Replace bare `except Exception:` with specific exception types. Log all errors to audit trail or stderr. Use `log.exception()` instead of `pass`.

**Bare Pass Statements in Error Paths:**
- Issue: Multiple `except: pass` patterns (e.g., lines 197-198, 221, 224) swallow errors entirely
- Files: `porter.py:197-198, 221, 224`
- Impact: Workflow stats may fail to persist silently. Memory loads may lose historical data. No trace of failures.
- Fix approach: Log all exception paths with `log.warning()` or `log.exception()`.

**Database Connection Leak Risk:**
- Issue: Inconsistent connection cleanup. Some paths call `conn.close()` in happy path but not in exception handlers. Pattern: `try: ... conn.execute(...); conn.commit(); conn.close()` without finally block (e.g., lines 189-196).
- Files: `porter.py:324-328, 189-196, 567-609, 1616, 1887-1889` and many others
- Impact: Under error conditions, database connections leak. WAL mode helps but connections still consumed under high load.
- Fix approach: Wrap all `_db_conn()` calls in try-finally blocks. Use context manager pattern for connection handling.

---

## Database & Resource Management

**SQLite Connection Timeout Set to 5 Seconds:**
- Issue: `sqlite3.connect(timeout=5)` (line 325) is very short. Under concurrent load, timeout exceptions will occur.
- Files: `porter.py:325`
- Impact: Request failures when database is locked. No retry logic.
- Fix approach: Increase timeout to 30-60 seconds. Add exponential backoff retry wrapper around `_db_conn()`.

**No Connection Pooling:**
- Issue: Every request calls `_db_conn()` creating a new connection. No pooling. WAL mode helps but still inefficient.
- Files: `porter.py:324`
- Impact: High connection overhead under concurrent load. Potential connection limit exhaustion.
- Fix approach: Implement connection pooling using threading.local() or queue.Queue for reusable connections.

**Workflow Registry History Unbounded:**
- Issue: Workflow `history` list in `_wf_registry` grows indefinitely. No max size (line 143).
- Files: `porter.py:143, 178-182`
- Impact: Memory leak over time as workflows run. Each entry stores ts, ok, duration, error (up to 200 chars).
- Fix approach: Cap history to last 100 entries. Rotate oldest entries.

**Memory V2 Consolidation Loop May Stall:**
- Issue: `_memory_v2_consolidation_pass()` runs without timeout. Long-running queries on large memories table could block other operations.
- Files: `porter.py:2329-2365`
- Impact: If memories table grows large, consolidation can lock database for seconds/minutes.
- Fix approach: Add query timeout. Process in batches. Add progress logging. Consider async consolidation thread.

**Session Expiration Not Enforced at Cleanup:**
- Issue: Sessions are deleted on startup (purged at line 331) but never during normal operation. Old sessions accumulate until restart.
- Files: `porter.py:331`
- Impact: sessions table grows unbounded. Old tokens may persist and be reusable (low risk but not clean).
- Fix approach: Run session cleanup in periodic workflow. Add TTL-based deletion.

---

## Security Considerations

**Database Credentials Not Encrypted at Rest:**
- Issue: SQLite database at `~/.porter/porter.db` contains user password hashes and session tokens. No encryption.
- Files: `porter.py:321`
- Impact: Compromise of filesystem = compromise of all user credentials and sessions. Acceptable for single-user/trusted environments but risky for multi-user systems.
- Fix approach: Use SQLCipher for encrypted SQLite. Accept that this is acceptable trade-off for current deployment model.

**Bearer Token Auth Relies on Network Security:**
- Issue: Agent Bearer tokens passed in Authorization header over HTTP (not HTTPS). No token rotation. Tokens stored in cleartext in database.
- Files: `backend/src/routes/` (all routes check Bearer tokens)
- Impact: Tokens exposed if network sniffed. No time-limited scope.
- Fix approach: Use HTTPS in production. Implement token expiration. Use short-lived tokens with refresh tokens.

**Path Traversal Prevention Incomplete:**
- Issue: `safe_resolve()` correctly checks `relative_to()` but `unquote()` is applied before resolution. URL-encoded `../` could potentially bypass check if encoding is unusual.
- Files: `porter.py:12892`
- Impact: Low risk due to relative_to check, but encoding edge cases exist.
- Fix approach: Validate rel path doesn't contain `..` before unquoting. Use Path.parts and filter out parent refs.

**Admin Endpoints Protected but Inconsistently:**
- Issue: `/api/admin/*` endpoints require `auth_check_cap("admin")` but capability check buried in route handlers, not centralized middleware.
- Files: `backend/src/routes/admin.ts:127`
- Impact: Easy to forget protection when adding new admin endpoints. No audit log of all admin access.
- Fix approach: Implement auth middleware decorator. Add audit logging to all admin operations.

**Hardcoded Default Credentials in Tests:**
- Issue: Test credentials `admin` / `porter` are well-known and used in test_p0_p1.py (line 13)
- Files: `tests/test_p0_p1.py:13`
- Impact: If tests run on production-like system, default password enables access
- Fix approach: Use random test credentials. Require environment variable override.

---

## Performance Bottlenecks

**N+1 Query in Chat Sessions List:**
- Issue: `/api/chat/sessions` fetches all chats, then for each chat fetches message count in Promise.all loop (lines 56-68 in chat.ts)
- Files: `backend/src/routes/chat.ts:56-68`
- Impact: If user has 100 chats, makes 101 queries. Scales poorly. Comment even notes "could be optimized with a join/group by"
- Fix approach: Use SQL LEFT JOIN with COUNT(chatMessages.id) GROUP BY chats.id in single query.

**Session Summary Parsing Unbounded:**
- Issue: `_load_claude_session_summaries()` reads up to 50 .jsonl files line-by-line, parsing each line into JSON. No size limit on files.
- Files: `porter.py:5502`
- Impact: Loading UI can stall if any .jsonl file is very large or corrupted. No timeout on file read.
- Fix approach: Add file size check (skip >100MB files). Add line count limit. Stream parsing with timeout.

**Cortex Memory Consolidation Expensive:**
- Issue: `_cortex_consolidate_facts()` runs full table scan and grouping for memory consolidation (lines 2040-2060)
- Files: `porter.py:2040-2060`
- Impact: With thousands of facts, consolidation blocks database
- Fix approach: Add indexed queries. Process in time-windowed batches. Add consolidation status tracking.

**Public IP Lookup on Every Startup:**
- Issue: `_public_ip_hint()` tries 3 external API calls with 4-second timeout each (lines 70-83) on startup
- Files: `porter.py:70-83`
- Impact: Startup blocked up to 12 seconds if network is slow/unavailable
- Fix approach: Move to background thread. Cache result for 1 hour. Fail fast with 2-second timeout.

**Context Hygiene Full Document Scan:**
- Issue: Hygiene jobs scan all memory files, agent files, soul files line-by-line looking for text to archive (lines 2384-2447)
- Files: `porter.py:2384-2447`
- Impact: With thousands of files, hygiene job can take minutes and lock filesystem
- Fix approach: Index memory by last-modified. Only scan files modified since last hygiene run. Run in background thread.

---

## Fragile Areas

**Projects Configuration Lives in JSON, Not Database:**
- Issue: Projects stored in `porter_config.json` which is also general configuration. No schema validation. Loaded into memory on every startup.
- Files: `porter.py:1210-1250`
- Impact: Large projects.md = slow startup. No transactions. Migration path fragile. Hard to query. Loss of editing history.
- Fix approach: Migrate projects to SQLite (projects table with full schema). Keep backup JSON export for audit.

**Agent Workspace Directory Path Assumptions:**
- Issue: AGENT_WORKSPACE_DIR hardcoded to `~/.openclaw` if not explicitly set (line 315). Code assumes specific directory structure with `agents/`, `projects/`, `sessions/` subdirs.
- Files: `porter.py:313-316, 3991, 4111, 4170, 4396, 4429, 4537-4540`
- Impact: If openclaw moves or has different layout, code fails silently. No validation on startup that structure is correct.
- Fix approach: Add startup validation that workspace has expected structure. Create missing dirs automatically. Add comprehensive logging.

**Task Registry Migration One-Way:**
- Issue: checkpoint.md → task-registry/*.json migration happens once (line 3050+). If someone modifies task-registry/*.json outside Porter, changes won't sync back.
- Files: `porter.py:3050-3145`
- Impact: Manual task edits get lost on next restart. No two-way sync.
- Fix approach: Load from task-registry on startup, not checkpoint.md. Add file watching for external edits.

**Cortex & Memory V2 Coexist:**
- Issue: Both cortex-era memory (semantic, episodic facts) and Memory V2 (directives, concepts, signals) exist in database. Code has migration path but both systems still partially active.
- Files: `porter.py:694-730, 1551-2365`
- Impact: Confusing state. Both systems allocate resources. Risk of data loss if migration incomplete.
- Fix approach: Pick one system. Fully migrate existing cortex data to Memory V2 structures. Remove all cortex code.

**State Engine Directives Incomplete:**
- Issue: Memory V2 includes `memory_kind='directive'` for state engine but directives not fully wired into dispatch system. Cortex still referenced in comments.
- Files: `porter.py:2780-2815, 3311-3400`
- Impact: Features labeled as available but partially implemented
- Fix approach: Complete directives implementation. Add full directive → dispatch injection. Remove cortex references.

---

## Scaling Limits

**SQLite Single-File Limit:**
- Issue: All data (sessions, tasks, chats, memories, usage) in single porter.db file. WAL mode helps concurrency but not horizontal scaling.
- Files: `porter.py:321, 325`
- Impact: Cannot scale to multiple Porter instances. Database file corruption affects all features. Backup complexity.
- Fix approach: Plan for future PostgreSQL migration. Add query abstraction layer now to enable backend swap.

**Session Token TTL Hard-Coded:**
- Issue: SESSION_TTL = 30 days (line 304). No configurable expiration. No refresh token flow.
- Files: `porter.py:304`
- Impact: Long-lived tokens are security risk. Logout does not invalidate tokens (they persist until TTL expires).
- Fix approach: Reduce TTL to 7 days. Implement logout that marks token revoked. Add refresh token flow.

**Workflow Registry Assumes Single Process:**
- Issue: Workflows and their history stored in Python dict `_wf_registry` (line 132). If Porter runs in multiple processes, workflows won't see each other's history.
- Files: `porter.py:132, 206-225`
- Impact: Cannot run Porter in multi-process mode. Clustering impossible.
- Fix approach: Move workflow stats to database. Read/write from shared table instead of memory dict.

**Memory Directory Not Scanned for Size:**
- Issue: No cleanup of old memory files. MEMORY_DIR can grow unbounded (line 317).
- Files: `porter.py:317, 2384-2447`
- Impact: Disk space usage grows indefinitely. Old sessions accumulate.
- Fix approach: Add size-based cleanup. Delete memory files >30 days old. Limit total dir size to 500MB.

---

## Missing Critical Features

**No Audit Log Rotation:**
- Issue: AUDIT_LOG appends to single file indefinitely (line 1091). Reads entire file for audit viewer.
- Files: `porter.py:1091, 11600+`
- Impact: Audit log grows to GB sizes. Slow to query. Hard to archive for compliance.
- Fix approach: Implement log rotation (daily or size-based). Compress old logs. Move to database.

**No Backup Strategy:**
- Issue: No built-in backup of porter.db, config, or memory files. No restore utility.
- Files: `porter.py` (no backup code)
- Impact: Data loss = total loss. Operator has no recovery path.
- Fix approach: Add `--backup` command. Use SQLite dump for config. Zip memory directory. Store timestamped backups.

**No Health Check for External Services:**
- Issue: Code assumes openclaw, Ollama, APIs are up but doesn't verify on startup or periodically.
- Files: `porter.py:5816, 5850+`
- Impact: Features labeled available but fail silently when services down
- Fix approach: Add capability detection workflow. Check each service status. Badge features as "degraded" if dependencies unavailable.

**No Rate Limiting:**
- Issue: No protection against brute force login attacks beyond basic IP lockout (line 307-308). No API rate limiting per user/token.
- Files: `porter.py:307-308`
- Impact: Brute force attacks possible. DOS by repeated requests possible.
- Fix approach: Implement token bucket rate limiting per IP and per user. Add CAPTCHA after N failed logins.

---

## Testing Gaps

**Backend Routes Not Unit Tested:**
- Issue: Backend TypeScript routes (chat.ts, admin.ts, files.ts, etc.) have no unit tests. Only Playwright e2e tests exist.
- Files: `backend/src/routes/` (all .ts files), `tests/ui-regression.spec.js`
- Impact: Business logic bugs in routes not caught until e2e. Hard to debug failures.
- Fix approach: Add Jest tests for each route. Mock database. Test error paths.

**No API Contract Tests:**
- Issue: No validation that API responses match schema. No OpenAPI spec.
- Files: `backend/src/` (no schema validation)
- Impact: Frontend code assumes response shape but gets surprises in production
- Fix approach: Add OpenAPI schema. Use ajv to validate responses. Test against schema.

**Cortex Consolidation Logic Not Tested:**
- Issue: Complex memory consolidation logic (lines 2040-2060) has no tests. Edge cases unknown.
- Files: `porter.py:2040-2060`
- Impact: Bugs in consolidation go unnoticed until data is lost
- Fix approach: Add unit tests for consolidation. Test with various memory configurations.

**No Load Testing:**
- Issue: No simulation of concurrent users, large datasets, etc. Performance characteristics unknown.
- Files: `tests/` (Playwright tests are single-user sequential)
- Impact: Bottlenecks not discovered until production. Scaling properties unknown.
- Fix approach: Add load test using locust or wrk. Test 100 concurrent sessions, 10k chats, etc.

---

## Code Quality Issues

**Magic Numbers Throughout:**
- Issue: Hardcoded values: 30 (SESSION_TTL line 304), 5 (_LOGIN_MAX_ATTEMPTS line 307), 30 (lockout base line 308), 4000 (hygiene_ctx_budget line 114), etc.
- Files: `porter.py:100-116, 304-308`
- Impact: Hard to understand what numbers mean. Changing one requires searching whole codebase.
- Fix approach: Move all magic numbers to named constants at top of file. Add comments explaining.

**Module Imports Scattered:**
- Issue: Many imports inside functions (e.g., `import time as _t`, `import json as _j`) scattered throughout code instead of at top
- Files: `porter.py:149, 157, 188, 209` and many others
- Impact: Harder to see dependencies. Inconsistent style.
- Fix approach: Move all imports to top of file. Use standard names.

**Global Mutable State:**
- Issue: Multiple globals: `_sessions`, `_login_attempts`, `_wf_registry`, `_config`, `_PUBLIC_IP_CACHE`, `_hygiene_stats`
- Files: `porter.py:54, 131, 132, 235, 243, 305-306, 119-127`
- Impact: Hard to test. Concurrency issues. State leaks between requests.
- Fix approach: Encapsulate in a PorterState class. Pass through context, not globals.

**Inconsistent Logging:**
- Issue: Some errors logged with `log.info()`, some with `log.warning()`, some silently swallowed. No consistent severity model.
- Files: `porter.py` (distributed throughout)
- Impact: Hard to find actual problems in logs. Severity doesn't match impact.
- Fix approach: Define logging policy: INFO for state changes, WARNING for recoverable issues, ERROR for actual failures.

**Hardcoded YMC Capital:**
- Issue: "YMC Capital" appears in projects creation prompts as example. Not configurable.
- Files: `porter.py` (search needed)
- Impact: When deploying for different organization, example text is wrong
- Fix approach: Use generic company names. Make example configurable via config.json.

---

## Deprecated Code to Remove

**Cortex System:**
- Lines: 1551-2156, 1860-1908, 2041-2060, 2114-2120, etc.
- Reason: Replaced by Memory V2. Dead code.
- Action: Remove all cortex-related functions and config keys.

**MEMORY.md Creation:**
- Lines: 998-1004
- Reason: Deprecated for STATE.md
- Action: Delete project memory file generation.

**checkpoint.md Migration:**
- Lines: 3050-3145
- Reason: One-time migration complete
- Action: Remove migration code. Delete checkpoint.md on startup.

**Cortex Consolidation Loop:**
- Lines: 2307-2365
- Reason: Redundant with Memory V2 consolidation
- Action: Remove `_cortex_consolidate_facts()` and workflow registration.

---

## Hardcoding Violations (CLAUDE.md)

**HOST and PORT Configuration:**
- Issue: HOST hardcoded to empty string (line 39), relies on env var. PORT defaults to 8877 (line 30). Works but not ideal.
- Files: `porter.py:30, 39`
- Impact: Configuration not discoverable
- Fix approach: Add to default porter_config.json with sensible defaults.

**DEFAULT_MOUNTS Empty But Pattern Suggests Hardcoding:**
- Issue: Line 89 shows `DEFAULT_MOUNTS: list = []` as if intentionally empty, but architecture expects this to be populated from config on first run
- Files: `porter.py:89`
- Impact: First-run setup requires manual mount configuration
- Fix approach: Document expected first-run wizard flow. Validate at startup.

**OPENCLAW_STATE_DIR Assumes ~/.openclaw:**
- Issue: Line 315 defaults to `~/.openclaw` if env var not set
- Files: `porter.py:315-316`
- Impact: Assumes openclaw is installed in standard location. May not be true in all deployments.
- Fix approach: Add capability detection at startup. Prompt user if openclaw not found.

---

## Data Loss Risks

**No Transactions for Multi-Step Operations:**
- Issue: Some operations (e.g., project creation, task completion) involve multiple database inserts/updates without wrapping in transaction
- Files: `porter.py` (distributed throughout database operations)
- Impact: Partial state if process crashes mid-operation
- Fix approach: Use explicit BEGIN/COMMIT for all multi-step operations.

**Workflow Stats Persist Only on Successful Close:**
- Issue: If Porter crashes, workflow stats for current run are lost. Only written on next successful _wf_record_run (lines 188-198)
- Files: `porter.py:188-198`
- Impact: Workflow history gaps on crashes
- Fix approach: Write stats immediately after operation completes, then finalize on success.

**No Write-Ahead Logging for Critical Operations:**
- Issue: Some critical operations (e.g., task state changes) written to database but no undo log
- Files: `porter.py` (task routes)
- Impact: No way to rollback accidental data changes
- Fix approach: Add undo log table. Implement rollback command.

---

## Monitoring Gaps

**No Metrics Export:**
- Issue: Workflow stats captured but not exported to Prometheus/StatsD. No operational metrics visible outside Porter UI.
- Files: `porter.py:131-225`
- Impact: Can't integrate with external monitoring. No alerting.
- Fix approach: Add `/metrics` endpoint in Prometheus format. Export workflow stats, response times, error rates.

**No Distributed Tracing:**
- Issue: No correlation IDs between requests. Impossible to trace dispatch through system.
- Files: `porter.py`, `backend/src/`
- Impact: Hard to debug multi-service issues. No visibility into flow.
- Fix approach: Add X-Request-ID header. Log at each step. Add OpenTelemetry integration.

**No Structured Logging:**
- Issue: Log output is freeform strings. No structured fields for filtering/alerting.
- Files: `porter.py` (all logging calls)
- Impact: Hard to parse logs. Can't build dashboards.
- Fix approach: Switch to JSON logging. Include timestamp, level, component, user, request_id.

---

*Concerns audit: 2026-03-20*
