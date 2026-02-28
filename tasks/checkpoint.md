# Checkpoint — DEPRECATED
# This file is no longer the source of truth for task state.
# All tasks are now tracked in runtime/task-registry/*.json
# This file is kept for historical reference only.
# Last migrated: 2026-02-28 15:08:35 UTC
#
# Checkpoint
project: Porter
task: Gap tasks — Skills CRUD complete, remaining gaps pending
status: paused
step: 1 of N
completed:
  - [x] v0.14.22 — Fix Early Sprints sort order (JS falsy bug), remove Skills from Extensions
  - [x] v0.15.0 — Sprint 10: Workflows tab (50 skills, cron viewer), nav reorder, project start date fix
  - [x] v0.15.1 — Sprint 11: Real agent connectivity test (HTTP roundtrip, latency modal, multi-protocol)
  - [x] v0.15.2 — Gap: Skills CRUD (installed/all filter, remove skill, create manual skill, POST /api/openclaw/skills)
  - [x] All governance docs updated (RELEASE_NOTES, SPRINT_PLAN, projects.md, task registry, MEMORY.md)
  - [ ] Gap: session memory flush
  - [ ] Gap: local model detection
  - [ ] Gap: workflow creation tool
  - [ ] Sprint 12 — Onboarding wizard (FINAL)
next_action: Pick next gap task (session memory flush, local model detection, or workflow creation tool)
modified_files:
  - /home/lobster/documents/porter/porter.py
  - /home/lobster/documents/porter/runtime/task-registry/eb42638a-88b6-4d25-96b7-4a6680b66596.json
  - /home/lobster/documents/porter/porter_config.json
  - /home/lobster/documents/porter/SPRINT_PLAN.md
  - /home/lobster/documents/porter/RELEASE_NOTES.md
  - /home/lobster/documents/projects.md
notes: |
  Skills CRUD shipped as v0.15.2. Features: installed/all filter toggle (default installed only),
  remove skill with confirm dialog, create manual skill form, POST /api/openclaw/skills backend
  with remove/create actions, shutil.which() install status detection.
  Remaining gap tasks: session memory flush, local model detection, workflow creation tool.
  Sprint 12 (onboarding wizard) is absolute LAST — don't schedule until all gaps filled.
