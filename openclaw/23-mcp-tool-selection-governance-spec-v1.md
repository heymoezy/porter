# Porter MCP Tool-Selection Governance Spec v1

## Context
In MCP-style ecosystems, agents dynamically choose tools. If selection logic is opaque, users lose visibility and control, and default tools can become invisible gatekeepers.

Porter should make tool selection transparent, configurable, and auditable.

## Objective
Add a first-class "Tool Selection" control surface so Porter acts as the user-governed selection layer (not a hidden auto-router).

---

## 1) Tool Registry (UI + API)
Create a top-level Tool Registry module.

### Required fields per tool/integration
- Tool name
- Provider/source
- Capability tags (search, code, messaging, storage, etc.)
- Cost profile (metered/unmetered/unknown)
- Trust tier (trusted/restricted/experimental)
- Enabled status
- Health/status

### Required controls
- enable/disable tool
- set trust tier
- set hard deny for sensitive scopes
- set preferred tools by capability

---

## 2) Selection Policy Engine (user-configurable)
Expose selection parameters in UI (no hardcoded hidden rules).

### Required policy controls
- Strategy mode: cost-first / quality-first / speed-first / balanced / local-first
- Allowed providers list
- Denied providers list
- Capability-level preferred order
- Confidence threshold to auto-select
- Fallback order when primary fails
- Budget guardrails (per task/day/window)
- Limit behavior (pause/escalate/fallback/manual approval)

### Required policy scopes
- global default
- workspace override
- task-level override

---

## 3) Selection Explainability (per task)
For every routed tool call, show:
- selected tool
- reason code(s) (policy match, cost, availability, capability fit)
- alternatives considered (at least top 2 where available)
- why alternatives were not chosen

Add an "Effective Selection Policy" panel in task detail.

---

## 4) Approval modes
Support progressive control modes:
1. Auto (fully policy-driven)
2. Guided (auto with user-visible rationale + optional override)
3. Manual (user must confirm tool before execution)

Allow mode by scope (global/workspace/task).

---

## 5) Audit + observability
Persist auditable events for tool-selection lifecycle:
- policy_used
- candidate_tools
- selected_tool
- override_applied
- fallback_triggered
- failure_reason
- cost/usage impact snapshot

Expose in Audit UI and task timeline.

---

## 6) UX placement (IA alignment)
Add top-level nav item:
- **Tools** (registry + policy + selection analytics)

Do not bury this in Settings.
Settings remains account/security/admin scope.

---

## 7) Safety defaults
Default posture:
- deny unknown tools by default for sensitive capabilities
- require explicit enable for experimental tools
- show clear warning before enabling untrusted tools
- preserve backward compatibility for existing configured tools

---

## 8) Acceptance criteria
1. Users can see and control which tools are eligible for selection.
2. Per-task selection decision is explainable.
3. Users can switch between auto/guided/manual selection modes.
4. Tool selection events are auditable and queryable.
5. No hidden hardcoded routing for configurable behavior.
6. No regressions to existing task execution flows.

---

## 9) Delivery requirements
1. grouped commits
2. changed files list
3. screenshots (Tools registry, Policy panel, Task explainability, Approval modes)
4. regression + new tests with command outputs
5. version bump + changelog + migration notes
