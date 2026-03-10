# Porter Memory V2

## Goal

Replace the current mixed "Cortex / Memory / directives / concepts" model with one clear system that serves two audiences:

- Porter, who needs usable context at orchestration time
- PorterHQ, which needs debuggable truth about what the system believed and why

## Product Model

Memory should be expressed in four operator-facing layers:

1. Directives
- Stable operating rules Porter should follow
- Example: "Moe wants conclusions first and detail second."

2. Concepts
- Durable truths about the product, user, or strategy
- Example: "Porter is a SaaS orchestrator, not a worker."

3. Episodes
- Time-bound summaries of what happened in a run, project, or session
- Useful for replay, audits, and later distillation

4. Signals
- Low-trust extracted observations waiting to be promoted, merged, or discarded

The current system stores most of these in one table. That is acceptable internally, but the UI and lifecycle need to treat them differently.

## Data Model

Keep `cortex_memories` as the base store for now, but treat it as a normalized memory ledger with stronger semantics:

- `memory_kind`: `directive | concept | episode | signal`
- `trust_tier`: `low | medium | high`
- `scope`: `global | project | squad | agent | run`
- `status`: `active | archived | superseded | dismissed`
- `source_type`: dispatch, session, human, consolidation, operator override
- `review_state`: `pending | accepted | rejected`
- `superseded_by_id`
- `last_used_at`
- `use_count`

Short term:
- derive `memory_kind` in application code from existing rows
- preserve old schema compatibility

Long term:
- add the fields explicitly and backfill

## Lifecycle

1. Capture
- Extract low-trust signals from responses, runs, and operator actions

2. Distill
- Merge repeated signals into concepts or directives

3. Review
- Let Porter or the operator dismiss bad memories
- Let high-confidence concepts/directives become active

4. Inject
- Inject only the smallest useful set into a run
- Prefer directives first, concepts second, episodes rarely

5. Audit
- Every memory used in a run should be attributable later

## Injection Rules

Porter should not see a giant undifferentiated memory blob.

Recommended injection order:

1. High-trust directives
2. High-trust concepts relevant to the task scope
3. Recent episode summaries only when needed
4. Never inject low-trust signals directly unless running a review pass

## UI Model

Agent detail should use:

- `Chat`
- `Activity`
- `Skills`
- `Concepts`
- `Config`

The `Concepts` tab should show:

1. Operating Directives
- High-trust rules

2. Strategic Concepts
- Durable beliefs about user/product/project context

3. Recent Episodes
- Last relevant summaries, collapsed by default

4. Needs Review
- Low-trust or contradictory items waiting for approval or dismissal

The old word `Memory` is too vague. `Concepts` is better for the product surface.

## PorterHQ View

PorterHQ eventually needs a fleet-wide memory control surface:

- contradiction detector
- concept promotion queue
- noisy extractor detection
- tenant-specific memory anomalies
- top dismissed facts by tenant and version

That implies all memory writes and promotions must be logged as first-class events.

## Implementation Order

1. Finish UI rename and grouping in the agent detail Concepts tab
2. Add `memory_kind` derivation helpers
3. Track memory-use attribution on dispatch
4. Add review queue for low-trust signals
5. Add PorterHQ operator view for concept health and contradictions
