# Checkpoint
project: porter
task: Sprint 6 — Tranche G1d: Fold tasks into Projects accordion
status: complete
step: 6 of 6
completed:
  - [x] TASKS_REGISTRY_DIR + _treg globals + _treg_load()/_treg_save() — persistent JSON storage
  - [x] GET /api/task-registry (list with filters + single by path)
  - [x] POST /api/task-registry (create, update_status, assign, complete, fail, cancel, add_result, claim, delete)
  - [x] Tasks nav item added to sidebar (G1b)
  - [x] Full UX redesign (G1c): row layout, no tabs, no instruction text, Done collapsed, pill priority selector
  - [x] G1d: Tasks folded into Projects accordion — no separate Tasks nav, project = directory row, task = file row inside
next_action: Begin Sprint 7 — Tranche G2: Task routing engine + cross-agent dispatch (v0.14.5+)
modified_files:
  - /home/lobster/documents/porter/porter.py
  - /home/lobster/documents/porter/RELEASE_NOTES.md
  - /home/lobster/documents/porter/tasks/checkpoint.md
notes: |
  Porter now at v0.14.4.
  Key design decisions locked in:
  - Tasks are project-scoped (project_name denormalized for self-contained records)
  - Tasks live inside Projects panel accordion — no separate Tasks tab
  - Legacy projects.md projects shown with "Add to registry" migration button
  - Inbox section for unassigned tasks
  - Done tasks collapsed per project row
  Sprint 7 (G2) adds: routing engine (capability matching), agent work queue polling,
  cross-client intake token, active dispatch via PEP/1.
