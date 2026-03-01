# Checkpoint — DEPRECATED
# This file is no longer the source of truth for task state.
# All tasks are now tracked in runtime/task-registry/*.json
# This file is kept for historical reference only.
# Last migrated: 2026-03-01 10:38:47 UTC
#
# Checkpoint
project: Porter
task: v0.25.8 — Chat overhaul, Model Routing, UX fixes
status: in_progress
step: 1 of 7
completed:
  - [ ] Fix A: Remove ? help buttons from tab headers
  - [ ] Fix C: Files tab right pane
  - [ ] Patch 1: Merge Bridge Control into Chat + fix input to bottom
  - [ ] Patch 2: Model ranking + routing mode
  - [ ] Patch 3: Remove "Used by" from model cards
  - [ ] Patch 4: Workflows cleanup + version bump
  - [ ] Verify: Test all changes
next_action: Fix A — remove tab help buttons
modified_files:
  - /home/lobster/documents/porter/porter.py
  - /home/lobster/documents/projects.md
notes: |
  Moe changed mind: keep "Chat" label (not "Bridge Control").
  But still merge dispatch bar + runs from Orchestration into Chat tab.
  Fix chat input to bottom of screen (like ChatGPT/Claude web).
