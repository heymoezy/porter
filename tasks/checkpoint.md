# Checkpoint
project: porter
task: UI/UX implementation — locations, agents, permissions, onboarding wizard
status: in_progress
step: 1 of 5
completed:
  - [ ] Commit 1: Config data model + migration + backend API routes
  - [ ] Commit 2: Settings UI — Locations + Agents tabs
  - [ ] Commit 3: Onboarding wizard (first-run 5-step flow)
  - [ ] Commit 4: Permission enforcement + upload UX cleanup
  - [ ] Commit 5: Tests + version bump + migration notes
next_action: Commit 1 — extend config schema, dynamic SERVE_DIRS, add location/agent/preference API routes
modified_files:
  - /home/lobster/documents/porter/porter.py
notes: |
  Config additions (non-breaking):
    locations: [{id, label, type, path}] — migrated from SERVE_DIRS; uploads excluded from default seeding
    agents: [{id, name, type, key_hash, role, namespaces, created_at, last_seen}]
    preferences: {onboarding_complete, default_location, checkpoint_interval, lease_ttl, auto_resume}
  SERVE_DIRS becomes dynamic dict, repopulated on load and after settings changes.
  Agent key: sha256-hashed at rest; raw key returned once on creation only.
  New routes: GET/POST /api/locations, GET/POST /api/agents,
              POST /api/agents/revoke, POST /api/agents/rotate-key,
              GET/POST /api/preferences, POST /api/permissions/check,
              POST /api/locations/test
