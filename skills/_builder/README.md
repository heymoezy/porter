# Porter Skill Builder

This directory is the filesystem side of Porter's native skill engine.

## Design

Each skill lives in its own directory:

- `SKILL.md` — concise, human-readable contract
- `prompt.md` — detailed prompting / execution guide
- `meta/skill.json` — machine-readable metadata for builder + UI
- `guides/qa-checklist.md` — quality gates
- `examples/*.md` — example invocations and ideal outputs
- `assets/` — optional diagrams, fixtures, templates

## Source of truth

- DB row in `skills` table = registry / visibility / category / featured state
- Filesystem pack in `/home/lobster/projects/porter/skills/<skill-id>/` = actual skill artifact

## Current builder flow

POST `/api/admin/skills/builder/generate`

Creates or updates:

1. skill directory
2. core files
3. DB record in `skills`

## Next phase

- generate from natural-language brief
- repo import / cloning flow
- validation scoring
- skill inheritance / composition
- install to runtime surfaces
