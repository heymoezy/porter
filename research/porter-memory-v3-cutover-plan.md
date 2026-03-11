# Porter Memory V3 Cutover Plan

## Goal

Cut Porter from the current Cortex/extraction-heavy memory model to a project-first persistent state system without breaking existing data or prompts during migration.

## What To Delete

Delete from the product surface:
- `Cortex` naming
- `Concepts` naming
- memory education/marketing copy that implies "AI remembers everything"
- session-learning UX as a primary memory workflow
- model memory topology UI that exposes backend-specific local memory files as if they are product truth

Delete from runtime behavior:
- automatic durable-memory promotion from general chat responses
- generic session distillation as a default memory path
- any injection path that treats extracted "facts" as first-class project truth

## What To Keep

Keep and repurpose:
- event logging around memory writes/updates/deletes
- scoped retrieval helper ideas
- deduplication logic where still useful
- confidence/review concepts only if tied to explicit proposals
- existing project/persona storage as migration anchors

Keep temporarily for migration:
- `cortex_memories`
- session learning tables
- memory APIs needed to inspect/export legacy data

## New Product Surface

### Porter

Tabs:
- Chat
- Activity
- Skills
- Directives
- Project State
- Org

### Workers

Tabs:
- Chat
- Activity
- Skills
- Scope
- Project State
- Org

## New Write Flows

### Project creation

Create/update directly:
- project goal
- success bar
- constraints
- phase
- priorities

### Worker creation

Create/update directly:
- role
- lifecycle
- project assignment
- boundary summary
- handoff contract

### Directive changes

Flow:
- Porter proposes
- user approves or edits
- directive becomes active

### Activity/handoffs

Write to:
- project notes
- agent notes

Not to:
- global extracted memory

## New Read Flows

### Porter chat

Read:
- directives
- relevant project state
- worker roster summaries
- current project notes

### Worker chat

Read:
- worker scope
- current assignment
- project constraints
- handoff notes

## Migration Strategy

### Step 1

Freeze new chat/session auto-extraction into durable memory by default.

### Step 2

Introduce new tables or structured JSON companions:
- directives
- project_notes
- agent_notes

### Step 3

Map high-value legacy memories into structured records:
- user preference -> directive
- project-specific fact -> project_note or project field
- worker-specific fact -> agent_note

### Step 4

Archive or hide the rest of legacy Cortex data from normal product UX.

### Step 5

Retain a legacy inspection/export path for PorterHQ/operator debugging only.

## Runtime Simplification

After cutover, the system should no longer need:
- routine extraction threads after every dispatch/chat
- Cortex consolidation timers as a core product workflow
- memory-specific background churn to stay usable

Background jobs that still make sense:
- note compaction
- stale run-state cleanup
- audit rollups
- optional archival indexing

## Success Criteria

The redesign is successful when:

1. Porter remembers project state across sessions.
2. Worker boundaries persist across sessions.
3. Directives are explicit and reviewable.
4. Chat history is not confused with durable memory.
5. Internal Porter-building artifacts never appear in product memory.
6. The prompt context for Porter is smaller and more structured than today.
7. The user can understand why Porter "remembers" something.

## First Implementation Tranche

1. Remove Cortex/Concepts naming from active UI.
2. Add `Directives` and `Project State` tabs/views.
3. Stop default chat-response extraction into durable memory.
4. Create structured storage for directives/project notes/agent notes.
5. Read the new structured state into Porter and worker runs.

That is the cleanest possible first cut.
