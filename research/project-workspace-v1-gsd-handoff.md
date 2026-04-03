# Project Workspace V1 — GSD Handoff

**Date:** 2026-03-24  
**Status:** Ready for GSD planning/scheduling  
**Owner:** Porter product architecture  
**Scope:** Product workspace redesign connecting Docs, Artifacts, Bridge, Recall, and Memory V3 into one project-first experience

## 1. Executive Summary

Porter is making a recurring product mistake:

- backend capabilities are expanding faster than the UI surfaces that make them useful
- powerful systems like Porter Bridge, Recall, and Memory V3 risk landing as isolated admin/internal tools instead of product leverage
- the current raw file browser exposes storage mechanics, not product shape

This project fixes that by building a **project-scoped workspace** where:

- `Docs` feels Obsidian-like
- `Artifacts` stays separate from docs
- `State` becomes the visible home of Memory V3 durable truth
- `Bridge` becomes visible at the point of work through runtime/provenance UI
- `Recall` becomes a review/promotion layer, not a competing truth system

## 2. Core Product Decision

Porter should **not** bring back a public top-level `Files` product surface.

Porter should instead expose:

- top-level product: `Agents`, `Projects`, `Models/Bridge`, `Runtime`
- inside each project: `Overview`, `Docs`, `Artifacts`, `Chat`, `Workers`, `Activity`, `State`

`Docs` is the Obsidian-like layer.  
`Artifacts` is uploads/outputs/deliverables/media.  
`State` is structured durable truth.  
`Recall` is secondary and reviewable.  
`Raw Files` remains internal/operator-only.

This is consistent with existing internal research:

- [Porter Files — Obsidian-Inspired Spec](/home/lobster/projects/porter/research/porter-files-obsidian.md)
- [Porter Artifacts V1](/home/lobster/projects/porter/research/porter-artifacts-v1.md)
- [Porter Memory V3](/home/lobster/projects/porter/research/porter-memory-v3-redesign.md)
- [Porter Bridge — Design Brief](/home/lobster/projects/porter/research/cli-runtime-design-brief.md)

## 3. Product Thesis

Porter should feel like:

- **Obsidian for project knowledge**
- **with Porter-native runtime provenance**
- **with structured project state**
- **with agent outputs landing as native workspace objects**

Porter should not feel like:

- a generic file manager
- a chat app with hidden memory
- an admin dashboard full of disconnected power tools

## 4. What Porter Must Copy From Obsidian

These are the right features to borrow:

- markdown-first docs
- `[[wikilinks]]`
- backlinks and outgoing links
- quick switcher
- workspace search
- properties/frontmatter
- tabs
- hover preview
- graph/canvas later, not first

These are the wrong things to copy blindly:

- vault-first product framing
- collapsing all file/media/object types into one tree
- treating everything as notes instead of separating docs from artifacts

## 5. Porter-Native Differentiators

The workspace must go beyond Obsidian by exposing backend power directly in the UI:

### A. Runtime Provenance

Every AI-created or AI-edited note should show:

- actor: user | Porter | worker
- runtime/backend: Claude | Codex | Gemini | Ollama | other
- model
- timestamp
- latency
- token/cost metrics when available

### B. Structured State

Every project should expose visible, structured truth:

- directives
- constraints
- risks
- approved decisions
- current phase
- approved outputs

### C. Promotion Workflow

Users should be able to explicitly:

- promote a recall item to project state
- promote a chat output to a note
- promote a note to a directive
- reject/archive a suggestion

### D. Native Agent Output

Worker outputs should become first-class notes or artifacts with provenance, not hidden blobs, logs, or random disk files.

## 6. Current-State Diagnosis

### What exists now

- Brain file CRUD and raw root/path browsing via [backend/src/routes/v1/files.ts](/home/lobster/projects/porter/backend/src/routes/v1/files.ts)
- file registry with project/contact/conversation associations
- internal/operator files surface in `admin/frontend/app/routes/files.tsx` (porter-admin merged into monorepo)
- isolated Bridge surface in `admin/frontend/app/routes/bridge.tsx`
- isolated Recall surface in `admin/frontend/app/routes/recall.tsx`
- strong Memory V3 architectural direction in research

### What is missing

- project-scoped note model with stable identity
- Obsidian-like docs experience
- `[[links]]`, backlinks, tags, properties, search
- runtime provenance at point of work
- state-first memory UI
- recall review/promotion workflow
- clear docs/artifacts separation in the live workspace

## 7. User-Facing IA

### Top-Level IA

- `Agents`
- `Projects`
- `Models / Bridge`
- `Runtime`

### Project Detail IA

- `Overview`
- `Docs`
- `Artifacts`
- `Chat`
- `Workers`
- `Activity`
- `State`

### Docs Layout

Three-column workspace:

- left rail
  - note tree
  - recent notes
  - pinned/favorites
  - quick switcher entry
- center
  - note title
  - tabs
  - markdown editor / live preview
- right rail
  - properties
  - backlinks
  - outgoing links
  - related objects
  - provenance
  - memory/state suggestions

## 8. Data Model Contract

GSD should lock this contract before UI implementation.

### Required entities

- `project_notes`
- `project_note_links`
- `project_note_tags`
- `project_note_properties`
- `project_note_relations`
- `project_note_provenance`
- `state_promotions`

### Minimum note fields

- `id`
- `project_id`
- `title`
- `slug`
- `path`
- `parent_path`
- `body_markdown`
- `note_type`
- `status`
- `created_by`
- `created_at`
- `updated_at`
- `archived_at`

### Minimum relation fields

- `id`
- `project_id`
- `source_note_id`
- `target_type`
- `target_id`
- `relation_type`
- `created_at`

### Provenance fields

- `id`
- `note_id`
- `event_type`
- `actor_type`
- `actor_id`
- `runtime`
- `model`
- `latency_ms`
- `input_tokens`
- `output_tokens`
- `cost`
- `created_at`

### Promotion fields

- `id`
- `project_id`
- `source_type`
- `source_id`
- `target_type`
- `target_id`
- `status`
- `reviewed_by`
- `created_at`
- `reviewed_at`

## 9. Architectural Rules

These rules should not be violated during execution:

1. No public top-level `Files` surface returns.
2. `Docs` and `Artifacts` remain separate.
3. `State` outranks `Recall` as product truth.
4. AI-generated content is provenance-labeled.
5. Runtime/model choice is visible, not hidden.
6. Memory promotions are explicit or reviewable.
7. Graph/canvas do not precede excellent docs fundamentals.
8. Raw filesystem browsing remains internal/operator-only.
9. Rename/move/link behavior must be stable before heavy note adoption.

## 10. Milestones

### Milestone 1 — Workspace IA Lock

**Outcome:** Product concepts stop drifting.

Scope:

- finalize public IA
- finalize project detail IA
- define exact terms: Docs, Artifacts, State, Recall
- lock non-goals

Acceptance criteria:

- one authoritative IA doc exists
- conflicting references to public `Files` are resolved
- docs/artifacts/state boundaries are explicit

### Milestone 2 — Note Entity + Docs Foundation

**Outcome:** `Docs` becomes a real project workspace.

Scope:

- note schema and CRUD
- Docs tab in project detail
- 3-column layout
- editor/preview/tabs
- note tree
- create/rename/move/archive/delete note

Acceptance criteria:

- user can work inside Docs without raw file browser
- notes are project-scoped and stable
- docs and artifacts are visibly separate

### Milestone 3 — Connections Layer

**Outcome:** Notes become linked and navigable.

Scope:

- `[[wikilinks]]`
- backlinks
- outgoing links
- tags
- search
- quick switcher
- hover preview

Acceptance criteria:

- links are indexable and visible
- backlinks update correctly
- rename/move does not silently break relationships

### Milestone 4 — Bridge At Point Of Work

**Outcome:** Runtime orchestration becomes visible product value.

Scope:

- provenance chips/panel on notes
- note-scoped `Ask Porter about this`
- used-context disclosure
- runtime/model/fallback explanation

Acceptance criteria:

- generated notes show provenance
- user can inspect runtime/context details from the note surface

### Milestone 5 — Memory V3 State Surface

**Outcome:** Structured state becomes primary truth.

Scope:

- project state rail or panel
- visible directives, constraints, risks, decisions, phase
- promotion flows from note/chat/recall into state

Acceptance criteria:

- user can see project truth without a memory browser
- state and recall are clearly differentiated

### Milestone 6 — Recall Refactor

**Outcome:** Recall becomes a support surface.

Scope:

- refactor Recall into review/promotion/archive workflow
- remove truth-like framing
- add direct actions:
  - promote to state
  - save as note
  - dismiss
  - archive

Acceptance criteria:

- Recall is secondary to State
- Recall helps workspace curation instead of competing with it

### Milestone 7 — Porter-Native Knowledge Layer

**Outcome:** Porter goes beyond Obsidian.

Scope:

- note types
- note relations to agents/people/artifacts/projects/decisions
- saved filtered views / bases-like tables
- worker-output-to-note pipeline

Acceptance criteria:

- docs become operational objects, not just markdown files

### Milestone 8 — Advanced Views

**Outcome:** Higher-order views land on top of a stable foundation.

Scope:

- local graph
- project graph
- canvas
- recovery/history
- daily notes/templates if validated

Acceptance criteria:

- these views are enhancements, not crutches for weak fundamentals

## 11. Epics And Tasks

### Epic A — IA And Surface Contract

Tasks:

- write canonical IA spec
- define `Docs` vs `Artifacts` vs `State`
- define user-facing language
- define what remains internal-only

### Epic B — Notes Backend Contract

Tasks:

- design stable note identity
- create note CRUD APIs
- create link/tag/property/relation tables
- define provenance and promotion schema

### Epic C — Docs Workspace UI

Tasks:

- Docs tab shell
- left rail note tree/recent
- center editor/preview/tabs
- right rail properties/meta
- basic note actions

### Epic D — Linking/Search Layer

Tasks:

- wikilink parser
- link indexer
- backlinks panel
- search
- quick switcher
- hover preview

### Epic E — Bridge Integration

Tasks:

- expose provenance metadata to UI
- add note-scoped Porter action
- add routing explanation UI
- add generated-note runtime labeling

### Epic F — Memory V3 State UI

Tasks:

- state rail
- directive and decision display
- promotion APIs and UI
- memory attribution

### Epic G — Recall Refactor

Tasks:

- redesign Recall language and layout
- support review/promotion/dismiss actions
- align Recall with State-first model

### Epic H — Artifact Separation

Tasks:

- keep artifact UX distinct from docs
- support note-artifact relations
- preserve provenance for artifacts

### Epic I — Porter-Native Relations And Views

Tasks:

- note types
- note relation chips and queries
- saved filtered views
- worker output landing flows

## 12. Execution Order

GSD should schedule in this order:

1. IA lock
2. note identity and schema contract
3. Docs foundation
4. linking/search
5. artifact separation cleanup
6. Bridge provenance integration
7. State rail and Memory V3 surface
8. Recall refactor
9. relations/views
10. graph/canvas/history

## 13. Parallelization Guidance

After IA and note contract are locked, these can run in parallel:

- Workstream A: note schema + CRUD
- Workstream B: docs shell + editor
- Workstream C: links/search/indexing
- Workstream D: artifact cleanup
- Workstream E: Bridge provenance model
- Workstream F: Memory V3 state/promotion model

Blocked until later:

- Recall refactor depends on State contract
- graph/canvas depends on links/properties
- saved views depend on note types and relations

## 14. Suggested PR Sequence

### PR 1 — `spec/workspace-ia-and-surface-contracts`

Contents:

- IA decisions
- naming decisions
- docs/artifacts/state definitions
- acceptance criteria

### PR 2 — `backend/project-note-entity-contract`

Contents:

- schema
- note identity
- CRUD APIs
- relation/provenance/promotion contracts

### PR 3 — `frontend/project-docs-shell`

Contents:

- Docs tab
- 3-column shell
- basic note rail
- placeholder right rail

### PR 4 — `frontend/project-docs-editor`

Contents:

- markdown editor/preview
- tabs
- save/update flows
- note create/rename/archive/delete

### PR 5 — `backend+frontend/linking-search`

Contents:

- wikilinks
- backlinks
- outgoing links
- project search
- quick switcher

### PR 6 — `bridge/provenance-in-docs`

Contents:

- provenance UI
- runtime/model disclosure
- note-scoped Ask Porter flow

### PR 7 — `state/memory-v3-workspace-surface`

Contents:

- state rail
- directive/risk/decision/constraint display
- promotion actions

### PR 8 — `recall/review-and-promotion-refactor`

Contents:

- Recall refactor
- secondary suggestion model
- promote/save/dismiss/archive actions

## 15. Verification Strategy

GSD should require both product and technical verification.

### Product verification

- docs/artifacts/state distinctions are obvious in UI
- generated notes clearly show provenance
- user can explain what context/runtime produced an answer
- recall suggestions can be promoted/rejected clearly
- no normal workflow requires opening raw internal files browser

### Technical verification

- link integrity survives rename/move
- notes are project-scoped correctly
- provenance events are persisted and queryable
- state promotions are auditable
- search results are accurate and scoped

### Suggested UAT scenarios

1. Create a project note, link two other notes, rename one, verify backlinks still work.
2. Ask Porter to summarize a note, verify runtime/model/provenance is visible.
3. Promote a recall item to project state and verify it appears in the state rail.
4. Upload an artifact and verify it is not mixed into Docs.
5. Generate a worker output and verify it lands as a native note or artifact with provenance.

## 16. Risks

### Product risks

- generic file browser creep returns under another label
- Recall remains a competing truth system
- Bridge stays admin-only
- graph/canvas ships before note workflows are good

### Architecture risks

- path-based identity causes broken links
- provenance becomes incomplete or inconsistent
- promotions bypass review/audit
- docs and artifacts drift back together

### Delivery risks

- UI and backend teams drift again without shared surface contracts
- Memory V3 implementation happens without visible workspace UI
- Bridge metadata exists but never reaches note surfaces

## 17. Explicit Non-Goals

- public top-level `Files`
- generic vault browser as primary product concept
- opaque auto-memory promotion from arbitrary chat extraction
- graph/canvas in first milestone
- replacing project-first IA with file-first IA

## 18. Open Questions For GSD To Resolve Early

1. Are notes strictly project-scoped in V1?
2. Are properties frontmatter-only, inline-only, or both?
3. Are links title-based, path-based, or ID-backed with aliases?
4. Does AI-generated note content default to draft/review mode?
5. What exact user language should replace current `Recall` framing?
6. Should `State` live as a dedicated tab, right rail, or both?

## 19. Recommended Planning Prompt For GSD

Use this as the planning prompt:

> Plan and schedule `Project Workspace V1 — Obsidian-Like Docs + Bridge/State/Recall Surface`.
> 
> Constraints:
> - public product remains project-first with no top-level Files
> - Docs is the primary Obsidian-like knowledge surface
> - Artifacts remains separate from Docs
> - Memory V3 must surface as structured State, not generic memory browsing
> - Recall must become a review/promotion surface, not a truth layer
> - Bridge/runtime/model provenance must be visible at the point of work
> - graph/canvas come later, after Docs fundamentals are strong
> 
> Sequence:
> IA lock -> note identity/schema -> Docs MVP -> links/search -> Bridge provenance -> State rail/promotion -> Recall refactor -> relations/views -> graph/canvas later.
> 
> Produce:
> - milestones
> - execution phases
> - dependency map
> - verification plan
> - PR boundaries
> - explicit risks and deferrals

## 20. Final Recommendation

This project should be framed internally as:

**"Make Porter’s backend power visible where work happens."**

That is the strategic point.  
Not "build a files feature."  
Not "clone Obsidian."  
Not "improve memory."  

Build a project workspace where:

- docs are rich and linked
- state is durable and visible
- recall is reviewable
- bridge is inspectable
- workers leave native work products behind

## 21. Autonomous Projects Extension

This workspace project should explicitly fold in the **autonomous project** concept.

The user requirement is not just:

- better docs
- better files
- better memory

It is also:

- launch a project from a few words
- have Porter propose and assign the right workers
- keep the project on track
- prevent drift, sprawl, and worker freelancing
- preserve human control without forcing human micromanagement

This means the workspace cannot be planned as a passive knowledge surface only.
It must also become the operating shell for **autonomous project execution**.

## 22. Core Decision On Templates vs Agentic Launch

Porter should use **templates as shape**, not as the primary brain.

### Wrong model

- user picks a rigid template
- system instantiates a fixed worker pack
- execution follows a canned checklist

This is too brittle and quickly becomes fake autonomy.

### Right model

- user gives a goal in a few words
- Porter infers project type and operating shape
- templates provide structure, defaults, and guardrails
- agentic planning fills in the actual staffing, sequencing, and execution path

In short:

**Templates define project grammar. Agentic orchestration defines the actual plan.**

## 23. Recommended Autonomous Project Model

Porter should launch projects through a 5-stage control loop.

### Stage 1 — Intent Capture

Input:

- a few words from the user
- optional clarifying answers
- detected runtime/tool availability
- existing directives and org defaults

Output:

- normalized project intent
- confidence score
- proposed project type
- ambiguity list
- whether clarification is required

### Stage 2 — Project Formation

Porter creates:

- project record
- initial objectives
- milestone skeleton
- initial docs scaffold
- initial state object
- draft worker plan
- risk/approval profile

This is where templates help.
Templates should contribute:

- likely objectives
- likely note/artifact structure
- likely worker categories
- likely approval points

Templates should not dictate the final worker set.

### Stage 3 — Staffing

Porter should not just create 2-4 workers mechanically.

It should generate a staffing plan with:

- role
- purpose
- scope boundary
- preferred runtime
- fallback runtime
- authority level
- deliverable contract
- review cadence

Each worker should exist because a specific workstream exists, not because a template said so.

### Stage 4 — Execution And Tracking

Porter should continuously manage:

- task assignment
- worker workload
- blocked work
- milestone risk
- decision drift
- cost and runtime usage
- deliverable flow into docs/artifacts/state

### Stage 5 — Governance And Correction

Porter must continuously ask:

- is the project still aligned with goal?
- are workers producing relevant outputs?
- has scope drift appeared?
- do we need a new worker, a different runtime, or a human decision?
- should a temporary worker be retired?

This is what keeps projects from going off the rails.

## 24. Why Most Projects Drift

Porter should explicitly design against these failure modes:

1. Too much early worker creation
2. No structured project state
3. Vague task prompts
4. No approval gates for scope changes
5. Outputs landing in chats/logs instead of project objects
6. No visible owner for blocked work
7. No project-level steering after kickoff
8. Runtime/model choice hidden from the operator
9. No mechanism to kill or replace weak workers

The workspace and autonomous project system should be judged primarily by whether they reduce those failure modes.

## 25. Autonomous Project Requirements

GSD should treat these as product requirements, not optional future ideas.

### A. Project Charter

Every launched project needs:

- goal
- type
- objectives
- constraints
- success criteria
- risk level
- approval policy
- staffing plan

### B. Worker Contract

Every worker assigned to a project needs:

- explicit role
- workstream
- allowed tools
- allowed runtimes
- authority ceiling
- expected outputs
- review path

### C. Execution Contract

Every task delegated needs:

- owning worker
- project linkage
- expected output type
- due/priority
- escalation path
- completion criteria

### D. Steering Contract

Every project needs:

- periodic status synthesis
- blocked-work detection
- drift detection
- scope-change review
- staffing adjustment loop

## 26. Recommended Staffing Model

Porter should use three worker classes.

### 1. Core Project Workers

Persistent for the life of the project.

Examples:

- project lead
- researcher
- builder
- QA/reviewer

### 2. Temporary Specialist Workers

Instantiated only for bounded tasks.

Examples:

- SEO pass
- legal review
- data cleanup
- visual polish
- performance audit

### 3. System Workers

Not project-owned, but project-aware.

Examples:

- Porter
- router
- memory curator
- quality gate
- risk/compliance checker

This is better than treating all workers as equal project members.

## 27. Recommended Top-Level Project Roles

For autonomous projects, Porter should consider this minimal operating set:

- `Porter`
  - orchestrator
  - staffing and escalation
- `Project Lead`
  - owns coordination and milestone truth
- `Builder`
  - executes primary production work
- `Reviewer`
  - validates outputs before promotion/approval
- `Domain Specialist`
  - optional, only when required by project type

Porter should add more workers only when a concrete workstream justifies them.

## 28. Launch Flow From A Few Words

Recommended user flow:

1. User says:
   - "launch a landing page for X"
   - "help me plan a research project on Y"
   - "build an onboarding flow for Z"

2. Porter responds with:
   - inferred project type
   - goal summary
   - likely scope
   - required clarification if confidence is low

3. Porter proposes:
   - project charter
   - initial docs structure
   - initial workers
   - milestones
   - approvals/risk flags

4. User approves or edits

5. Porter creates:
   - project
   - docs
   - state
   - workers
   - initial assignments

6. Project begins with:
   - visible work board/activity
   - first worker tasks
   - explicit review and state update path

This is much stronger than the current wizard behavior in [backend/src/routes/v1/wizard.ts](/home/lobster/projects/porter/backend/src/routes/v1/wizard.ts), which is still closer to proposal generation than real autonomous project formation.

## 29. Anti-Rail-Drift Mechanisms

GSD should explicitly include these in planning.

### A. Scope Lock

Once project charter is approved:

- material scope changes require explicit review
- workers cannot silently expand mission

### B. Deliverable Contracts

Each major task must specify:

- output goes to Docs or Artifacts or State
- expected reviewer
- approval needed or not

### C. Drift Detection

Porter should flag:

- new work not tied to an objective
- repeated worker retries
- outputs that never get promoted/approved
- milestone stagnation
- staffing mismatch

### D. Runtime Visibility

Every worker output should show:

- which runtime did the work
- whether runtime choice matched policy
- whether fallback occurred

### E. Worker Retirement

Porter should explicitly retire:

- temporary workers after task completion
- weak workers after repeated failure
- redundant workers after scope reduction

## 30. Workspace Surfaces Needed For Autonomous Projects

These should be planned as explicit UI surfaces.

### In Project `Overview`

- charter summary
- objectives
- milestones
- staffing plan
- current health
- drift flags

### In Project `Docs`

- canonical knowledge and plans
- worker outputs as notes
- linked decisions and references

### In Project `State`

- directives
- constraints
- approved decisions
- risks
- approvals
- current phase

### In Project `Workers`

- active workers
- temporary workers
- worker scope boundaries
- assignment queue
- blocked / overloaded / idle status

### In Project `Activity`

- assignment history
- output creation
- approvals
- promotions to state
- drift and intervention events

## 31. Templates: What They Should And Should Not Do

### Templates should provide

- project type classification hints
- default docs skeleton
- default milestones
- common risks
- common worker categories
- common artifact categories
- common approval gates

### Templates should not provide

- final staffing truth
- final milestone truth
- rigid execution plans
- hardcoded prompts for all work
- fake autonomy via canned worker packs

Templates are the project’s starting frame, not its substitute brain.

## 32. Additional Milestone Recommendation

GSD should add a dedicated autonomous project milestone to this initiative.

### Milestone 0 — Autonomous Project Formation

**Outcome:** Porter can safely form and steer projects from short user input.

Scope:

- upgrade wizard into project formation flow
- define project charter model
- define staffing plan model
- define worker contract model
- define drift detection model
- define approval policy model

Acceptance criteria:

- Porter can launch a project from a short goal statement
- project starts with charter, docs, state, and staffing
- workers have explicit scope
- project steering can detect and flag drift

This milestone should happen before or alongside Docs foundation, because the workspace should be designed around autonomous project operation, not retrofitted later.

## 33. Updated Execution Order

GSD should use this stronger sequence:

1. IA lock
2. autonomous project formation contract
3. note identity and schema contract
4. Docs foundation
5. linking/search
6. artifact separation cleanup
7. Bridge provenance integration
8. State rail and Memory V3 surface
9. Recall refactor
10. worker/staffing/project steering surfaces
11. relations/views
12. graph/canvas/history

## 34. New PR Sequence Recommendation

Insert these early PRs:

### PR 2A — `product/autonomous-project-formation-contract`

Contents:

- project charter structure
- staffing plan structure
- worker contract structure
- drift detection rules
- approval policy contract

### PR 2B — `backend/project-formation-and-staffing-api`

Contents:

- wizard/launcher upgrade
- project formation records
- staffing plan persistence
- worker assignment primitives

Then continue with Docs foundation and later UI work.

## 35. Questions GSD Must Resolve

1. How many workers should Porter create initially by default?
2. Which project changes require human approval?
3. When should Porter add a temporary specialist versus re-task an existing worker?
4. What exact signals define project drift?
5. How should worker outputs be reviewed before promotion into state or approved deliverables?
6. How visible should the staffing plan be to the user by default?

## 36. Updated Planning Prompt For GSD

Use this stronger planning prompt:

> Plan and schedule `Project Workspace V1 — Obsidian-Like Docs + Bridge/State/Recall Surface`, including the autonomous project operating model.
>
> Constraints:
> - Porter remains project-first with no public top-level Files
> - project launch must work from a short user goal
> - templates provide shape and defaults, not rigid execution plans
> - Porter must form a project charter, staffing plan, and worker contracts before execution
> - Docs is the primary workspace
> - Artifacts remains separate from Docs
> - Memory V3 must surface as structured State
> - Recall must become a review/promotion surface
> - Bridge/runtime/model provenance must be visible at the point of work
> - drift detection and approval gates must keep projects on track
> - graph/canvas come later, after strong workspace fundamentals
>
> Sequence:
> IA lock -> autonomous project formation contract -> note identity/schema -> Docs MVP -> links/search -> Bridge provenance -> State rail/promotion -> Recall refactor -> worker/staffing/project steering surfaces -> relations/views -> graph/canvas later.
>
> Produce:
> - milestones
> - execution phases
> - dependency map
> - verification plan
> - PR boundaries
> - explicit risks and deferrals

## 37. Milestone-To-Codebase Mapping

This section is intentionally approximate. It gives GSD likely ownership zones so planning can start from concrete file areas instead of abstract features.

### Milestone 0 / Autonomous Project Formation

Likely touch points:

- [backend/src/routes/v1/wizard.ts](/home/lobster/projects/porter/backend/src/routes/v1/wizard.ts)
- [backend/src/routes/v1/projects.ts](/home/lobster/projects/porter/backend/src/routes/v1/projects.ts)
- [backend/src/routes/v1/agents.ts](/home/lobster/projects/porter/backend/src/routes/v1/agents.ts)
- [backend/src/routes/v1/jobs.ts](/home/lobster/projects/porter/backend/src/routes/v1/jobs.ts)
- [backend/src/services/scheduler.ts](/home/lobster/projects/porter/backend/src/services/scheduler.ts)
- [backend/src/services/ai-router.ts](/home/lobster/projects/porter/backend/src/services/ai-router.ts)
- project/state schema files in [backend/src/db/schema.ts](/home/lobster/projects/porter/backend/src/db/schema.ts)

Likely frontend surfaces:

- project creation/launcher flow in product UI repo
- project detail `Overview`, `Workers`, and `State`
- optional admin/status mirrors in `admin/` (monorepo)

### Milestone 1 / IA Lock

Likely touch points:

- research/docs only
- project shell/tab definitions in product UI repo
- cleanup references in release notes/specs if needed

### Milestone 2 / Note Entity + Docs Foundation

Likely touch points:

- [backend/src/routes/v1/files.ts](/home/lobster/projects/porter/backend/src/routes/v1/files.ts) or new notes routes beside it
- [backend/src/db/schema.ts](/home/lobster/projects/porter/backend/src/db/schema.ts)
- project UI detail route(s) in product UI repo
- possibly shared editor components in product UI repo

### Milestone 3 / Connections Layer

Likely touch points:

- note parsing/indexing services in backend
- note/link schema additions
- search endpoint(s)
- docs right rail / search / quick switcher UI in product UI repo

### Milestone 4 / Bridge At Point Of Work

Likely touch points:

- Bridge/runtime metadata producers in legacy/product backend surface
- `admin/frontend/app/routes/bridge.tsx` as reference only
- project docs note header/right rail in product UI repo

### Milestone 5 / Memory V3 State Surface

Likely touch points:

- [research/porter-memory-v3-redesign.md](/home/lobster/projects/porter/research/porter-memory-v3-redesign.md) as source contract
- memory/state schema and migration files
- project detail `State` tab or right rail in product UI repo
- any memory injection or promotion services

### Milestone 6 / Recall Refactor

Likely touch points:

- `admin/frontend/app/routes/recall.tsx` as current semantics reference
- memory query APIs
- review/promotion workflow UI in product UI repo

### Milestone 7 / Porter-Native Knowledge Layer

Likely touch points:

- note relation schema
- project/contact/agent link models
- CRM/project integration routes
- worker-output ingestion logic

### Milestone 8 / Advanced Views

Likely touch points:

- graph/canvas/view-specific frontend modules
- supporting graph relation queries
- history/recovery event storage

## 38. Suggested GSD Workstreams / Agent Splits

GSD should avoid planning this as one monolith. Recommended workstreams:

### Workstream A — Product Contract

Responsibility:

- IA lock
- autonomous project contract
- naming
- state/recall/docs/artifacts semantics

Primary outputs:

- IA spec
- contract docs
- acceptance criteria

### Workstream B — Notes Platform

Responsibility:

- note schema
- CRUD
- stable identity
- move/rename semantics
- note relations foundation

Primary outputs:

- backend schema
- notes API
- note storage and indexing rules

### Workstream C — Docs Experience

Responsibility:

- Docs UI shell
- editor/preview
- tabs
- tree/recent/pinned
- quick switcher

Primary outputs:

- docs surface
- editor workflows
- keyboard paths

### Workstream D — Connections And Search

Responsibility:

- wikilinks
- backlinks
- outgoing links
- search
- hover preview

Primary outputs:

- parser/indexing
- link/search UI

### Workstream E — Bridge Surface

Responsibility:

- provenance metadata
- runtime chips
- note-scoped Ask Porter
- context/routing explainability

Primary outputs:

- provenance UI contract
- note action surface

### Workstream F — State / Memory V3

Responsibility:

- structured state UI
- directive/decision/risk views
- promotion APIs
- review queue model

Primary outputs:

- state rail/tab
- promotion workflow

### Workstream G — Autonomous Project Control

Responsibility:

- launcher/formation flow
- staffing plan
- worker contracts
- drift detection
- steering loop

Primary outputs:

- project charter flow
- worker assignment model
- drift/governance rules

## 39. Verification Checklist By Milestone

This section is intended for direct use in GSD verification.

### Milestone 0 — Autonomous Project Formation

- user can start a project from a short goal
- Porter creates a project charter, not just a title
- worker assignments have role, scope, and outputs
- first tasks are specific, not generic
- project can detect no-worker / wrong-worker / blocked-worker situations
- project drift conditions are represented in data and visible in UI

### Milestone 1 — IA Lock

- no public IA includes top-level Files
- Docs, Artifacts, State, Recall each have one clear meaning
- autonomous project flow is represented in IA

### Milestone 2 — Docs Foundation

- create/open/edit/save note works
- note archive/delete works
- notes are project-scoped
- artifacts are not mixed into note tree
- raw internal files browser is not needed for ordinary work

### Milestone 3 — Connections Layer

- `[[link]]` creates visible connection
- backlinks panel is correct
- search returns notes within project scope
- rename/move preserves relationships
- hover preview works

### Milestone 4 — Bridge At Point Of Work

- note shows actor/runtime/model provenance
- generated content shows whether fallback occurred
- note-scoped Ask Porter exposes used context
- user can tell why the chosen runtime was used

### Milestone 5 — State Surface

- directives visible in project
- decisions/risks/constraints visible in project
- promoted items appear in State
- State is clearly higher trust than Recall

### Milestone 6 — Recall Refactor

- Recall items can be promoted, saved, dismissed, or archived
- Recall does not present itself as canonical truth
- Recall supports project workflows instead of competing with them

### Milestone 7 — Knowledge Layer

- worker outputs land as note or artifact with provenance
- notes can relate to agents/artifacts/people/projects
- filtered structured views work

### Milestone 8 — Advanced Views

- graph/canvas read from the canonical relations model
- graph/canvas are additive, not required for core flows
- history/recovery works on notes and promotions

## 40. Safe Deferrals

These can be deferred without damaging the core product if schedule tightens:

- graph view
- canvas
- global cross-project graph
- daily notes
- templates beyond a small starter set
- advanced saved views
- rich page preview polish
- full automation of temporary specialist lifecycle
- full cost accounting on every provenance event if partial metrics exist first

## 41. Dangerous Deferrals

These should **not** be deferred, because doing so would recreate the current product problem:

- IA lock
- note identity contract
- docs vs artifacts separation
- state-first memory surface
- runtime provenance at point of work
- promotion/review flow
- worker contract / staffing plan for autonomous projects
- drift detection signals

## 42. Product Heuristics For GSD

Use these heuristics when choosing between options:

1. Prefer visible user leverage over hidden backend cleverness.
2. Prefer project-scoped truth over global ambient memory.
3. Prefer explicit promotion over silent memory extraction.
4. Prefer fewer stronger workers over many vague workers.
5. Prefer a note/workspace object over a transient chat answer.
6. Prefer provenance and explainability over magical convenience.
7. Prefer stable identity over path-only convenience.
8. Prefer one excellent docs workflow over many half-finished views.

## 43. Recommended UAT Scenarios For Final Ship

### Scenario A — Launch From A Few Words

User says:

- "launch a landing page for my accounting tool"

Expected:

- Porter infers project shape
- proposes charter and staffing
- user approves
- project opens with Docs, State, Workers, Artifacts in place
- first worker tasks are concrete

### Scenario B — Keep Project On Track

Expected:

- workers produce notes/artifacts with provenance
- blocked work shows up in project steering surface
- scope drift is flagged before execution wanders
- user can intervene with approval or correction

### Scenario C — Docs As Real Workspace

Expected:

- notes link cleanly
- backlinks work
- search is fast
- properties and provenance are visible
- user never needs raw file browsing for normal project work

### Scenario D — Memory Discipline

Expected:

- project truth lives in State
- Recall suggestions are reviewable
- promoted items are auditable
- old chat extraction semantics do not dominate the product

### Scenario E — Runtime Trust

Expected:

- user can see which runtime/model produced output
- fallback behavior is visible
- note-scoped Ask Porter discloses used context

## 44. Short Handoff Command

If you want to point GSD at this artifact with minimal extra framing, use:

> Use [project-workspace-v1-gsd-handoff.md](/home/lobster/projects/porter/research/project-workspace-v1-gsd-handoff.md) as the source of truth. Plan and schedule the full `Project Workspace V1` initiative, including autonomous project formation, docs/artifacts/state separation, Bridge provenance at point of work, and Recall refactor into a review/promotion surface. Preserve the project-first IA and do not reintroduce public top-level Files.
