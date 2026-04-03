# Phase 38 Research: Adaptive Agent Context

## Source: Tasklet.ai Analysis (2026-04-03)

Tasklet.ai (by Firebase co-founder Andrew Lee, backed by USV + Lightspeed) is an agent automation platform built on a two-tier architecture: persistent meta-agents that curate context, and ephemeral sub-agents that execute tasks. Key findings relevant to Porter:

### 1. SQL-as-Memory (agents query their own DB)

Tasklet moved from JSON blobs in system prompts to structured SQL databases. LLMs write excellent SQL naturally, so agents query their own history on demand rather than receiving pre-injected context blobs.

**Porter parallel:** We already have `concepts` + `directives` tables and `memory-injection.ts` builds a 5-tier context string. But it's bulk-injected — all active directives go in regardless of task relevance. Opportunity: let agents query contextually.

### 2. Just-in-Time Instructions (not bulk injection)

Tasklet found that pre-loading all instructions creates contradictions and confusion at scale. They shifted to generating instructions on-demand per task type.

**Porter parallel:** `memory-injection.ts` injects all active directives ordered by priority. With 17+ directives today, this works. At 50+ it won't. We need selective injection based on task context, active skills, and conversation history.

### 3. Deep Execution (50+ turns)

Most agent platforms do 3-10 steps. Tasklet routinely runs 50+ turn sequences by:
- Hiding tool call results from context to save tokens
- LLM-based text compaction mid-conversation
- Sub-agent isolation with tailored history segments

**Porter parallel:** `session-registry.ts` already tracks context pressure and auto-rotates at 95%. But rotation loses context. We need mid-session compression — summarize older turns while keeping recent ones verbatim.

### 4. Skills > MCP (text instructions outperform structured tools)

Their biggest finding: plain text instructions about HTTP APIs outperform structured MCP tool interfaces. Skills = "lengthy, possibly multi-file text instructions."

**Porter parallel:** Validates our `template_skills` / `persona_skills` + skill pack approach. Phase 33's `selectSkills()` already does runtime selection. Phase 38 extends this by making context injection smarter.

## Current Architecture (relevant files)

| File | Lines | Role |
|------|-------|------|
| `backend/src/services/memory-injection.ts` | 203 | 5-tier token budget pipeline: identity → directives → project notes → agent notes → FTS search |
| `backend/src/services/skill-selector.ts` | 247 | Pure-function scoring, top-3 selection, prompt block generation |
| `backend/src/services/bridge/routing-engine.ts` | 950 | Dispatch orchestration, fallback chains, dispatch logging, XP/session/skills side effects |
| `backend/src/services/stream-service.ts` | 67 | Thin wrapper: chat → Bridge routing |
| `backend/src/services/session-registry.ts` | 318 | Per-session token tracking, context pressure, auto-rotation at 95% |
| `backend/src/services/bridge/usage-collector.ts` | 923 | Real usage polling every 30s across all gateways |

## Key Design Constraints

1. **Fire-and-forget pattern** — all logging/side-effects are async, never block dispatch
2. **Token budget cascading** — memory injection uses 4-char-per-token heuristic, tiers cascade spare tokens down
3. **Default budget: 2000 tokens** — overridable per agent via `config.memory_token_budget`
4. **Skill selection is cheap** — pure function scoring, no LLM calls
5. **Context pressure at 95%** triggers session rotation (hard cutoff, loses context)
6. **`__DISPATCH_META__` token** threads dispatch_id from routing-engine through SSE to frontend

## Implementation Strategy

Three plans targeting four capabilities:

- **Plan 38-01**: Context-aware directive injection (ACX-01, ACX-02) — modify `memory-injection.ts` to score directives against task text using the same keyword-matching approach as `skill-selector.ts`
- **Plan 38-02**: Tool output compression + deep execution (ACX-03, ACX-04) — add summarization middleware in the dispatch pipeline that compresses verbose tool results and older conversation turns
- **Plan 38-03**: Context pressure observability (ACX-05) — extend `bridge_dispatch_log` with compression metrics and build admin visibility

## Risk Assessment

- **ACX-01/02 (directive scoring):** Low risk. Additive change to existing `buildMemoryContext()`. Fallback: inject all directives if scoring fails.
- **ACX-03/04 (compression):** Medium risk. Requires LLM call for summarization, which adds latency. Mitigation: only compress when context pressure > 70%, use cheapest model (Haiku).
- **ACX-05 (observability):** Low risk. Schema addition + admin UI, no behavioral changes.
