# Phase 2: Memory V2 - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the Memory V2 system ("Porter Recall") as the sole memory system. Delete all Cortex code, implement noise filtering, build the real-time memory feed, wire memory injection at agent dispatch, enforce scope isolation, integrate memory with chat, and lay the foundation for agent evolution through writing styles and interaction feedback. The system must be elegant, searchable without slowing Porter down, and seamlessly integrated with chat.

</domain>

<decisions>
## Implementation Decisions

### Cortex Deletion
- **Hard delete everything** — all ~30 cortex_* functions, cortex_memories table, consolidation loop, batch extract loop
- **Clean slate** — do NOT migrate old cortex_memories data into V2. Porter Recall starts fresh
- **Full V2 schema in one shot** — add all remaining columns from design doc: superseded_by_id, last_used_at, use_count, source_type
- **Inline processing only** — no background loops for memory. Extract signals during chat response, promote/dismiss in UI or via Porter auto-management. No _mem_consolidation_loop, no timer-based batch jobs

### Brand Identity
- **System name: Porter Recall** — the branded memory system, like Porter Bridge for model routing
- **UI labels stay "Memory"** — both the global nav tab and agent detail tab say "Memory". Porter Recall is the engine under the hood, not a user-facing vocabulary change
- Agent detail tab renamed from "Concepts" → "Memory" for consistency

### Signal Noise Filtering
- **Blacklist approach** — Porter learns from everything EXCEPT blocked action types
- **Block list (never produce signals):**
  - Auth actions: login, logout, password change, session refresh, registration
  - File operations: upload, download, browse, delete, rename, create folder
  - Navigation: tab switches, page loads, accordion toggles, search queries
  - System/health: health checks, version queries, boot events, capability detection
- **Inline indicator** — when Porter learns something from a chat response, a subtle line appears below the message: "✨ Recall noted: [concept]". Part of the message but visually distinct

### Memory Feed UX
- **Global "Memory" tab** — shows all Recall events across all agents and projects. Filterable by scope (global/project/agent)
- **Agent "Memory" tab** — same data, filtered to that agent's memories only. Microscope view
- **Compact row format** — icon + memory text + scope badge + timestamp. One line per event. Dense, scannable, like a git log
- **Badge count on nav** — number badge on Memory nav item shows new memories since last visit. Same pattern as unread messages
- **Porter auto-manages** — Porter handles promotion, dismissal, and consolidation autonomously. User can override (dismiss something Porter kept, promote something Porter missed)
- **Preference toggle** — "Auto-manage memory" (on by default) vs "Review everything" (manual approval mode)

### Memory Scopes
- **Three scopes for Phase 2:** global, project, agent
- Squad and run scopes deferred to future phases
- **Global memories** are always injected (user preferences, directives) unless project is private
- **Project memories** are isolated — Project A cannot see Project B's memories
- **Agent memories** stay with that agent (writing style, personality, learned behaviors)
- **Per-project privacy toggle** — "Private project" means memories stay fully isolated (no global flow in, no promotion out). Default: global flows in, learnings can be promoted out. Critical for sensitive projects (medical, financial, trading strategies)
- **Auto-suggest cross-project promotion** — if a pattern appears in 2+ projects, Recall suggests promoting to global: "I noticed you prefer bullet points in multiple projects — make this global?"

### Memory Injection at Dispatch
- **Frozen snapshot** — capture relevant memories once when session starts. New memories take effect next session. No mid-session updates
- **Tiered priority selection** — inject in order: directives first (always), then concepts relevant to scope, then recent episodes if space allows
- **~500 token cap** — relevance scored by scope match + recency. Stay under budget to leave room for actual task context

### Chat Integration
- **Natural language memory queries** — user types "what do you remember about my preferences?" and Porter searches Recall, responds with relevant memories
- **Remember + forget via chat** — "Remember that I prefer dark mode" → creates directive. "Forget that old project name" → dismisses memory. Both directions supported
- All chat memory commands are syntactic sugar for Recall operations (same as doing it in the Memory tab)

### Agent Writing Styles (02-07)
- **Role-based defaults + Recall learning** — each agent type (writer, developer, researcher) gets a default voice profile. Over time, Recall adjusts style based on user corrections
- **Shared anti-pattern block list** — all agents avoid generic AI filler: "I'd be happy to", "Let me help you with that", "Great question!", etc. Individual agents can override
- **Agent evolution** — when Recall promotes enough signals for an agent, the agent's "Who Is" identity section gets rebuilt from accumulated knowledge. The pixel character does a respawn/transformation animation. Agents literally grow and evolve like Pokemon

### Interaction Feedback Loop (02-08)
- **Implicit signals** — track: did user accept the suggestion? Did they correct it? Did they ask a follow-up vs move on? No explicit thumbs up/down needed
- **Both agent + global scope** — some feedback is agent-specific (tone, format for this agent), some is global (user preference for brevity). Recall decides scope automatically
- No model training — this is outcome-aware context injection, not RL. Recall stores what worked and injects it as context in future runs

### Memory Persistence
- **Plain text with metadata** — memory content is plain text ("User prefers bullet points over paragraphs"). Metadata (kind, scope, trust, timestamps) in separate DB columns
- **FTS5 indexes text + scope metadata** — search indexes: memory text, scope labels, agent names. User can search "project Alpha preferences" and find project-scoped memories for Alpha

### Claude's Discretion
- FTS5 index rebuild strategy and performance optimization
- Exact token counting approach for the 500-token injection cap
- Signal extraction prompt design (what prompt extracts memories from chat responses)
- Respawn animation design for agent evolution
- Anti-pattern block list contents (specific phrases to avoid)
- Memory decay/cleanup strategy for stale signals
- Inline indicator visual design (the "✨ Recall noted" line)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Memory V2 Design
- `research/porter-memory-v2.md` — Memory V2 design doc: 4-layer model (directives/concepts/episodes/signals), data model fields, lifecycle (capture→distill→review→inject→audit), injection rules, UI model
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions: Cortex disabled with early-return guards, admin system deleted, role simplification

### Codebase Analysis
- `.planning/codebase/ARCHITECTURE.md` — Current system architecture, layers, data flow
- `.planning/codebase/CONVENTIONS.md` — Coding conventions, error handling patterns
- `.planning/codebase/CONCERNS.md` — Tech debt, fragile areas (including memory system)

### Project Context
- `.planning/PROJECT.md` — Vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — MEM-01 through MEM-04 requirements
- `CLAUDE.md` — Project rules, release governance, porter.py patching approach (must use /tmp/patch_*.py scripts)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `porter.py` unified `memories` table (line 731) — already has memory_kind, trust_tier, scope, status, review_state columns
- `porter.py` `_mem_*` function family — _mem_insert, _mem_search (FTS5), _mem_promote, _mem_dismiss, _mem_record_injection, _mem_stats, _mem_get, _mem_update_status
- `porter.py` `_mem_inject_for_dispatch()` (line 2961) — existing injection function, needs tiered priority + token cap
- `porter.py` `_mem_extract_signals()` (line 3046) — existing signal extraction, needs noise filter integration
- `porter.py` `directives` table (line 650) — V1 directives table, bridge functions exist (_directive_*)
- FTS5 already available in SQLite — `_mem_search()` uses it

### Established Patterns
- `mlog.emit()` for structured logging — use for memory lifecycle events
- `_emit_event()` for SSE push to frontend — use for real-time memory feed updates
- CSS variables with `var(--accent)` for new UI elements
- Python patch scripts at `/tmp/patch_*.py` for porter.py modifications (file too large for Edit tool)

### Integration Points
- `porter.py` cortex_* functions (lines 1822-2468) — TO BE DELETED
- `porter.py` DEFAULT_PREFERENCES `cortex_enabled: False` (line 100) — TO BE DELETED with all cortex prefs
- `porter.py` _cortex_extract_and_route() called during chat response — replace with _mem_extract_signals() + noise filter
- Agent detail Memory tab (currently "Concepts") — refactor to show filtered Recall feed
- Global Memory nav tab — rebuild as Recall feed with compact rows
- Chat response handler — add inline "✨ Recall noted" indicator
- Agent dispatch path — wire _mem_inject_for_dispatch() with frozen snapshot + tiered priority

### Key Metrics
- ~30 cortex_* functions to delete
- cortex_memories table to DROP
- 2 background loops to remove (_cortex_batch_extract, _cortex_consolidate_once + timers)
- Existing memories table with V2 schema (needs ~4 new columns)
- 3 scopes to implement (global, project, agent)

</code_context>

<specifics>
## Specific Ideas

- "Just like we created Porter Bridge for model switching, we need our own trademarked memory system" — Porter Recall is the branded memory system
- "Memory needs to be elegant, not sloppy" — clean, minimal UI. No cluttered memory dumps
- "We need to cut out all the noise" — aggressive blacklist filtering
- "Agents should evolve... almost like Pokemon" — Recall promotions trigger agent identity rebuild with respawn animation
- "Some projects may be highly personal information like medical or financial records, or a trading strategy" — per-project privacy toggle is critical for trust
- "Interactions need to be minimized... run/managed by Porter with the user overriding" — Porter Recall is autonomous by default, user opts into manual control
- "Memory should be at the project level, as well as searchable globally" — dual visibility: project-scoped storage + global search capability
- "As Porter learns things, agent .md files need to be rebuilt and the Who Is updated" — identity evolution driven by accumulated Recall knowledge

</specifics>

<deferred>
## Deferred Ideas

- Squad and run memory scopes — deferred to Phase 4+ when squads and ephemeral agents ship
- PorterHQ fleet-wide memory control surface (contradiction detector, concept promotion queue, noisy extractor detection) — future SaaS admin feature
- Memory attribution in dispatch (tracking which memories influenced which responses) — audit feature, Phase 6 transparency
- Cross-agent memory sharing (one agent's learnings available to another) — requires careful trust model, future phase
- Memory export/import — backup and restore Recall data
- KittenTTS voice readback of memory events — Phase 5+ (05-07)

</deferred>

---

*Phase: 02-memory-v2*
*Context gathered: 2026-03-20*
