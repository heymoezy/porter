# Porter Agents V2 Design Brief

Date: 2026-03-10
Status: Proposed
Owner: Porter product architecture

## Goal

Replace the current exposed peer-agent model with a Porter-first system:

- `Porter` is the only built-in public master agent.
- Users can still create squads and agents.
- All delegation goes through Porter.
- Porter remains the product identity and control plane.
- Agent identity becomes visually strong through Minecraft-like pixel characters.

This is a product simplification and a systems clarification, not just a UI cleanup.

## Why Change

The current system drifted into an overexposed multi-agent model:

- a visible orchestrator persona (`Lobster`)
- visible specialist personas
- visible squads
- editable identity/config file packs
- internal build-time concepts mixed into the public product model

That is flexible, but it is not clean.

For SaaS, the cleaner mental model is:

1. User talks to Porter.
2. Porter decides whether to answer directly or delegate.
3. Squads and agents are Porter-managed workers, not peer orchestrators.

## Product Model

### Public Model

- `Porter`: the built-in master orchestrator
- `Squads`: user-defined collections of worker agents
- `Agents`: user-defined or system-defined workers managed by Porter

### Internal Model

- Porter may use hidden delegation logic, specialist prompts, or internal execution profiles.
- Those should not be exposed as co-equal public "personalities" unless they earn product value.

### Explicit Non-Goal

Do not position Porter as "a collection of equal agents talking to each other."

That is interesting internally, but confusing as a product.

## Core Decisions

### 1. Porter Is Locked

Porter should be system-managed.

Do not expose raw file editing for Porter's:

- identity
- soul
- role card
- system prompt pack
- avatar

If Porter needs tuning, use product-level controls, policies, and structured admin settings.

### 2. User Agents Stay

Users should still be able to:

- create squads
- create agents
- assign roles
- choose preferred runtimes
- set delegation preferences

But those agents are subordinate to Porter in the public model.

### 3. Delegation Always Flows Through Porter

Default execution path:

1. User sends request to Porter.
2. Porter determines direct answer vs delegation.
3. Porter selects squad/agent/backend/model.
4. Worker returns result to Porter.
5. Porter presents the result back to the user.

This keeps:

- auditability
- consistent context
- policy enforcement
- clean UX

### 4. Structured Agent Config First

For user-created agents, prefer structured profile editing over raw markdown file editing.

Recommended editable fields:

- name
- role
- description
- preferred backend
- fallback backends
- squad membership
- delegation mode
- appearance spec

Raw file editing can remain an advanced internal/admin capability later, but it should not define the product.

## Visual Identity Direction

## Desired Style

Agent portraits should feel closer to Minecraft characters than generic flat avatars.

That means:

- blocky silhouette
- character outfit identity
- readable role cues
- stable front/isometric portrait render
- distinct personality through color and gear

This is stronger than generic "pixel-art circles" and fits Porter better as a living agent platform.

## Visual System

Each agent gets:

- a canonical skin
- a portrait render
- an optional full-body render
- state variants later

### Appearance Spec

Each agent should store an `appearance_spec`:

- archetype
- palette
- outfit
- hair/head style
- accessory
- role marker
- mood/vibe
- seed

Example:

```json
{
  "style": "minecraft",
  "seed": "porter-core",
  "palette": "navy-amber",
  "outfit": "operator-jacket",
  "accessory": "satchel",
  "role_marker": "command-badge",
  "vibe": "calm, strategic, trustworthy"
}
```

## OSS Components To Reuse

### 1. Minecraft Skin Rendering

Recommended renderer:

- `nmsr-rs`

Why:

- self-hostable
- high-quality Minecraft skin rendering
- supports head/body/isometric style renders
- dual Apache-2.0 / MIT licensing

Source:

- https://github.com/NickAcPT/nmsr-rs

Use:

- render stable agent portraits from generated or curated skins
- produce card icons, profile views, and future activity poses

### 2. Minecraft Skin Generation

Recommended experimental generator:

- `minecraft_skin_generator`

Why:

- prompt-to-skin generation exists already
- useful for R&D and optional later workflows
- aligns with agent descriptions, roles, and vibes

Source:

- https://github.com/Monadical-SAS/minecraft_skin_generator

Use:

- not as the first production dependency
- use later for optional "generate appearance from role/vibe" flows

### 3. Pixel Art Tooling

Recommended manual art tool:

- `Pixelorama`

Why:

- mature
- MIT-licensed
- supports serious pixel workflow
- good fallback for curation and edits

Source:

- https://github.com/Orama-Interactive/Pixelorama

Use:

- create the canonical Porter skin
- refine templates
- edit generated assets when needed

### 4. Visual Inspiration

Relevant inspiration:

- `pixel-agents`

Source:

- https://github.com/pablodelucca/pixel-agents

What to borrow:

- agents feel alive
- work activity is visualized
- character identity matters

What not to adopt directly:

- VS Code extension assumptions
- Claude Code terminal coupling
- external paid asset dependency

### 5. Orchestration Pattern References

Relevant references:

- `agent-squad`
- `cli-agent-orchestrator`

Sources:

- https://github.com/awslabs/agent-squad
- https://github.com/awslabs/cli-agent-orchestrator

What to borrow:

- supervisor/worker split
- hierarchical delegation
- explicit handoff vs assign semantics
- session isolation concepts

What not to adopt directly:

- Porter should not become a generic orchestrator shell around external CLIs
- the product UX must stay Porter-first

## Recommended Implementation Strategy

### Phase 1: Porter-First Restructure

- Replace public `Lobster` identity with `Porter`
- Keep squads and user-created agents
- Remove public implication that specialist agents are peer orchestrators
- Make Porter the default selected agent in the Agents surface
- Lock Porter identity/config editing

Deliverable:

- one public master agent
- squads/agents still work
- conceptual model becomes clean

### Phase 2: Appearance System V1

- Add `appearance_spec` to agent model
- Add skin asset storage and portrait render pipeline
- Create one curated Porter skin manually
- Render Porter with `nmsr-rs`
- Add deterministic placeholder skins for user-created agents

Deliverable:

- Porter has a strong Minecraft-like visual identity
- every agent can have a consistent portrait

### Phase 3: Structured Agent Builder

- Replace raw file-first creation flow with structured builder
- New agent wizard should collect:
  - role
  - vibe
  - squad
  - preferred runtime
  - appearance traits
- Porter can optionally suggest the agent profile

Deliverable:

- clean creation flow
- agents feel intentional, not hacked together

### Phase 4: Delegation UX

- show Porter deciding whether to delegate
- show worker assignment clearly
- keep the user talking to Porter, not switching mental models

Deliverable:

- delegation becomes legible
- Porter remains the interface

### Phase 5: Appearance Generation V2

- optionally integrate prompt-to-skin generation
- use generated skins as drafts, not as blind final output
- allow curation and fallback to templates

Deliverable:

- more expressive visual identity without sacrificing quality

## Recommended Data Model Changes

Add to persona schema:

- `is_system INTEGER DEFAULT 0`
- `is_public INTEGER DEFAULT 1`
- `is_locked INTEGER DEFAULT 0`
- `is_master INTEGER DEFAULT 0`
- `appearance_style TEXT DEFAULT ''`
- `appearance_spec TEXT DEFAULT '{}'`
- `skin_asset_path TEXT DEFAULT ''`
- `portrait_asset_path TEXT DEFAULT ''`

Rules:

- Porter: `is_system=1`, `is_public=1`, `is_locked=1`, `is_master=1`
- internal helper agents later: `is_system=1`, `is_public=0`
- user-created agents: `is_system=0`, `is_public=1`, `is_locked=0`

## UI Direction

### Agents Tab

Should become:

- Porter hero card
- squads section
- worker agents section

Not:

- a flat peer grid where Porter is just one more agent

### Porter Detail View

Show:

- role: Master Orchestrator
- delegation activity
- current policies
- linked squads
- model/runtime status

Do not show:

- editable soul files
- delete button
- arbitrary avatar editor

### Worker Agent Detail View

Show:

- structured profile
- runtime preferences
- squad assignment
- appearance settings
- activity

Advanced/raw file editing should be hidden behind admin mode if it survives at all.

## Sanity Checks Against Current Porter

The current codebase already supports parts of this direction:

- persona dispatch exists
- project/task-aware execution exists
- squad membership exists
- Porter/bridge control plane exists

What is misaligned today:

- visible peer-agent framing
- `Lobster` public orchestrator identity
- exposed create/delete/edit semantics for every agent
- squads treated as a first-order product concept before Porter identity is solid
- avatar system too weak for the emotional role the agents are expected to play

So this is a simplification pass, not a greenfield rewrite.

## Risks

### Risk: Overbuilding the Art System

Mitigation:

- start with one curated Porter skin
- deterministic templates for other agents
- generation later

### Risk: Confusing Internal and External Agents Again

Mitigation:

- explicit `is_public`
- Porter-only public master identity
- internal helpers hidden by default

### Risk: Delegation Becomes Fake

Mitigation:

- always show whether Porter answered directly or delegated
- keep routing/activity logs truthful

### Risk: Minecraft Aesthetic Feels Gimmicky

Mitigation:

- keep renders polished and consistent
- use restrained animation
- design Porter first before system-wide rollout

## Recommendation

Proceed with a Porter-first agent platform, not a peer-agent swarm.

Keep squads and user-created agents, but subordinate them to Porter in both architecture and UX.

For visuals, adopt a Minecraft-style identity system:

- manual curated Porter skin first
- `nmsr-rs` for rendering
- structured appearance specs for future agents
- optional prompt-to-skin generation later

This is the cleanest path that preserves extensibility while giving Porter a real product identity.

## External References

- `pixel-agents`: https://github.com/pablodelucca/pixel-agents
- `nmsr-rs`: https://github.com/NickAcPT/nmsr-rs
- `minecraft_skin_generator`: https://github.com/Monadical-SAS/minecraft_skin_generator
- `Pixelorama`: https://github.com/Orama-Interactive/Pixelorama
- `agent-squad`: https://github.com/awslabs/agent-squad
- `cli-agent-orchestrator`: https://github.com/awslabs/cli-agent-orchestrator
- `DiceBear`: https://www.dicebear.com/
