---
phase: 40-gateway-capability-registry
plan: 02
subsystem: api
tags: [bridge, dispatch, capabilities, tool-filtering, gateway-routing, fastify]

# Dependency graph
requires:
  - phase: 40-gateway-capability-registry/40-01
    provides: GatewayCapabilityRecord, GATEWAY_CAPABILITY_REGISTRY, normalizeCapabilities, filterToolsBySupport, getLegacyTags

provides:
  - Capability-aware gateway auto-selection with required_strengths and cost_tier_max parameters
  - Dynamic tool filtering per gateway tool_support level (full/limited/none)
  - CLI --allowedTools flag passthrough for claude_cli
  - Admin bridge endpoint returns capability_tags[] and capability_record for backward-compatible frontend display

affects:
  - bridge-dispatch
  - admin-bridge-panel
  - task-executor
  - http-task-executor

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "COST_TIER_RANK map for budget-ceiling filtering: premium=2, standard=1, budget=0"
    - "Graceful capability degradation: if no gateway matches filters, fall back to full candidate list"
    - "toolSupport flows from DB capabilities → tasks.ts → executor → tool definitions sent to model"

key-files:
  created: []
  modified:
    - backend/src/routes/v1/tasks.ts
    - backend/src/services/bridge/http-task-executor.ts
    - backend/src/services/bridge/task-executor.ts
    - backend/src/routes/admin/bridge.ts

key-decisions:
  - "normalizeCapabilities called on every gateway row in auto-select path — cheap since it's just a type check"
  - "Graceful degradation: capability filter only applies if result is non-empty — avoids 503 when no exact match"
  - "admin/backend/src/routes/bridge.ts is legacy dead code — active file is backend/src/routes/admin/bridge.ts"
  - "toolSupport default is 'full' throughout — unstructured/legacy gateways behave unchanged"

patterns-established:
  - "toolSupport flows as string through runTaskInBackground, cast to typed union at point of use"
  - "filterToolsBySupport used in http-task-executor to gate tool definitions before each fetch round"
  - "normalizeGatewayCapabilities in admin bridge.ts is a pure transform — not imported from capability-registry to avoid cross-package deps"

requirements-completed: [GWC-02, GWC-03, GWC-04]

# Metrics
duration: 8min
completed: 2026-04-03
---

# Phase 40 Plan 02: Capability-Aware Dispatch and Tool Filtering Summary

**Capability-based gateway routing with required_strengths/cost_tier_max params, dynamic PORTER_TOOLS filtering per gateway tool_support level, and backward-compatible admin bridge capability display**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-03T09:27:08Z
- **Completed:** 2026-04-03T09:34:31Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- tasks.ts auto-select now filters gateways by required_strengths and cost_tier_max before priority selection, with graceful fallback to full list
- http-task-executor.ts dynamically filters PORTER_TOOLS via filterToolsBySupport — ollama gets only read_file + list_directory, gateways with tool_support='none' get no tools
- task-executor.ts buildTaskArgs accepts tools[] and appends --allowedTools for claude_cli; gemini_cli and codex_cli left unchanged with comments noting they lack per-tool filtering
- Admin bridge GET response now includes capability_tags (string[]) and capability_record (structured JSONB or null) alongside raw capabilities

## Task Commits

1. **Tasks 1+2: Capability-aware dispatch and dynamic tool filtering** - `6e4ac22` (feat)
2. **Task 3: Admin bridge backward-compatible capability display (wrong file)** - `a8b6b12` (feat)
3. **Task 3 fix: Apply to active admin bridge route** - `0bfd1a6` (fix)

## Files Created/Modified
- `backend/src/routes/v1/tasks.ts` - Imports normalizeCapabilities; reads required_strengths/cost_tier_max/tools from body; COST_TIER_RANK constant; capability filter in auto-select; toolSupport extracted and passed through; runTaskInBackground accepts toolSupport + tools
- `backend/src/services/bridge/http-task-executor.ts` - Imports filterToolsBySupport; toolSupport parameter with default 'full'; effectiveTools replaces PORTER_TOOLS in fetch body
- `backend/src/services/bridge/task-executor.ts` - buildTaskArgs accepts optional tools[]; claude_cli case appends --allowedTools; executeTask accepts tools[] and passes through
- `backend/src/routes/admin/bridge.ts` - normalizeGatewayCapabilities helper; gateways map spreads capability_tags and capability_record

## Decisions Made
- admin/backend/src/routes/bridge.ts is not the active file — discovered during verification when admin endpoint still lacked capability_tags. The actual file served is backend/src/routes/admin/bridge.ts. Applied fix via Rule 3 (blocking issue).
- toolSupport defaults to 'full' everywhere — ensures backward compatibility with any unstructured gateway rows that escaped migration
- normalizeGatewayCapabilities is duplicated in admin bridge.ts rather than imported from capability-registry.ts — admin/backend and backend/src have different module resolution paths

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong file edited for admin bridge capability normalization**
- **Found during:** Task 3 verification (admin bridge endpoint returned MISSING for capability_tags)
- **Issue:** Plan specified `admin/backend/src/routes/bridge.ts` but that file is legacy dead code. The active file registered in the Fastify server is `backend/src/routes/admin/bridge.ts`
- **Fix:** Applied the same normalizeGatewayCapabilities helper and gateways map change to the correct file
- **Files modified:** backend/src/routes/admin/bridge.ts
- **Verification:** curl to /api/admin/bridge showed capability_tags for all 5 gateways
- **Committed in:** 0bfd1a6

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, wrong file path in plan)
**Impact on plan:** Required to get the admin endpoint to actually return capability_tags. No scope creep.

## Issues Encountered
- The plan's `files_modified` frontmatter listed `admin/backend/src/routes/bridge.ts` — this file exists but is not served. The Fastify server registers routes from `backend/src/routes/admin/bridge.ts`. Both files now have the normalization applied.

## Next Phase Readiness
- Phase 40 complete: capability registry (Plan 01) + capability-aware dispatch (Plan 02) both shipped
- Dispatch routing is now intelligence-driven — callers can specify required_strengths and cost_tier_max
- Ollama automatically receives read-only tools; no manual config needed
- Admin bridge panel will not crash on structured capabilities

---
*Phase: 40-gateway-capability-registry*
*Completed: 2026-04-03*

## Self-Check: PASSED

- FOUND: backend/src/routes/v1/tasks.ts
- FOUND: backend/src/services/bridge/http-task-executor.ts
- FOUND: backend/src/services/bridge/task-executor.ts
- FOUND: backend/src/routes/admin/bridge.ts
- FOUND: .planning/phases/40-gateway-capability-registry/40-02-SUMMARY.md
- FOUND: 6e4ac22 (feat: capability-aware dispatch and dynamic tool filtering)
- FOUND: a8b6b12 (feat: admin bridge panel backward-compatible capability display)
- FOUND: 0bfd1a6 (fix: apply capability display normalization to the active admin bridge route)
