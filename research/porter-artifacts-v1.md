# Porter Artifacts V1

## Decision

Porter should not have a top-level `Files` product surface.

The current Files tab is a generic filesystem browser. That is useful as an operator utility, but it is not the right primary concept for a project-first orchestration product.

Porter should expose `Artifacts` as a project-scoped concept instead.

## Why Files Is Wrong

`Files` describes storage mechanics.
`Artifacts` describes work products and references.

Porter users care about:
- what belongs to a project
- what was created by a worker
- what documents, screenshots, specs, and deliverables matter
- what should be reviewed, reused, or handed off

They do not primarily care about:
- raw mount browsing
- arbitrary directories
- generic filesystem operations as a first-class product area

The current Files tab leaks implementation shape instead of product shape.

## Product Model

Top-level navigation should be:
- Agents
- Projects
- Models
- Runtime

Inside each project, Porter should own:
- Overview
- Activity
- Team
- Artifacts
- State
- Settings

`Artifacts` becomes the place for:
- uploads
- generated outputs
- screenshots
- specs
- briefs
- reference docs
- deliverables

## Two Different Things

Porter must distinguish:

### 1. Project Docs

Canonical project workspace records.

Examples:
- PROJECT.md
- PROJECT_BRIEF.md
- SUCCESS_CRITERIA.md
- DECISION_LOG.md
- RISKS_AND_GUARDRAILS.md

These are structured project references.

### 2. Artifacts

Files and media attached to or created for the project.

Examples:
- screenshots
- PDFs
- exported plans
- designs
- generated reports
- uploaded source documents
- deliverable bundles

These are not the same as workspace docs.

If Porter collapses them together, the UI becomes misleading again.

## Recommended IA

### Public

No top-level `Files`.

Projects detail includes:
- `Artifacts`
  - uploaded
  - generated
  - references
  - previews
  - source/creator metadata

### Internal / Advanced

Keep a raw file browser only as an internal/operator utility.

It can survive behind:
- advanced settings
- admin/runtime tools
- hidden/internal route

But it should not sit in the primary product navigation.

## Artifact Data Model

Artifacts should be first-class records, not just paths:

- id
- project_id
- title
- filename
- path
- mime_type
- kind: image | doc | brief | spec | deliverable | export | dataset | other
- source: upload | porter | worker | import
- created_by
- created_at
- status: active | archived | approved
- tags
- summary
- preview_ready

## V1 Build Strategy

### Step 1

Remove top-level Files from public navigation.

### Step 2

Alias old Files route into Projects for compatibility.

### Step 3

Add a real `artifacts/` directory under each project workspace.

### Step 4

Expose a project `Artifacts` tab that shows:
- artifact files from `artifacts/`
- project docs separately as `Project Docs`

### Step 5

Leave raw filesystem browsing as hidden internal functionality until Porter actually needs a public artifact browser outside projects.

## V1 Honesty Rule

Do not call workspace docs "artifacts."
Do not call a filesystem browser "project memory."
Do not expose storage plumbing as product IA.

Porter should be opinionated:

Projects own artifacts.
Artifacts support the work.
Raw files are an implementation detail.
