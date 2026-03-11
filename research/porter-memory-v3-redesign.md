# Porter Memory V3

## Decision

Porter should not use "chat extraction" as the primary memory mechanism.

The current Cortex-centered design overfits to the mechanics of LLM chat instead of the product Porter is becoming. Porter is not a journaling bot and not a self-improving autobiographical companion. Porter is a project-and-agent orchestrator.

That means Porter needs a persistent state system, not a generalized fact vacuum.

## What Went Wrong

The current memory layer drifted because it mixed three different concerns:

1. Building Porter
- internal implementation notes
- repo-specific learnings
- session flushes and local dev artifacts

2. Operating Porter
- runtime diagnostics
- bridge behavior
- bugs, failures, retries, incidents

3. Using Porter as a product
- user directives
- project goals
- worker responsibilities
- project state
- approvals, decisions, and constraints

Those concerns should never have shared one memory plane.

The current Cortex path is especially problematic because it:
- extracts from nearly every response
- stores low-trust summaries as if they are product memory
- promotes internal build activity into the same system as user/project truth
- injects recalled facts back into prompts with limited product semantics
- creates a debugging burden and a context-poisoning risk

This is the wrong foundation for a SaaS orchestrator.

## Product Truth

Porter needs memory for one purpose:

To keep agents, projects, and decisions aligned across time without losing structure.

That breaks into five concrete memory classes.

## The Five Memory Classes

### 1. Identity Memory

Who the tenant and system are.

Examples:
- who Porter is
- tenant identity
- org-wide defaults
- approved operating mode
- allowed tools/runtimes

Properties:
- durable
- rarely changed
- high trust
- mostly system-managed

### 2. Directive Memory

Stable rules Porter should follow.

Examples:
- user prefers concise answers
- Porter orchestrates; workers execute
- model choice must always be visible
- all worker creation requires Porter-guided setup

Properties:
- durable
- explicit
- reviewed
- human-editable
- directly injectable

### 3. Project Memory

The persistent state of a project.

Examples:
- project goal
- success bar
- open risks
- key decisions
- current phase
- assigned workers
- constraints
- approved deliverables

Properties:
- durable
- structured
- highest-value product memory
- shared across Porter and relevant workers

This should be the center of the system.

### 4. Agent Memory

The durable state of a worker or Porter-managed role.

Examples:
- role
- scope boundaries
- active responsibilities
- preferred handoff format
- current owner/project bindings
- trusted capabilities
- known weaknesses or cautions

Properties:
- durable
- scoped
- partly system-managed
- partly Porter-curated

### 5. Run Memory

Temporary state for a specific thread, task, or execution lane.

Examples:
- current chat thread
- current creation flow
- active working notes
- temporary task state
- recent tool outputs

Properties:
- ephemeral
- compacted aggressively
- not directly promoted to durable memory without review

This replaces the old tendency to treat transcripts as memory.

## What Should Not Be Memory

These should not enter durable memory automatically:
- raw chat transcripts
- generic session summaries
- internal repo/build chatter
- model/version/runtime environment trivia
- speculative "facts" inferred from one conversation
- temporary setup wizard answers unless promoted into a structured entity

These belong in:
- chat history
- logs
- traces
- project records
- explicit notes

## Recommended Architecture

Porter memory should become a layered state model:

1. Thread State
- conversation-local
- creation flows
- temporary notes
- attachments
- compacted or discarded

2. Entity State
- persistent records for tenant, project, agent, worker
- structured first
- editable and reviewable

3. Retrieval Memory
- optional searchable historical notes
- lower priority than entity state
- for long-tail recall, not primary truth

4. Audit/Trace
- what happened
- who changed memory
- why
- when
- what was injected into a run

The order matters. Porter should read structured entity state first, not "recalled facts."

## Replace Cortex With A State Engine

Recommendation:

- Retire `Cortex` as a user-facing concept.
- Keep only the useful internals:
  - scoped retrieval
  - deduplication ideas
  - memory-use attribution
  - logging of promotions/edits
- Replace the rest with a new internal subsystem:
  - `State Engine`

The State Engine owns:
- entity records
- scoped directives
- project state
- worker state
- pending proposals
- memory review queue
- optional archival search

Cortex can survive only as an internal migration label if needed, but it should not survive as the product concept.

## Persistence Model

Memory must persist always, but not everything should persist forever in the same way.

Recommended retention:

- Identity memory: permanent until changed
- Directive memory: permanent until changed or dismissed
- Project memory: permanent while project exists; archived on close
- Agent memory: permanent while agent exists; archived on retirement
- Run memory: expires or compacts aggressively
- Audit trail: append-only retention with export/delete controls

This gives Porter continuity without turning every chat into sludge.

## Data Model

Porter should move toward explicit entities instead of one mixed fact table.

### A. directives

- id
- tenant_id
- scope_type: global | project | agent
- scope_id
- text
- status: active | dismissed | superseded
- source: human | porter | system
- confidence
- created_at
- updated_at

### B. projects

Existing project table should grow or gain a state companion:

- goal
- success_bar
- current_phase
- status
- priorities
- constraints
- approved_decisions_json
- risks_json
- open_questions_json
- last_reviewed_at

### C. agents

Existing persona/agent records should gain or normalize:

- orchestrator_only
- managed_by_porter
- lifecycle: temporary | persistent | retired
- scope_summary
- handoff_contract
- capabilities_public
- capabilities_hidden
- current_assignments_json

### D. project_notes

Structured but lighter-weight than full project rows:

- id
- project_id
- note_kind: decision | risk | handoff | summary | milestone | blocker
- body
- status
- source
- created_by
- created_at

### E. agent_notes

- id
- agent_id
- note_kind: boundary | performance | preference | caution | handoff
- body
- status
- source
- created_at

### F. archival_memory

Optional long-tail searchable memory:

- id
- scope_type
- scope_id
- text
- tags
- trust
- source
- created_at
- archived_at

This is where vector search or graph search belongs later, if needed.

Not at the center.

## How Memory Gets Written

Memory writes should come from explicit system events, not generic transcript mining.

### Write Sources We Want

1. Human-confirmed updates
- "Remember this preference"
- project setup answers
- approved worker creation
- approved project decisions

2. Structured Porter actions
- creating a project
- changing project phase
- assigning a worker
- marking a risk
- approving a handoff

3. Reviewable proposals
- Porter suggests a directive or decision
- stays pending until accepted

### Write Sources We Do Not Want By Default

- every assistant response
- every worker output
- every chat session
- every session summary

## How Memory Gets Read

Porter should read memory in this order:

1. Identity
2. Directives
3. Project state
4. Agent state
5. Recent structured notes
6. Archival search only if needed

This is the same general direction Letta takes with always-visible memory blocks and then separate archival memory, and it matches LangGraph/OpenAI guidance to separate short-term thread state from longer-lived state stores rather than treating all history as one blob.

## Memory Injection Policy

Inject the smallest structured context that can keep the run on track.

### Porter orchestration runs

Inject:
- global directives
- relevant project state
- relevant worker roster summary
- active decisions/risks

Do not inject:
- long historical episodes
- generic old chat facts

### Worker execution runs

Inject:
- worker role/boundary
- assigned objective
- project constraints
- relevant handoff notes

Do not inject:
- tenant-wide autobiographical memory
- noisy old sessions

## UI Model

The current "Memory" or "Concepts" tab is still not quite right.

Recommended Porter detail tabs:

- Chat
- Activity
- Skills
- Directives
- Project State
- Org

For non-Porter workers:

- Chat
- Activity
- Skills
- Scope
- Project State
- Org

Why:
- `Directives` is clearer than `Concepts`
- `Project State` is clearer than generic `Memory`
- memory should feel operational, not philosophical

If we still want a single umbrella concept internally, call it `State`.

## Is Retrieval Memory Necessary?

Yes, but only as a secondary layer.

Porter probably still needs searchable long-tail memory later for:
- historical decisions
- past handoffs
- closed project notes
- user-specific preferences at scale
- eventual PorterHQ fleet diagnostics

But this should be:
- opt-in
- scoped
- reviewable
- not automatically injected everywhere

This is where Mem0-like retrieval, graph relationships, or vector search can help later.

It is not the first thing Porter should read.

## External Pattern Review

The strongest current patterns point in the same direction:

- LangGraph separates thread-scoped short-term memory from longer-term stores and explicitly distinguishes semantic, episodic, and procedural memory.
- Letta distinguishes always-visible memory blocks from archival memory and provides shared blocks for multi-agent coordination.
- Mem0 separates conversation/session/user/org memory layers and emphasizes scoped writes, filters, history, and expiration.
- OpenAI’s recent context-engineering examples separate session memory from curated long-term notes and warn that consolidation is the riskiest step.
- Anthropic explicitly recommends simple, transparent implementations over framework-heavy abstractions that hide prompts and behavior.

Implication for Porter:

Use simple explicit state first.
Use retrieval second.
Use consolidation sparingly.

## Concrete Product Recommendation

Porter Memory V3 should be:

- Project-first
- Directive-driven
- Agent-scoped
- Always persistent
- Explicitly reviewable
- Minimally auto-extractive
- Auditable

In plain terms:

Porter should remember the state of the work, not write fanfiction about the chats.

## Immediate Decisions

1. Stop treating session extraction as the heart of memory.
2. Remove `Cortex` as a product concept.
3. Replace the memory tab with directive/project-state views.
4. Keep chat history separate from durable memory.
5. Make project state the primary shared memory plane.
6. Make all promotions into durable memory explicit or reviewable.
7. Hide internal Porter-building artifacts from product memory entirely.

## Recommended Build Order

### Phase 1: Reframe

- remove Cortex branding from UI
- remove Concepts branding
- rename the tab model around Directives + Project State
- stop auto-injecting mixed fact blobs where possible

### Phase 2: Data Separation

- introduce explicit directives/project_notes/agent_notes records
- keep old cortex table as legacy storage only during migration
- stop writing new durable memory from generic chat extraction

### Phase 3: Porter-Managed State

- project setup writes project state directly
- worker creation writes agent state directly
- Porter can propose directive changes for approval

### Phase 4: Optional Retrieval Layer

- add archival search for historical notes
- add tags, filters, and possibly vector/graph backing later
- only after the structured state layer is stable

## Bottom Line

Yes, the previous direction was wrong for Porter.

Persistent memory is still necessary.
But Porter needs a durable orchestration state system, not a universal extraction brain.
