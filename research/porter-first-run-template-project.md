# Porter First-Run Template Project

## Decision

Porter should not seed a self-referential "Porter App" project for every user.

The first project should teach the product through use:
- how Porter orchestrates
- how projects hold state
- how artifacts appear
- how workers get created
- how approvals and directives shape the work

This should feel like a guided launchpad, not a leftover internal dev workspace.

## Product Goal

Give every new user one default project that is:
- useful immediately
- safe to experiment in
- opinionated enough to teach the model
- generic enough to fit any domain

## Recommended Default Project

Name:
- `Launchpad`

Subtitle:
- `Learn how Porter runs projects, workers, and artifacts`

Purpose:
- show the user the core Porter loop in one contained place
- let Porter demonstrate worker creation, artifact generation, and state management
- avoid mixing user work with Porter platform-development residue

## Launchpad Structure

### 1. Project Brief

Seed brief:
- `This project is a guided workspace for learning how Porter organizes work.`
- `Use it to create a worker, define a small outcome, review project state, and watch artifacts appear.`

### 2. Success Criteria

Seed success bar:
- user creates or approves one worker
- user creates one real project after understanding the flow
- Porter stores one directive
- one artifact lands in the project artifact lane

### 3. Starter Tasks

Suggested starter sequence:
1. Meet Porter and ask what he can orchestrate
2. Create a worker for a simple outcome
3. Add one directive for how Porter should operate
4. Review the resulting artifact or deliverable
5. Create a real project and graduate from Launchpad

These should be ordinary project tasks, not hidden onboarding UI.

### 4. Artifacts

Seed artifacts should be minimal:
- `project-brief.md`
- `success-criteria.md`
- `operating-notes.md`

No fake screenshots, fake reports, or fake deliverables.

## Porter Chat Behavior In Launchpad

When the active project is `Launchpad`, Porter should bias toward:
- brief explanations
- guided setup
- visible approvals
- explaining why he is proposing a worker/project step

He should not sound like a tutorial bot.
He should still sound like Porter.

## Migration Rule

For existing local installs:
- do not blindly delete real projects
- stop creating new `Porter App` defaults
- if a legacy `Porter App` project exists and appears to be a seed workspace, offer migration to `Launchpad`
- if it contains real user work, preserve it and stop treating it as the canonical default

## Data/State Requirements

The first-run template should include:
- structured project state
- starter directives
- starter tasks
- a clean artifact directory

It should not include:
- internal Porter build notes
- runtime debugging residue
- Cortex memory debris
- platform implementation tasks

## Implementation Tranche

1. Stop hardcoding `Porter App` as a default/fallback project name
2. Add explicit seed logic for `Launchpad`
3. Add starter project docs/artifacts
4. Detect and migrate legacy `Porter App` seed projects
5. Make Launchpad the first project every new tenant sees
