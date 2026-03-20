# Phase 2: Memory V2 - Research

**Researched:** 2026-03-20
**Domain:** In-process Python memory system, SQLite FTS5, SSE real-time UI, Porter-specific monolith patching
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Cortex deletion:** Hard delete everything — all ~30 cortex_* functions, cortex_memories table, consolidation loop, batch extract loop. Clean slate — do NOT migrate old cortex_memories data into V2. Porter Recall starts fresh. Full V2 schema in one shot — add all remaining columns. Inline processing only — no background loops for memory.
- **Brand Identity:** System name is "Porter Recall" (engine name), UI labels stay "Memory". Agent detail tab renamed "Concepts" → "Memory".
- **Signal noise filtering:** Blacklist approach. Block list: auth actions (login/logout/password change/session refresh/registration), file operations (upload/download/browse/delete/rename/create folder), navigation (tab switches/page loads/accordion toggles/search queries), system/health (health checks/version queries/boot events/capability detection). Inline indicator: "✨ Recall noted: [concept]" below chat message when Porter learns something.
- **Memory feed UX:** Global "Memory" tab — all Recall events filterable by scope. Agent "Memory" tab — filtered to agent's memories. Compact row format — icon + memory text + scope badge + timestamp. Badge count on Memory nav item. Porter auto-manages. Preference toggle: "Auto-manage memory" (on by default) vs "Review everything".
- **Memory scopes:** Three scopes for Phase 2: global, project, agent. Global memories always injected unless project is private. Project memories isolated. Agent memories stay with agent. Per-project privacy toggle. Auto-suggest cross-project promotion when pattern appears in 2+ projects.
- **Memory injection at dispatch:** Frozen snapshot — capture once at session start. Tiered priority: directives first (always), concepts relevant to scope, recent episodes if space allows. ~500 token cap. Relevance scored by scope match + recency.
- **Chat integration:** Natural language memory queries. Remember + forget via chat — "Remember that I prefer dark mode" → creates directive. "Forget that old project name" → dismisses memory.
- **Agent writing styles (02-07):** Role-based defaults + Recall learning. Shared anti-pattern block list (generic AI filler). Agent evolution — Recall promotions trigger agent "Who Is" identity rebuild with respawn/transformation animation (Pokemon-style).
- **Interaction feedback loop (02-08):** Implicit signals (accept/correct/follow-up detection). Both agent + global scope. No model training — outcome-aware context injection only.
- **Memory persistence:** Plain text with metadata. FTS5 indexes text + scope metadata.

### Claude's Discretion
- FTS5 index rebuild strategy and performance optimization
- Exact token counting approach for the 500-token injection cap
- Signal extraction prompt design (what prompt extracts memories from chat responses)
- Respawn animation design for agent evolution
- Anti-pattern block list contents (specific phrases to avoid)
- Memory decay/cleanup strategy for stale signals
- Inline indicator visual design (the "✨ Recall noted" line)

### Deferred Ideas (OUT OF SCOPE)
- Squad and run memory scopes — deferred to Phase 4+
- PorterHQ fleet-wide memory control surface
- Memory attribution in dispatch (tracking which memories influenced which responses)
- Cross-agent memory sharing
- Memory export/import
- KittenTTS voice readback of memory events
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEM-01 | Complete Memory V2 with structured directives/concepts/signals and noise filtering (no login/upload/file-browse signals) | Cortex deletion plan (02-01), noise filter blacklist (02-02), schema already complete in `memories` table |
| MEM-02 | Real-time memory feed showing what Porter learned, forgot, or updated as it happens | `_emit_event()` SSE pattern is proven; need `recall:event` SSE type + compact feed UI rebuild |
| MEM-03 | Memory scoping with clear boundaries (global, project, agent, task-level) | `_mem_inject_for_dispatch()` already handles 3 scopes; needs privacy toggle + isolation enforcement |
| MEM-04 | FTS5 cross-session search — agents can search their own past sessions for prior work before asking users to repeat | `memories_fts` virtual table and `_mem_search()` already exist; need `/api/memory/session-search` endpoint + agent dispatch hook |
</phase_requirements>

---

## Summary

Phase 2 completes Porter Recall as the sole memory system by doing four things in sequence: (1) deleting all Cortex code and table, (2) fixing the noise filter so login/upload/browse never produce signals, (3) wiring proper injection with scope isolation and token budgeting, and (4) building the real-time memory feed UI.

The good news: the heavy infrastructure is already done. The `memories` table exists with the full V2 schema (all required columns including `superseded_by_id`, `last_used_at`, `use_count`, `source_type`). FTS5 virtual table `memories_fts` exists with insert/update/delete sync triggers. Core functions (`_mem_insert`, `_mem_search`, `_mem_promote`, `_mem_dismiss`, `_mem_inject_for_dispatch`, `_mem_extract_signals`) all exist. The Memory tab UI (`#memory-module`, `loadMemory()`, `/api/memory/*` endpoints) exists. The `_emit_event()` SSE broadcast pattern is proven and in use.

The work is: deleting ~30 dead `_cortex_*` functions plus the `cortex_memories` table (lines 1822-2468, 10395-10413), re-enabling `_mem_extract_signals` (one-line unblock at line 3049), adding the noise filter blacklist, enforcing scope isolation in inject and project privacy toggle, adding the compact real-time feed, and wiring up the writing style + interaction feedback systems.

**Primary recommendation:** Execute plans in strict order: 02-01 (Cortex removal) → 02-02 (noise filter) → 02-03 (injection) → 02-04 (scoping) → 02-05 (feed UI) → 02-06 (FTS5 session search) → 02-07 (writing styles) → 02-08 (feedback loop). Every plan uses /tmp/patch_*.py for porter.py modifications.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python stdlib sqlite3 | built-in | SQLite access, FTS5 queries | Porter is stdlib-only. No new deps. |
| SQLite FTS5 | built-in to SQLite | Full-text search on memories | Already in use via `memories_fts` virtual table |
| SSE (server-sent events) | built-in | Real-time push to browser | `_emit_event()` is the established push mechanism |
| Python threading | built-in | Background memory operations | Already used for all background tasks in porter.py |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `mlog.emit()` | porter built-in | Structured logging for memory lifecycle events | Every memory insert, promote, dismiss, inject |
| `_emit_event()` | porter built-in | SSE push for real-time feed | On every Recall event (insert/promote/dismiss) |
| `/tmp/patch_*.py` scripts | — | Patching porter.py (file too large for Edit tool) | All porter.py modifications |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Keyword-based signal extraction | LLM-based extraction | LLM extraction is more accurate but adds latency and token cost on every dispatch. Keyword approach is instant, deterministic, and free. |
| `len(text) // 4` token estimate | tiktoken | tiktoken requires pip install. len//4 is a good approximation for budget purposes (stdlib only). |
| In-memory badge counter | DB query on nav load | DB query is accurate; in-memory counter can drift. Query costs are low at this scale. |

**Installation:** No new packages required. Porter is stdlib-only.

---

## Architecture Patterns

### Recommended Project Structure
```
porter.py (monolith — all changes via /tmp/patch_*.py)
├── lines ~100:      DEFAULT_PREFERENCES — remove cortex_* keys
├── lines ~237:      commented-out _wf_register cortex — delete entirely
├── lines 1822-2468: _cortex_* function family — DELETE ALL
├── lines 2490-2545: _mem_consolidation_loop, _mem_consolidate_once — KEEP (V2)
├── lines 2961-3095: _mem_inject_for_dispatch, _mem_extract_signals — MODIFY
├── lines 3805-3975: _mem_* core functions — KEEP, minor updates
├── lines 10395-10413: cortex_memories table CREATE — DELETE
├── lines 18049+:   #memory-module HTML — REBUILD as compact feed
└── lines 21069+:   loadMemory() JS — REBUILD
```

### Pattern 1: Cortex Deletion via Patch Script
**What:** Python script at `/tmp/patch_*.py` that reads porter.py, excises cortex blocks, writes back.
**When to use:** Any removal of large contiguous code blocks in porter.py.
**Example:**
```python
# /tmp/patch_cortex_delete.py
porter_path = "/home/lobster/documents/porter/porter.py"
with open(porter_path) as f:
    src = f.read()

# Remove cortex_memories table creation block (lines 10394-10413 area)
# Use marker-based deletion, not line numbers (lines shift)
src = remove_block(src, "CREATE TABLE IF NOT EXISTS cortex_memories", next_sentinel="# v0.29.8")
# Remove _cortex_stem, _cortex_tokenize, ... through _cortex_consolidate_once
src = remove_block(src, "def _cortex_stem(word):", next_sentinel="def _mem_consolidation_loop()")
# Remove cortex_* prefs from DEFAULT_PREFERENCES
src = remove_lines_matching(src, '"cortex_enabled":', '"cortex_min_response_len":', ...)
with open(porter_path, "w") as f:
    f.write(src)
```

### Pattern 2: Noise Filter Blacklist (Inline Check)
**What:** A constant set of blocked source_category values checked before any `_mem_insert` call.
**When to use:** In `_mem_extract_signals()` and any call site that might produce signals.
**Example:**
```python
# Source: CONTEXT.md locked decisions
RECALL_NOISE_BLACKLIST = frozenset({
    # Auth actions
    "login", "logout", "password_change", "session_refresh", "registration",
    # File operations
    "file_upload", "file_download", "file_browse", "file_delete", "file_rename", "folder_create",
    # Navigation
    "tab_switch", "page_load", "accordion_toggle", "search_query",
    # System/health
    "health_check", "version_query", "boot_event", "capability_detect",
})

def _recall_should_extract(source_category: str) -> bool:
    """Return True only if this action type should produce Recall signals."""
    return source_category not in RECALL_NOISE_BLACKLIST
```

### Pattern 3: Frozen Snapshot Injection with Token Cap
**What:** Capture relevant memories once at session start. Enforce ~500 token budget.
**When to use:** In `_mem_inject_for_dispatch()`, called from `_build_context_suffix()`.
**Example:**
```python
def _estimate_tokens(text: str) -> int:
    """Fast approximation: 1 token ~= 4 chars (stdlib-safe)."""
    return max(1, len(text) // 4)

def _mem_inject_for_dispatch(message, persona_id='', project_id='', run_id=''):
    TOKEN_CAP = 500
    used_tokens = 0
    parts = []
    # Tier 1: directives always first
    for mem in _get_directives(persona_id, project_id):
        est = _estimate_tokens(mem['text'])
        if used_tokens + est > TOKEN_CAP:
            break
        parts.append(f"[DIRECTIVE] {mem['text']}")
        used_tokens += est
    # Tier 2: concepts by scope + recency
    for mem in _get_concepts(persona_id, project_id, message):
        est = _estimate_tokens(mem['text'])
        if used_tokens + est > TOKEN_CAP:
            break
        parts.append(f"[CONCEPT] {mem['text']}")
        used_tokens += est
    # Tier 3: episodes only if budget remains
    ...
```

### Pattern 4: SSE Real-Time Memory Feed
**What:** Emit `recall:event` SSE type on every Recall operation. Front-end listens and prepends to feed.
**When to use:** Called from `_mem_insert()`, `_mem_promote()`, `_mem_dismiss()` after DB write.
**Example:**
```python
# In _mem_insert():
_emit_event("recall:event", {
    "action": "learned",     # learned | promoted | dismissed | updated
    "text": text[:120],
    "memory_kind": memory_kind,
    "scope": scope,
    "scope_id": scope_id,
    "ts": time.time()
})
```

### Pattern 5: Scope Isolation Check
**What:** Before injecting memories into a dispatch, verify project privacy flag.
**When to use:** In `_mem_inject_for_dispatch()` when project_id is set.
**Example:**
```python
def _project_is_private(project_id: str) -> bool:
    """Check project privacy toggle — private projects block global injection."""
    try:
        conn = _db_conn()
        row = conn.execute(
            "SELECT metadata FROM projects WHERE id=?", (project_id,)
        ).fetchone()
        conn.close()
        if row:
            meta = json.loads(row['metadata'] or '{}')
            return bool(meta.get('private', False))
    except Exception as _e:
        mlog.emit("warn", "system", "exception.swallowed", str(_e),
                  extra={"exc_type": type(_e).__name__})
    return False
```

### Pattern 6: Inline "Recall noted" Indicator
**What:** After streaming a chat response that produced signals, append a styled line below the message.
**When to use:** In the chat response handler, after `_mem_extract_signals()` returns count > 0.
**Example (JS):**
```javascript
// After dispatch completes and extraction count > 0:
function _appendRecallIndicator(msgEl, count, preview) {
  var ind = document.createElement('div');
  ind.style.cssText = 'font-size:10px;color:var(--text3);padding:4px 0 0 0;display:flex;align-items:center;gap:4px';
  ind.innerHTML = '<span style="opacity:.6">✨</span> Recall noted: ' + escHtml(preview);
  msgEl.appendChild(ind);
}
```

### Anti-Patterns to Avoid
- **Line-number patching in porter.py:** Line numbers shift with every patch. Always use string-marker-based find/replace in patch scripts.
- **Calling `_emit_event()` inside DB transactions:** SSE emission is I/O; do it after `conn.commit()` to avoid holding locks.
- **Background consolidation loops for memory:** Explicitly locked out by CONTEXT.md. Memory consolidation is inline only.
- **Migrating cortex_memories data to memories:** Locked out — clean slate only.
- **Adding `except: pass` anywhere in new memory code:** All exception paths must call `mlog.emit()`.
- **Storing computed token counts in DB:** Estimate at injection time; storing wastes space and goes stale.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search over memories | Custom regex/LIKE scanner | SQLite FTS5 via `memories_fts` virtual table (already exists) | FTS5 handles tokenization, ranking, BM25; regex LIKE has no ranking and is O(n) |
| Real-time UI updates | Polling `/api/memory/stats` every N seconds | `_emit_event("recall:event", ...)` → SSE feed | Polling is wasteful; SSE is already wired and used for `bridge:chunk`, `cortex:update`, etc. |
| Token budget enforcement | LLM self-truncation | `len(text) // 4` estimate with hard cap | LLM doesn't truncate reliably; deterministic char-count cap is predictable |
| Scope isolation | Complex ACL system | Privacy flag in project `metadata` JSON column | Projects already have a metadata column; one boolean is sufficient for Phase 2 |
| Writing style storage | Separate table | `memories` table with `memory_kind='directive'` and `scope='agent'` | Writing rules ARE directives scoped to agent — same table, same injection path |
| Agent evolution animation | Custom SVG/WebGL | CSS keyframe animation triggered by JS class toggle | Porter uses CSS variables throughout; a respawn animation is a CSS `@keyframes` block |

**Key insight:** The FTS5 infrastructure, SSE broadcast, and the V2 memories table are all already live. This phase is mostly a cleanup + wiring task, not a build-from-scratch task.

---

## Common Pitfalls

### Pitfall 1: Cortex Table Still Created After Functions Deleted
**What goes wrong:** `_db_init()` includes the `cortex_memories` CREATE TABLE statement at line 10395, separate from the `_cortex_*` functions. Deleting functions without also removing the table CREATE means the table still gets created on startup, grep-zero check fails.
**Why it happens:** The table schema lives in `_db_init()` far from the functions (lines ~8500 away).
**How to avoid:** In 02-01, verify the patch deletes both: (a) `_cortex_*` functions block (lines 1822-2468) AND (b) the `cortex_memories` CREATE TABLE block (lines 10394-10413).
**Warning signs:** `grep -n "cortex_memories" porter.py` still returns results after the patch.

### Pitfall 2: `_cortex_extract_and_route` Still Called at Line 50985
**What goes wrong:** Even after deleting the function definition, a live call at line 50985 will cause a NameError crash during chat.
**Why it happens:** There is a second call path at line 50985 (`_cortex_extract_and_route(_cx_prompt, _cx_resp, backend=_cx_be)`) that is distinct from the background thread call at line 44611.
**How to avoid:** Patch script must grep for ALL call sites of `_cortex_extract_and_route` and replace them with `_mem_extract_signals()` (with noise filter) or simply remove the call.
**Warning signs:** Porter crashes with `NameError: name '_cortex_extract_and_route' is not defined` during chat dispatch.

### Pitfall 3: `_mem_extract_signals` Is Currently Hard-Disabled
**What goes wrong:** Line 3049 has `return 0  # DISABLED: Cortex removed in Phase 1, full deletion in Phase 2`. Re-enabling requires removing this early return AND adding the noise filter BEFORE the re-enable to avoid immediately polluting memories with noise.
**Why it happens:** Phase 1 disabled extraction via early return as a safety measure.
**How to avoid:** In 02-02, the patch must: (1) add `RECALL_NOISE_BLACKLIST` constant, (2) remove the `return 0` guard, (3) add blacklist check as the new first guard, in that order.
**Warning signs:** Memory tab shows login/upload signals immediately after restart.

### Pitfall 4: `cortex_consolidation` Workflow Still Registered at Line 57600
**What goes wrong:** Even though `_wf_register("cortex_consolidation")` is commented out at line 237, the workflow is still dynamically handled at line 57600 via `"cortex_consolidation": lambda: _cortex_consolidate_once()`. After deleting `_cortex_consolidate_once`, this lambda will crash if triggered.
**Why it happens:** The workflow is registered dynamically via a dict lookup, separate from `_wf_register`.
**How to avoid:** Patch 02-01 must remove the `cortex_consolidation` entry from the workflow dispatch dict at line 57600 and the adjacent config handling at lines 57657-57659.
**Warning signs:** POST to `/api/workflows/cortex_consolidation/trigger` causes a NameError.

### Pitfall 5: FTS5 Rebuild After Bulk Delete
**What goes wrong:** If cortex_memories content was migrated into memories table in a previous patch (v0.31.86 did a one-time migration), and you now DELETE those rows, the FTS5 index may not be consistent with the table. `_mem_search()` can return stale results or errors.
**Why it happens:** FTS5 uses content-table mode (`content='memories'`), which relies on triggers to stay in sync. Bulk deletes without going through the ORM bypass trigger mechanism if done directly with SQL `DELETE`.
**How to avoid:** After any bulk delete from `memories`, run `INSERT INTO memories_fts(memories_fts) VALUES('rebuild')` to force FTS5 index rebuild.
**Warning signs:** `_mem_search()` returns rows whose IDs no longer exist in the `memories` table.

### Pitfall 6: Token Cap Not Accounting for the Surrounding Block
**What goes wrong:** The `_build_context_suffix()` function already has a total budget split (soul 55%, rules 25%, memory 20%). The memory V2 block gets `memory_budget = int(total_budget * 0.20)` at lines 3104-3107. If the new injection function imposes its own 500-token cap without checking this budget, the two caps conflict.
**Why it happens:** `_mem_inject_for_dispatch()` and `_build_context_suffix()` each have independent budget logic.
**How to avoid:** In 02-03, update `_mem_inject_for_dispatch()` to accept an optional `token_cap` parameter. `_build_context_suffix()` passes `token_cap=memory_budget`. The 500-token default cap applies when called standalone.
**Warning signs:** Memory context block exceeds the surrounding budget, crowding out soul/rules content.

### Pitfall 7: Playwright Test for Memory Tab Must Stay Green
**What goes wrong:** The existing test at line 342-348 of `ui-regression.spec.js` checks `#memory-module .module-title` has text "Memory". If the Memory tab rebuild changes this selector or text, the test breaks.
**Why it happens:** Test is brittle to HTML structure changes.
**How to avoid:** The rebuild in 02-05 must preserve `#memory-module` as the container ID and `.module-title` with text "Memory" inside it. The inner content can change freely.
**Warning signs:** `npx playwright test` fails on "Memory tab has module-title 'Memory'" test.

---

## Code Examples

Verified patterns from current porter.py source:

### Current `_mem_insert()` Signature
```python
# Source: porter.py line 3805
def _mem_insert(memory_kind='signal', text='', scope='global', scope_id='',
                trust_tier='low', source_type='system', source_id='',
                source_category='', confidence=0.5, importance=5,
                keywords='', review_state='pending'):
```

### Current `_mem_search()` Using FTS5
```python
# Source: porter.py line 3847
def _mem_search(query, scope=None, scope_id=None, kind=None, limit=20):
    # Uses memories_fts virtual table (FTS5)
    # Returns list of dicts with id, preview, memory_kind, trust_tier, scope, scope_id, ...
```

### Current `_emit_event()` Broadcast Pattern
```python
# Source: porter.py line 47164
def _emit_event(event_type, data):
    """Broadcast an event to all connected SSE clients."""
    payload = json.dumps({"type": event_type, "data": data, "timestamp": time.time()})
    with _event_lock:
        for q in _event_queues:
            q.put(payload)
```

### `mlog.emit()` Structured Logging Pattern
```python
# Source: porter.py (established pattern throughout)
mlog.emit("info", "memory", "recall.learned",
          f"Recall learned: {text[:60]}", extra={"scope": scope, "kind": memory_kind})
mlog.emit("warn", "system", "exception.swallowed",
          f"Caught and continued: {_e}", extra={"exc_type": type(_e).__name__})
```

### SSE Event Listener Pattern (JS)
```javascript
// Source: porter.py (established pattern in JS event handler)
// Listen for recall:event type in the existing SSE stream
es.addEventListener('message', function(e) {
  var msg = JSON.parse(e.data);
  if (msg.type === 'recall:event') _recallFeedPrepend(msg.data);
});
```

### FTS5 Manual Rebuild (Safety Pattern)
```python
# Source: SQLite FTS5 documentation — use after bulk operations
conn.execute("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')")
conn.commit()
```

### Patch Script Structure (from lessons.md and CLAUDE.md)
```python
# /tmp/patch_XX_description.py
# Standard structure for all porter.py patches
import re

porter_path = "/home/lobster/documents/porter/porter.py"
with open(porter_path, "r") as f:
    src = f.read()

# Use string markers, NOT line numbers (lines shift)
MARKER_START = "def _cortex_stem(word):"
MARKER_END = "def _mem_consolidation_loop():"

start_idx = src.index(MARKER_START)
end_idx = src.index(MARKER_END)
src = src[:start_idx] + src[end_idx:]

with open(porter_path, "w") as f:
    f.write(src)

print("Patch applied. Verify with: grep -c 'cortex' porter.py")
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cortex: LLM-extracted facts, separate table | Memory V2: 4-layer model (directives/concepts/episodes/signals), unified `memories` table | v0.31.86 (2026-03-17) | Richer semantics, FTS5 search, scope enforcement |
| Background consolidation loop | Inline extraction (planned), decay in context_hygiene workflow | Phase 2 target | No background timers, no consolidation stalls |
| Cortex enabled via `cortex_enabled: True` preference | Cortex disabled via early-return guard (Phase 1) | Phase 1 complete | `_mem_extract_signals` returns 0; cortex code still present but dead |
| `_wf_register("cortex_consolidation")` active | Commented out at line 237 | Phase 1 complete | Consolidation loop disabled but code still live |
| "Concepts" tab label on agent detail | "Memory" tab label | Phase 2 target (locked decision) | Consistent naming; same underlying data |

**Deprecated/outdated:**
- `cortex_memories` table: still created at line 10395, still referenced in ~20 queries. Phase 2 deletes it.
- `_cortex_*` function family (lines 1822-2468): dead code (cortex_enabled is False). Phase 2 deletes all.
- `cortex_enabled`, `cortex_min_response_len`, `cortex_max_facts`, `cortex_inject_limit`, `cortex_consolidate_hours` preferences: still in DEFAULT_PREFERENCES at line 100. Phase 2 removes them.
- `"cortex_consolidation"` workflow lambda at line 57600: still callable via API. Phase 2 removes it.
- `#memory-dashboard` widget (current loadMemory() output): stat cards + review queue. Phase 2 rebuilds as real-time compact feed.

---

## Open Questions

1. **FTS5 session search scope (MEM-04)**
   - What we know: MEM-04 says "agents can search their own past sessions for prior work before asking users to repeat". The `agent_messages` table stores per-agent messages with `persona_id`. A separate FTS5 index over `agent_messages.content` or a query against `memories` with `memory_kind='episode'` would serve this.
   - What's unclear: Should 02-06 add a new FTS5 virtual table for `agent_messages`, or index session summaries into `memories` as episodes? The hermes-agent pattern mentioned in requirements suggests session summaries stored as searchable episodes.
   - Recommendation: Store session summaries in `memories` with `memory_kind='episode'` and use `memories_fts` for search. This avoids a second FTS5 table and keeps all searchable knowledge in one place. The `/api/memory/session-search` endpoint filters by `memory_kind='episode'` and `scope='agent'`.

2. **Agent identity rebuild trigger for writing styles (02-07)**
   - What we know: CONTEXT.md says "when Recall promotes enough signals for an agent, the agent's Who Is identity section gets rebuilt from accumulated knowledge." Porter agents have a SOUL.md file in their workspace directory.
   - What's unclear: What is "enough" — a count threshold, a confidence threshold, or a specific signal category? Who triggers the rebuild — an inline call after promotion, or a background hygiene check?
   - Recommendation: Define a threshold (e.g., 5+ style-category signals promoted for an agent). Trigger inline from `_mem_promote()` when the condition is met. The rebuild writes a new SOUL.md section. Respawn animation is a CSS class toggle (`persona-card.evolving`) with a `@keyframes` definition.

3. **Cross-project promotion detection (02-04)**
   - What we know: "If a pattern appears in 2+ projects, Recall suggests promoting to global." This requires comparing memory text across project scopes.
   - What's unclear: What constitutes "the same pattern" — exact text match, FTS5 similarity, keyword overlap?
   - Recommendation: Use FTS5 similarity: when a project-scoped memory is inserted, search `memories_fts` for similar text across other project scopes. If a match with score > threshold exists, emit a `recall:cross_project_match` suggestion event to the UI. Promote manually or auto-promote if confidence > 0.8. Keep this lightweight — FTS5 match is fast.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (Node.js) |
| Config file | `/home/lobster/documents/porter/tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "Memory"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | Memory tab loads without errors | smoke | `npx playwright test --grep "Memory tab"` | ✅ (line 342) |
| MEM-01 | Login does not produce signals in memories table | integration | `python3 /tmp/test_mem_noise.py` | ❌ Wave 0 |
| MEM-01 | File upload does not produce signals | integration | `python3 /tmp/test_mem_noise.py` | ❌ Wave 0 |
| MEM-01 | `grep cortex porter.py` returns zero after 02-01 | smoke | `python3 /tmp/test_grep_zero.py` | ❌ Wave 0 |
| MEM-02 | SSE `recall:event` fires when memory is inserted | integration | `python3 /tmp/test_recall_sse.py` | ❌ Wave 0 |
| MEM-02 | Memory feed UI shows new item after SSE event | e2e | `npx playwright test --grep "recall feed"` | ❌ Wave 0 |
| MEM-03 | Project-A memory not visible in Project-B inject | integration | `python3 /tmp/test_scope_isolation.py` | ❌ Wave 0 |
| MEM-03 | Private project blocks global memory injection | integration | `python3 /tmp/test_scope_isolation.py` | ❌ Wave 0 |
| MEM-04 | `/api/memory/session-search` returns episode results | integration | `python3 /tmp/test_session_search.py` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/tests && npx playwright test` (35 tests, all green)
- **Per wave merge:** Full 35-test Playwright suite + Python integration tests
- **Phase gate:** Full suite green + Python integration tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `/tmp/test_mem_noise.py` — imports porter functions, calls login + file upload, asserts zero new signals in `memories` table — covers MEM-01
- [ ] `/tmp/test_grep_zero.py` — runs `grep -c "cortex" porter.py`, asserts count is 0 (or only in release notes) — covers MEM-01
- [ ] `/tmp/test_recall_sse.py` — calls `_mem_insert()` directly, checks `_event_queues` received `recall:event` — covers MEM-02
- [ ] `/tmp/test_scope_isolation.py` — inserts project-scoped memory, calls `_mem_inject_for_dispatch()` with different project_id, asserts memory absent — covers MEM-03
- [ ] `/tmp/test_session_search.py` — inserts episode memory, calls `/api/memory/session-search?q=test`, asserts result returned — covers MEM-04

Note: Python integration tests at `/tmp/` are not committed (porter.py is too large for git diff tracking; tests run in-process against live porter).

---

## Sources

### Primary (HIGH confidence)
- `/home/lobster/documents/porter/porter.py` — direct code inspection, all line references verified at research time
- `/home/lobster/documents/porter/research/porter-memory-v2.md` — original design doc; superseded by CONTEXT.md decisions but confirms schema intent
- `/home/lobster/documents/porter/.planning/phases/02-memory-v2/02-CONTEXT.md` — locked user decisions, canonical for this phase

### Secondary (MEDIUM confidence)
- `/home/lobster/documents/porter/.planning/codebase/ARCHITECTURE.md` — architecture analysis (2026-03-20)
- `/home/lobster/documents/porter/.planning/codebase/CONCERNS.md` — tech debt audit, fragile areas (2026-03-20)
- `/home/lobster/documents/porter/.planning/codebase/CONVENTIONS.md` — coding conventions (2026-03-20)
- `/home/lobster/documents/porter/tests/ui-regression.spec.js` — existing test coverage for Memory tab

### Tertiary (LOW confidence)
- None — all research based on direct code inspection and locked decisions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, verified in existing code
- Architecture: HIGH — all function names and line regions verified against actual porter.py
- Pitfalls: HIGH — each pitfall traced to a specific line number or code path verified in source
- Validation: MEDIUM — test commands verified (Playwright works), but Wave 0 test scripts are new and untested

**Research date:** 2026-03-20
**Valid until:** 2026-04-19 (30 days — monolith is stable, changes are additive)
