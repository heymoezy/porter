# Hermes Agent Patterns — Steal Sheet

**Source:** github.com/NousResearch/hermes-agent (MIT)
**Evaluated:** 2026-03-20
**Purpose:** Patterns to fold into Porter's roadmap

---

## Pattern 1: Conservative Per-Turn Smart Routing

**What:** Before calling the LLM, a fast heuristic decides cheap vs strong model. If message is <160 chars, <28 words, no code/URLs/backticks → route to cheap model. Else → strong.

**Why it matters:** Porter's `_smart_route()` uses keyword heuristics + benchmark scoring, but it runs the full pipeline every time. A fast pre-filter would skip the expensive scoring for obviously simple messages.

**Where it fits:** Phase 4, plan 04-02 (AI router service). Add as the first step in `services/ai-router.ts` — before any backend scoring, run the cheap/strong gate.

**Implementation sketch:**
```typescript
function shouldRouteCheap(message: string): boolean {
  if (message.length > 160 || message.split(/\s+/).length > 28) return false;
  if (/```|`|https?:\/\/|debug|implement|refactor|test|tool/i.test(message)) return false;
  return true;
}
```

---

## Pattern 2: Dynamic Tool Schema Rebuilding

**What:** Before sending tool definitions to the model, strip tools that reference unavailable backends. If Ollama is offline, remove Ollama-specific tools from the schema. Prevents hallucinated tool calls.

**Where it fits:** Phase 4, plan 04-02 (AI router service). When building the tool array for dispatch, cross-reference `PROVIDER_REGISTRY` probe results — only include tools whose required backends are live.

---

## Pattern 3: Subagent Depth Limits + Tool Restriction

**What:** When a parent agent spawns a child:
- Hard depth limit: 2 (parent → child only, no grandchildren)
- Max concurrency: 3 children
- Blocked tools on children: no `delegate_task`, no `send_message`, no `memory`, no `execute_code`
- Children can receive different backend credentials than parent

**Where it fits:** Phase 4, plan 04-05 (Ephemeral agents). Enforce at the agent dispatch layer — workers cannot spawn further workers, cannot modify memory, cannot message users directly. Parent picks the backend for each child.

---

## Pattern 4: Frozen Memory Snapshot

**What:** Memory is captured once at session/dispatch start, injected into the system prompt, and never mutated mid-session. Writes go to disk/DB immediately but only take effect next session. This preserves prompt cache (the prefix stays stable).

**Where it fits:** Phase 2, plan 02-03 (Memory injection). This is the exact implementation strategy for injecting directives/concepts/episodes into agent dispatch context.

**Trade-off:** Agent doesn't see its own new memories within the same session. Hermes considers this acceptable — and it's correct for Porter too, since agent runs are typically short.

---

## Pattern 5: FTS5 Cross-Session Search

**What:** SQLite `messages_fts` virtual table synced via triggers. Agents can search their own past sessions with boolean operators, phrase matching, and role/source filters. 1-message context window around matches.

**Where it fits:** Phase 2, new requirement + plan. This is the "what have I done before" capability that MEM-01 needs. Agent asks "have I written a PR description for this repo before?" → FTS5 search → yes, here's what I said.

**New requirement:** MEM-04 or fold into MEM-01 as a sub-requirement.

---

## Pattern 6: Context Compressor with Tool-Call Repair

**What:** When prompt tokens hit 50% of context limit:
1. Protect first 3 + last 4 turns
2. Summarize the middle into a handoff paragraph
3. Repair orphaned tool-call/result pairs at compression boundaries (critical — APIs reject unpaired tool calls)

**Where it fits:** Phase 4, plan 04-02 (AI router service) or Phase 6. Long agent sessions need this. When an autonomous agent runs 50+ turns, naive truncation breaks. The tool-call boundary repair is the key insight.

---

## Pattern 7: Self-Improving Skills

**What:** After a successful task, the agent can create a SKILL.md document with YAML frontmatter (name, required tools, platform targeting). Skills are progressively loaded: tier 1 = name only, tier 2 = summary, tier 3 = full content. Only skills whose required toolsets are active get injected.

**Where it fits:** Phase 5, plan 05-02 (Agent proposal engine). Workers that successfully complete a task type could generate a skill doc, making them better at that task next time. Progressive loading keeps token budget under control.

---

## Priority Order for Implementation

1. **Frozen memory snapshot** (Phase 2) — simplest, most impactful, directly serves MEM-01
2. **Per-turn smart routing** (Phase 4) — small, self-contained, immediate cost savings
3. **Dynamic tool schema rebuild** (Phase 4) — prevents a whole class of hallucination bugs
4. **Subagent depth limits** (Phase 4) — safety rail, must-have for autonomous agents
5. **FTS5 session search** (Phase 2) — high value but more work
6. **Context compressor** (Phase 4/6) — needed for long autonomous sessions
7. **Self-improving skills** (Phase 5) — powerful but complex, last priority

---

*All patterns from MIT-licensed code. No framework dependencies. Pure Python/TypeScript portable.*
