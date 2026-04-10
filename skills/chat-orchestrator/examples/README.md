# Chat Orchestrator — Example Output Shapes

Use these as patterns for strong chat-orchestration deliverables.

## Example 1 — Vague request triage

**Input:**
Can you help me figure out what to do with all of this?

**Good output shape:**
- distilled goal
- known constraints
- 2 to 4 concrete next actions
- single blocker or clarifying question if needed

## Example 2 — Multi-part execution sequence

**Input:**
We need to review the proposal, update the numbers, and send a reply today.

**Good output shape:**
- priority order with rationale
- what can happen in parallel
- draft reply strategy or actual reply
- explicit owner or handoff points

## Example 3 — Long thread compression

**Input:**
Summarize this messy discussion and tell me what should happen next.

**Good output shape:**
- goal summary
- decisions made
- unresolved questions
- recommended next move
- concise message the user can send onward

## Example 4 — Route versus answer decision

**Input:**
Should we answer this ourselves or bring in a specialist?

**Good output shape:**
- what requires specialist depth
- what can be handled immediately in chat
- recommended split of work
- handoff brief if delegation is needed

## Example 5 — Blocking clarification

**Input:**
Draft the response, but I haven't decided whether we're saying yes yet.

**Good output shape:**
- identified ambiguity
- single sharp question or conditional reply options
- path forward after decision
