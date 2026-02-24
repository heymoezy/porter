# Implementation PRD for Claude Code

## Objective
Ship user-facing configuration and onboarding for locations + agents + permissions, without breaking existing file workflows.

## Must-have outcomes
1. No hardcoded-only setup for normal users.
2. Agent permissioning is visible in UI.
3. First-run wizard completes in under 5 minutes.
4. Uploads root is not forced in sidebar by default.

## Build phases

### Phase A: Data model and config
- Add structured config storage for:
  - locations
  - agents
  - permission policies
  - runtime/memory preferences
- Add migration from existing hardcoded `SERVE_DIRS`.
- Backward compatibility: if no config, initialize defaults.

### Phase B: Onboarding wizard
- Welcome -> Add location -> Connect agent -> Permissions -> Complete
- Include connection test actions.
- Persist partial progress.

### Phase C: Settings UI
- Tabs: Locations, Agents, Permissions, Memory, Runtime, Security
- Full CRUD for locations and agents
- Permission matrix editor

### Phase D: Runtime binding
- Ensure agent keys and permissions are enforced at endpoint level.
- Validate role + namespace before writes/finalize.

## API additions needed
- `GET /api/settings`
- `POST /api/settings`
- `GET /api/agents`
- `POST /api/agents`
- `POST /api/agents/rotate-key`
- `POST /api/permissions/check`

## Acceptance tests
- New install with empty config completes wizard and reaches usable state.
- Agent with Viewer cannot call write endpoints.
- Operator can checkpoint/finalize within allowed namespaces.
- Existing users still see prior locations after migration.

## Non-goals for this sprint
- full enterprise RBAC
- SSO
- multi-tenant org model
