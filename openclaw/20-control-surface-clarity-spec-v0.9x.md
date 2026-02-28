# Porter v0.9.x Control Surface Clarity Spec

## Goal
Make orchestration understandable and controllable by exposing runtime/model realities, limits, scheduling, memory policies, and agent lifecycle in UI.

## 1) Agent clarity model (replace single cloud/local label)
Use two explicit dimensions on every agent card:

1. Runtime Location
- Local machine
- Remote node (e.g., VPS, Mac mini)
- Edge (future)

2. Model Source
- Cloud API (metered)
- Local model (unmetered)

### Required UI fields per agent
- Runtime: <location>
- Model: <source>
- Model ID: <provider/model>
- Limit Type: token window | rate limit | none
- Status: healthy | degraded | exhausted
- Reset ETA (if metered)

## 2) Agent lifecycle/type hygiene
Test and ephemeral agents should not pollute production views.

### Required fields
- Agent Type: production | system | test | ephemeral
- Parent Agent (if subagent)
- Spawn Source: manual | task | cron | system

### Required behavior
- Default filter: show production only
- Toggle: “Show system/test/ephemeral”
- Bulk archive/delete for test agents
- Clear subagent linkage in UI

## 3) Task Operations explainability
Current stalled state is ambiguous.

### Required improvements
- Add status legend/tooltip for all task states
- Show agent owner on each task row
- For stalled tasks, surface reason code:
  - heartbeat_timeout
  - waiting_for_input
  - concurrency_blocked
  - provider_limit_exhausted
  - dependency_blocked
- Show “last heartbeat” and “last transition” timestamps

## 4) Locations UX terminology and behavior
Internal model can stay node/mount, but user-facing UX should read “Locations.”

### Required
- Rename “Nodes & Mounts” tab label to “Locations”
- Keep hierarchical behavior:
  - Location (machine)
  - Paths (mounts) under location
- Allow custom display name + technical subtitle
  - Example title: HostingerVPS
  - subtitle: srv1379868
- Correct type labels so VPS is not shown as “Local machine”

## 5) Cron jobs as first-class controls
Expose scheduling as visible operations.

### Required cron UI
- Job list: name, schedule, next run, enabled, target
- Last run status + summary
- Create/edit/enable/disable/delete
- Audit fields: created_by, updated_by, timestamps

## 6) Memory/orchestration policy controls (no hidden hardcoding)
Expose optimization decisions as configurable parameters.

### Required “Orchestration Policy” panel
- Context compression: on/off + level
- Retrieval depth/window
- Checkpoint frequency
- Fallback chain (cloud↔local routing order)
- Spend/usage guardrails
- Limit behavior (pause/escalate/fallback)

### Per-task transparency
Show “Effective Policy” on each task:
- selected preset
- key overrides applied
- reason task routed to current agent

## 7) Presets evolution
Current presets exist; now tie to visible controls.

### Required
- Show what each preset changes
- Allow duplicate/edit custom preset
- Keep default as Balanced
- Persist selection per workspace/user preference as designed

## 8) Delivery and acceptance

## Required deliverables
1. commits grouped by section above
2. changed files list
3. screenshots for Agents, Tasks, Locations, Cron, Policy
4. tests run with command outputs
5. version bump + changelog

## Required acceptance criteria
- No regressions in file manager, auth, existing task lifecycle
- Backward compatibility maintained for existing locations/tasks APIs
- Audit log coverage for privileged actions
- UI copy consistency across sidebar, tabs, cards, forms
